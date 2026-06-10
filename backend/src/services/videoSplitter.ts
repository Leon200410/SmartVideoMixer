import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import { Segment } from '../types';
import { getDuration, cutSegment, generateThumbnail } from './ffmpegUtils';
import config from '../config';

/**
 * Detect scene changes using FFmpeg
 */
async function detectScenes(
  inputPath: string,
  threshold: number = config.video.sceneDetectionThreshold
): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const scenes: number[] = [0];

    // metadata=print without file=- logs pts_time to stderr, which is what
    // fluent-ffmpeg's 'stderr' event captures (file=- would go to stdout).
    ffmpeg(inputPath)
      .outputOptions([
        '-vf',
        `select='gt(scene,${threshold})',metadata=print`,
        '-f',
        'null'
      ])
      .on('stderr', (line) => {
        const match = line.match(/pts_time:([\d.]+)/);
        if (match) {
          const time = parseFloat(match[1]);
          if (!isNaN(time)) {
            scenes.push(time);
          }
        }
      })
      .on('end', () => resolve(scenes))
      .on('error', reject)
      .output('-')
      .run();
  });
}

/**
 * Create a video segment
 */
async function createSegment(
  inputPath: string,
  start: number,
  end: number
): Promise<Segment> {
  const id = `seg_${Date.now()}_${uuidv4().substring(0, 8)}`;
  const outputPath = path.join(config.paths.segments, `${id}.mp4`);

  await cutSegment(inputPath, start, end, outputPath);
  const thumbnail = await generateThumbnail(outputPath);

  return {
    id,
    path: outputPath,
    start,
    end,
    duration: end - start,
    thumbnail,
  };
}

/**
 * Split a (possibly over-long) chunk evenly into parts no longer than maxDuration
 */
async function createSegmentsEvenly(
  inputPath: string,
  start: number,
  end: number,
  maxDuration: number
): Promise<Segment[]> {
  const duration = end - start;
  const numParts = Math.max(1, Math.ceil(duration / maxDuration));
  const partDuration = duration / numParts;

  const parts: Segment[] = [];
  for (let j = 0; j < numParts; j++) {
    const partStart = start + j * partDuration;
    const partEnd = Math.min(partStart + partDuration, end);
    parts.push(await createSegment(inputPath, partStart, partEnd));
  }
  return parts;
}

/**
 * Smart video splitting based on scene detection
 */
export async function smartSplit(
  inputPath: string,
  minDuration: number = config.video.minSegmentDuration,
  maxDuration: number = config.video.maxSegmentDuration
): Promise<Segment[]> {
  console.log('Starting smart split...');

  const totalDuration = await getDuration(inputPath);
  console.log(`Video duration: ${totalDuration}s`);

  const sceneChanges = await detectScenes(inputPath);
  console.log(`Detected ${sceneChanges.length} scene changes`);

  const segments: Segment[] = [];
  let currentStart = 0;

  for (let i = 1; i < sceneChanges.length; i++) {
    const sceneTime = sceneChanges[i];
    const duration = sceneTime - currentStart;

    if (duration >= minDuration) {
      segments.push(
        ...(await createSegmentsEvenly(inputPath, currentStart, sceneTime, maxDuration))
      );
      currentStart = sceneTime;
    }
  }

  // Handle the last segment (also enforce maxDuration here, e.g. when the
  // video has no detected scene changes at all)
  if (currentStart < totalDuration) {
    const remaining = totalDuration - currentStart;
    if (remaining >= minDuration / 2) {
      segments.push(
        ...(await createSegmentsEvenly(inputPath, currentStart, totalDuration, maxDuration))
      );
    } else if (segments.length > 0) {
      // Merge with last segment
      const last = segments.pop()!;
      segments.push(await createSegment(inputPath, last.start, totalDuration));
      // Clean up old segment
      await fs.remove(last.path);
      await fs.remove(last.thumbnail);
    }
  }

  console.log(`Created ${segments.length} segments`);
  return segments;
}

export { detectScenes, createSegment };
