import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Segment } from '../types';
import { getDuration, cutSegment, generateThumbnail } from './ffmpegUtils';
import config from '../config';

/**
 * Detect scene changes using FFmpeg
 */
async function detectScenes(
  inputPath: string,
  threshold: number = config.video.sceneDetectionThreshold,
  minGap: number = 1,
  scanFps: number = config.video.sceneDetectionFps
): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const scenes: number[] = [0];
    let lastScene = 0;

    // metadata=print without file=- logs pts_time to stderr, which is what
    // fluent-ffmpeg's 'stderr' event captures (file=- would go to stdout).
    // Downscale + low-fps scan keeps long videos from spending minutes on
    // scene detection before any useful work starts.
    ffmpeg(inputPath)
      .outputOptions([
        '-vf',
        `scale=360:-2:force_original_aspect_ratio=decrease,fps=${scanFps},select='gt(scene,${threshold})',metadata=print`,
        '-an',
        '-f',
        'null'
      ])
      .on('stderr', (line) => {
        const match = line.match(/pts_time:([\d.]+)/);
        if (match) {
          const time = parseFloat(match[1]);
          if (!isNaN(time) && time - lastScene >= minGap) {
            scenes.push(time);
            lastScene = time;
          }
        }
      })
      .on('end', () => resolve(scenes))
      .on('error', reject)
      .output('-')
      .run();
  });
}

interface SplitOptions {
  maxSegments?: number;
}

interface SegmentRange {
  start: number;
  end: number;
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
function createSegmentsEvenly(
  start: number,
  end: number,
  maxDuration: number
): SegmentRange[] {
  const duration = end - start;
  const numParts = Math.max(1, Math.ceil(duration / maxDuration));
  const partDuration = duration / numParts;

  const parts: SegmentRange[] = [];
  for (let j = 0; j < numParts; j++) {
    const partStart = start + j * partDuration;
    const partEnd = Math.min(partStart + partDuration, end);
    parts.push({ start: partStart, end: partEnd });
  }
  return parts;
}

function capRangesEvenly(ranges: SegmentRange[], maxSegments: number): SegmentRange[] {
  if (ranges.length <= maxSegments) return ranges;
  if (maxSegments <= 1) return [ranges[0]];

  const selected: SegmentRange[] = [];
  const used = new Set<number>();
  const step = (ranges.length - 1) / (maxSegments - 1);

  for (let i = 0; i < maxSegments; i++) {
    const idx = Math.round(i * step);
    if (!used.has(idx)) {
      selected.push(ranges[idx]);
      used.add(idx);
    }
  }

  return selected;
}

/**
 * Smart video splitting based on scene detection
 */
export async function smartSplit(
  inputPath: string,
  minDuration: number = config.video.minSegmentDuration,
  maxDuration: number = config.video.maxSegmentDuration,
  options: SplitOptions = {}
): Promise<Segment[]> {
  console.log('Starting smart split...');

  const totalDuration = await getDuration(inputPath);
  console.log(`Video duration: ${totalDuration}s`);

  const minSceneGap = Math.max(1, Math.min(minDuration * 0.6, 3));
  const maxSegments = Math.max(1, options.maxSegments || config.video.maxSplitSegments);
  let sceneChanges: number[];
  try {
    sceneChanges = await detectScenes(
      inputPath,
      config.video.sceneDetectionThreshold,
      minSceneGap
    );
  } catch (error) {
    console.warn(
      'Scene detection failed, falling back to even split:',
      error instanceof Error ? error.message : error
    );
    sceneChanges = [0];
  }
  console.log(`Detected ${sceneChanges.length} scene changes`);

  const ranges: SegmentRange[] = [];
  let currentStart = 0;

  for (let i = 1; i < sceneChanges.length; i++) {
    const sceneTime = sceneChanges[i];
    if (sceneTime <= currentStart || sceneTime >= totalDuration) continue;

    const duration = sceneTime - currentStart;

    if (duration >= minDuration) {
      ranges.push(...createSegmentsEvenly(currentStart, sceneTime, maxDuration));
      currentStart = sceneTime;
    }
  }

  // Handle the last segment (also enforce maxDuration here, e.g. when the
  // video has no detected scene changes at all)
  if (currentStart < totalDuration) {
    const remaining = totalDuration - currentStart;
    if (remaining >= minDuration / 2) {
      ranges.push(...createSegmentsEvenly(currentStart, totalDuration, maxDuration));
    } else if (ranges.length > 0) {
      ranges[ranges.length - 1].end = totalDuration;
    }
  }

  const cappedRanges = capRangesEvenly(ranges, maxSegments);
  if (ranges.length > cappedRanges.length) {
    console.log(
      `Capped split candidates from ${ranges.length} to ${cappedRanges.length} for stability`
    );
  }

  const segments: Segment[] = [];
  for (const range of cappedRanges) {
    try {
      segments.push(await createSegment(inputPath, range.start, range.end));
    } catch (error) {
      console.warn(
        `Skipping failed segment ${range.start.toFixed(2)}-${range.end.toFixed(2)}s:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(`Created ${segments.length} segments`);
  return segments;
}

export { detectScenes, createSegment };
