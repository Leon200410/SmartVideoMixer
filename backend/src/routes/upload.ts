import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import config from '../config';
import { getVideoMetadata, generateThumbnail } from '../services/ffmpegUtils';
import { smartSplit } from '../services/videoSplitter';
import { scoreSegments } from '../services/aiAnalyzer';
import { mirrorToR2, ensureLocal, resolveUrl } from '../services/storage';
import { templateRegistry } from '../templates/registry';
import * as db from '../db';

const router = Router();

// Configure multer for temporary file upload
const storage = multer.diskStorage({
  destination: config.paths.temp,
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.video.maxSizeBytes,
  },
  fileFilter: (req, file, cb) => {
    if (config.video.allowedFormats.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Only mp4, mov, avi allowed.'));
    }
  },
});

function segmentToApi(seg: db.SegmentRow) {
  return {
    id: seg.id,
    start: seg.startTime,
    end: seg.endTime,
    duration: seg.duration,
    thumbnailUrl: resolveUrl(
      seg.thumbR2Key,
      `/api/thumbnail/${path.basename(seg.thumbLocalPath || '')}`
    ),
    geminiScore: seg.score ?? undefined,
    geminiReason: seg.reason ?? undefined,
  };
}

function videoToApi(video: db.VideoRow) {
  return {
    videoId: video.id,
    originalName: video.originalName,
    duration: video.duration,
    width: video.width,
    height: video.height,
    previewUrl: resolveUrl(
      video.r2Key,
      `/api/stream/${path.basename(video.localPath || '')}`
    ),
    thumbnailUrl: resolveUrl(
      video.thumbR2Key,
      `/api/thumbnail/${path.basename(video.thumbLocalPath || '')}`
    ),
  };
}

/**
 * POST /api/upload
 * Store the video (local + R2) and return its metadata. Splitting now
 * happens later, once the user has picked a template (POST /video/:id/split).
 */
router.post('/upload', upload.single('video'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const tempVideoPath = req.file.path;
    const videoId = uuidv4();

    console.log(`Processing upload: ${videoId}`);

    const metadata = await getVideoMetadata(tempVideoPath);

    if (metadata.duration > config.video.maxDurationSeconds) {
      await fs.remove(tempVideoPath);
      return res.status(400).json({
        error: `Video too long. Max ${config.video.maxDurationSeconds / 60} minutes allowed.`,
      });
    }

    // Move into the uploads dir under a stable name
    const ext = path.extname(req.file.originalname) || '.mp4';
    const localPath = path.join(config.paths.uploads, `${videoId}${ext}`);
    await fs.move(tempVideoPath, localPath);

    // Poster thumbnail for the upload preview
    let thumbLocalPath: string | null = null;
    try {
      thumbLocalPath = await generateThumbnail(localPath);
    } catch (error) {
      console.warn('Failed to generate poster thumbnail:', error);
    }

    // Mirror to R2 (graceful: returns null when disabled or failed)
    const r2Key = await mirrorToR2(localPath, `uploads/${videoId}${ext}`, req.file.mimetype);
    const thumbR2Key = thumbLocalPath
      ? await mirrorToR2(
          thumbLocalPath,
          `thumbnails/${path.basename(thumbLocalPath)}`,
          'image/jpeg'
        )
      : null;

    db.insertVideo({
      id: videoId,
      originalName: req.file.originalname,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      localPath,
      r2Key,
      thumbLocalPath,
      thumbR2Key,
    });

    const video = db.getVideo(videoId)!;
    console.log(`✓ Video stored: ${videoId} (R2: ${r2Key ? 'yes' : 'no'})`);
    res.json(videoToApi(video));
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Failed to process video',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/video/:videoId/split
 * Split the video into segments using the chosen template's segment-duration
 * constraints, then score each segment with Ark.
 */
router.post('/video/:videoId/split', async (req: Request, res: Response) => {
  try {
    const { videoId } = req.params;
    const { templateId } = req.body as { templateId?: string };

    if (!templateId) {
      return res.status(400).json({ error: 'Missing required field: templateId' });
    }

    const template = templateRegistry.get(templateId);
    if (!template) {
      return res.status(400).json({
        error: `Invalid template: ${templateId}. Available templates: ${templateRegistry.getAllIds().join(', ')}`,
      });
    }

    const video = db.getVideo(videoId);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Make sure the original video is on local disk (restore from R2 if needed)
    const inputPath = await ensureLocal(video.localPath, video.r2Key, config.paths.uploads);

    // Template-driven split constraints (fall back to global defaults)
    const minDuration = Math.max(
      1,
      template.segmentSelection.minDuration ?? config.video.minSegmentDuration
    );
    const maxDuration = Math.max(
      minDuration + 1,
      template.segmentSelection.maxDuration ?? config.video.maxSegmentDuration
    );

    console.log(
      `Splitting video ${videoId} for template "${templateId}" (${minDuration}-${maxDuration}s)`
    );
    const segments = await smartSplit(inputPath, minDuration, maxDuration);

    if (segments.length === 0) {
      return res.status(400).json({
        error: 'Failed to split video. Video may be too short or corrupted.',
      });
    }

    // Score segments with Ark (with concurrency control)
    console.log('Scoring segments with Ark...');
    const scores = await scoreSegments(
      segments.map((s) => s.path),
      3
    );
    segments.forEach((seg, idx) => {
      seg.geminiScore = scores[idx].score;
      seg.geminiReason = scores[idx].reason;
    });

    // Mirror segments + thumbnails to R2
    const r2Keys: Array<{ seg: string | null; thumb: string | null }> = [];
    for (const seg of segments) {
      const segKey = await mirrorToR2(
        seg.path,
        `segments/${path.basename(seg.path)}`,
        'video/mp4'
      );
      const thumbKey = await mirrorToR2(
        seg.thumbnail,
        `thumbnails/${path.basename(seg.thumbnail)}`,
        'image/jpeg'
      );
      r2Keys.push({ seg: segKey, thumb: thumbKey });
    }

    // Replace previous split (if any) in DB and clean up its files
    const oldSegments = db.getSegmentsByVideo(videoId);
    db.replaceSegments(
      videoId,
      templateId,
      segments.map((seg, idx) => ({
        id: seg.id,
        seq: idx,
        startTime: seg.start,
        endTime: seg.end,
        duration: seg.duration,
        localPath: seg.path,
        r2Key: r2Keys[idx].seg,
        thumbLocalPath: seg.thumbnail,
        thumbR2Key: r2Keys[idx].thumb,
        score: seg.geminiScore ?? null,
        reason: seg.geminiReason ?? null,
      }))
    );
    for (const old of oldSegments) {
      if (old.localPath) await fs.remove(old.localPath).catch(() => {});
      if (old.thumbLocalPath) await fs.remove(old.thumbLocalPath).catch(() => {});
    }

    const rows = db.getSegmentsByVideo(videoId);
    console.log(`✓ Split complete: ${rows.length} segments`);
    res.json({
      videoId,
      templateId,
      segments: rows.map(segmentToApi),
    });
  } catch (error) {
    console.error('Split error:', error);
    res.status(500).json({
      error: 'Failed to split video',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/video/:videoId
 * Video metadata + current segments (from the database, restart-safe)
 */
router.get('/video/:videoId', (req: Request, res: Response) => {
  const { videoId } = req.params;
  const video = db.getVideo(videoId);

  if (!video) {
    return res.status(404).json({ error: 'Video not found' });
  }

  const segments = db.getSegmentsByVideo(videoId);
  res.json({
    ...videoToApi(video),
    templateId: segments[0]?.templateId ?? null,
    segments: segments.map(segmentToApi),
  });
});

export { router as uploadRouter };
