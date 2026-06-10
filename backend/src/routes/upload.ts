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
import { Segment } from '../types';
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
    files: config.video.maxUploadCount,
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
    sourceVideoId: seg.sourceVideoId ?? undefined,
    sourceName: seg.sourceName ?? undefined,
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

function projectToApi(projectId: string) {
  const videos = db.getProjectVideos(projectId);
  const root = videos[0] ?? db.getVideo(projectId);
  if (!root) return null;

  return {
    ...videoToApi(root),
    videos: videos.map(videoToApi),
  };
}

function getUploadedFiles(req: Request): Express.Multer.File[] {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;

  const filesByField = req.files as
    | Record<string, Express.Multer.File[]>
    | undefined;
  return [
    ...(filesByField?.video || []),
    ...(filesByField?.videos || []),
  ];
}

async function removeFiles(files: Express.Multer.File[]): Promise<void> {
  await Promise.all(files.map((file) => fs.remove(file.path).catch(() => {})));
}

/**
 * POST /api/upload
 * Store the video (local + R2) and return its metadata. Splitting now
 * happens later, once the user has picked a template (POST /video/:id/split).
 */
router.post(
  '/upload',
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'videos', maxCount: config.video.maxUploadCount },
  ]),
  async (req: Request, res: Response) => {
  try {
    const files = getUploadedFiles(req);
    if (files.length === 0) {
      return res.status(400).json({ error: 'No video files uploaded' });
    }

    if (files.length > config.video.maxUploadCount) {
      await removeFiles(files);
      return res.status(400).json({
        error: `Too many videos. Max ${config.video.maxUploadCount} files allowed.`,
      });
    }

    const isMultiUpload = files.length > 1;
    if (isMultiUpload) {
      const oversized = files.find((file) => file.size > config.video.maxMultiVideoSizeBytes);
      if (oversized) {
        await removeFiles(files);
        return res.status(400).json({
          error:
            `多个视频上传时，每个视频不能超过 ${config.video.maxMultiVideoSizeBytes / 1024 / 1024}MB。` +
            `"${oversized.originalname}" 超出限制。`,
        });
      }
    }

    const projectId = uuidv4();
    console.log(`Processing upload project: ${projectId} (${files.length} videos)`);

    const metadataList = [];
    for (const file of files) {
      const metadata = await getVideoMetadata(file.path);
      const maxDuration = isMultiUpload
        ? config.video.maxMultiVideoDurationSeconds
        : config.video.maxDurationSeconds;
      if (metadata.duration > maxDuration) {
        await removeFiles(files);
        return res.status(400).json({
          error: isMultiUpload
            ? `多个视频上传时，每个视频不能超过 ${maxDuration} 秒。"${file.originalname}" 超出限制。`
            : `"${file.originalname}" is too long. Max ${maxDuration / 60} minutes allowed.`,
        });
      }
      metadataList.push(metadata);
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const metadata = metadataList[i];
      const videoId = i === 0 ? projectId : uuidv4();
      const ext = path.extname(file.originalname) || '.mp4';
      const localPath = path.join(config.paths.uploads, `${videoId}${ext}`);

      await fs.move(file.path, localPath);

      let thumbLocalPath: string | null = null;
      try {
        thumbLocalPath = await generateThumbnail(localPath);
      } catch (error) {
        console.warn(`Failed to generate poster thumbnail for "${file.originalname}":`, error);
      }

      const r2Key = await mirrorToR2(localPath, `uploads/${videoId}${ext}`, file.mimetype);
      const thumbR2Key = thumbLocalPath
        ? await mirrorToR2(
            thumbLocalPath,
            `thumbnails/${path.basename(thumbLocalPath)}`,
            'image/jpeg'
          )
        : null;

      db.insertVideo({
        id: videoId,
        projectId,
        originalName: file.originalname,
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        localPath,
        r2Key,
        thumbLocalPath,
        thumbR2Key,
      });

      console.log(`✓ Video stored: ${videoId} (R2: ${r2Key ? 'yes' : 'no'})`);
    }

    const project = projectToApi(projectId)!;
    res.json(project);
  } catch (error) {
    await removeFiles(getUploadedFiles(req));
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Failed to process video',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
  }
);

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

    const projectVideos = db.getProjectVideos(videoId);
    if (projectVideos.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Template-driven split constraints (fall back to global defaults)
    const minDuration = Math.max(
      1,
      template.segmentSelection.minDuration ?? config.video.minSegmentDuration
    );
    const maxDuration = Math.max(
      minDuration + 1,
      template.segmentSelection.maxDuration ?? config.video.maxSegmentDuration
    );
    const desiredSegments = template.segmentSelection.maxSegments ?? 8;
    const maxCandidateSegments = Math.min(
      config.video.maxSplitSegments,
      Math.max(desiredSegments, desiredSegments * 4)
    );
    const maxCandidatesPerVideo = Math.max(
      1,
      Math.ceil(maxCandidateSegments / projectVideos.length)
    );

    console.log(
      `Splitting project ${videoId} (${projectVideos.length} videos) for template "${templateId}" ` +
        `(${minDuration}-${maxDuration}s, up to ${maxCandidateSegments} candidates)`
    );

    const segments: Segment[] = [];
    for (const sourceVideo of projectVideos) {
      try {
        const inputPath = await ensureLocal(
          sourceVideo.localPath,
          sourceVideo.r2Key,
          config.paths.uploads
        );
        const sourceSegments = await smartSplit(inputPath, minDuration, maxDuration, {
          maxSegments: maxCandidatesPerVideo,
        });
        sourceSegments.forEach((seg) => {
          seg.sourceVideoId = sourceVideo.id;
          seg.sourceName = sourceVideo.originalName;
        });
        segments.push(...sourceSegments);
      } catch (error) {
        console.warn(
          `Failed to split source video "${sourceVideo.originalName}":`,
          error instanceof Error ? error.message : error
        );
      }
    }

    if (segments.length === 0) {
      return res.status(400).json({
        error: 'Failed to split video. Video may be too short or corrupted.',
      });
    }

    // Score segments with Ark (with concurrency control)
    console.log('Scoring segments with Ark...');
    const scores = await scoreSegments(
      segments.map((s) => s.path),
      config.ai.scoringConcurrency
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
        sourceVideoId: seg.sourceVideoId,
        sourceName: seg.sourceName,
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
  const project = projectToApi(videoId);

  if (!project) {
    return res.status(404).json({ error: 'Video not found' });
  }

  const segments = db.getSegmentsByVideo(videoId);
  res.json({
    ...project,
    templateId: segments[0]?.templateId ?? null,
    segments: segments.map(segmentToApi),
  });
});

export { router as uploadRouter };
