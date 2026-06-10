import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import { GenerateRequest, Segment } from '../types';
import { generateThumbnail, getDuration } from '../services/ffmpegUtils';
import { mirrorToR2, resolveUrl } from '../services/storage';
import { templateRegistry } from '../templates/registry';
import { generateFromTemplate } from '../templates/generator';
import { sampleExists } from '../services/sampleGenerator';
import * as db from '../db';
import config from '../config';

const router = Router();

export function generationToApi(gen: db.GenerationRow & { videoName?: string }) {
  return {
    generationId: gen.id,
    videoId: gen.videoId,
    videoName: gen.videoName,
    templateId: gen.templateId,
    title: gen.title,
    aspectRatio: gen.aspectRatio,
    status: gen.status,
    error: gen.error ?? undefined,
    duration: gen.duration ?? undefined,
    createdAt: gen.createdAt,
    videoUrl: gen.localPath
      ? `/api/download/${path.basename(gen.localPath)}`
      : undefined,
    streamUrl: gen.localPath
      ? resolveUrl(gen.r2Key, `/api/stream/${path.basename(gen.localPath)}`)
      : undefined,
    thumbnailUrl: gen.thumbLocalPath
      ? resolveUrl(gen.thumbR2Key, `/api/thumbnail/${path.basename(gen.thumbLocalPath)}`)
      : undefined,
  };
}

/**
 * POST /api/generate
 * Generate final video from segments using template system.
 * Every run is recorded in the generations table (history).
 */
router.post('/generate', async (req: Request, res: Response) => {
  const {
    videoId,
    template: templateId,
    aspectRatio,
    segmentOrder,
  }: GenerateRequest = req.body;

  // Validate input
  if (!videoId || !templateId || !aspectRatio) {
    return res.status(400).json({
      error: 'Missing required fields: videoId, template, aspectRatio',
    });
  }

  if (!['9:16', '16:9'].includes(aspectRatio)) {
    return res.status(400).json({
      error: 'Invalid aspectRatio. Must be "9:16" or "16:9"',
    });
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

  const segmentRows = db.getSegmentsByVideo(videoId);
  if (segmentRows.length === 0) {
    return res.status(400).json({
      error: 'No segments found for this video. Run /api/video/:id/split first.',
    });
  }

  const segments: Segment[] = segmentRows.map((row) => ({
    id: row.id,
    path: row.localPath || '',
    start: row.startTime,
    end: row.endTime,
    duration: row.duration,
    thumbnail: row.thumbLocalPath || '',
    r2Key: row.r2Key,
    sourceVideoId: row.sourceVideoId,
    sourceName: row.sourceName,
    geminiScore: row.score ?? undefined,
    geminiReason: row.reason ?? undefined,
  }));

  // Record this run in history before starting
  const generationId = uuidv4();
  db.insertGeneration({
    id: generationId,
    videoId,
    templateId,
    title: template.name,
    aspectRatio,
  });

  try {
    console.log(`Generating video with template: ${template.name} (${templateId})`);

    const outputPath = await generateFromTemplate(template, {
      segments,
      aspectRatio,
      customOrder: segmentOrder,
    });

    const thumbnail = await generateThumbnail(outputPath);
    const duration = await getDuration(outputPath);

    // Mirror result to R2 so history survives local cleanup
    const r2Key = await mirrorToR2(
      outputPath,
      `results/${path.basename(outputPath)}`,
      'video/mp4'
    );
    const thumbR2Key = await mirrorToR2(
      thumbnail,
      `thumbnails/${path.basename(thumbnail)}`,
      'image/jpeg'
    );

    db.completeGeneration(generationId, {
      duration,
      localPath: outputPath,
      r2Key,
      thumbLocalPath: thumbnail,
      thumbR2Key,
    });

    const gen = db.getGeneration(generationId)!;
    console.log(`✓ Generation complete: ${generationId}`);
    res.json(generationToApi(gen));
  } catch (error) {
    console.error('Generate error:', error);
    db.failGeneration(
      generationId,
      error instanceof Error ? error.message : 'Unknown error'
    );
    res.status(500).json({
      error: 'Failed to generate video',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/templates
 * All available templates, with sample-video URLs when available
 */
router.get('/templates', (req: Request, res: Response) => {
  const templates = templateRegistry.getAll().map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    tag: t.tag,
    sampleUrl: sampleExists(t.id) ? `/api/templates/${t.id}/sample` : null,
  }));

  res.json({ templates });
});

/**
 * GET /api/templates/:id/sample
 * Short auto-generated demo clip showing the template's style
 */
router.get('/templates/:id/sample', async (req: Request, res: Response) => {
  const templateId = path.basename(req.params.id);
  const samplePath = path.join(config.paths.samples, `${templateId}.mp4`);

  if (!templateRegistry.has(templateId) || !(await fs.pathExists(samplePath))) {
    return res.status(404).json({ error: 'Sample not found' });
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(samplePath);
});

export { router as generateRouter };
