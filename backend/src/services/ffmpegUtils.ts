import ffmpeg from 'fluent-ffmpeg';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// Prefer FFMPEG_PATH env, then a system ffmpeg (Docker/Linux paths, then
// PATH lookup — covers winget/choco installs on Windows), then the bundled
// installer binary as a last resort. The bundled binary is an old build that
// lacks newer filters (xfade needs >= 4.3), and its glibc linkage cannot run
// on Alpine/musl, so a real system binary must win whenever one exists.
function resolveFfmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

  const wellKnown = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find((p) =>
    fs.existsSync(p)
  );
  if (wellKnown) return wellKnown;

  try {
    const lookup = spawnSync(
      process.platform === 'win32' ? 'where' : 'which',
      ['ffmpeg'],
      { encoding: 'utf8' }
    );
    const found = lookup.status === 0 ? lookup.stdout.split(/\r?\n/)[0].trim() : '';
    if (found && fs.existsSync(found)) return found;
  } catch {
    // fall through to bundled binary
  }

  try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg') as { path: string };
    console.warn(
      '⚠️  Using bundled ffmpeg (old build). Transitions need ffmpeg >= 4.3 — ' +
        'install a system ffmpeg or set FFMPEG_PATH if generation fails.'
    );
    return ffmpegInstaller.path;
  } catch (error) {
    throw new Error(
      `Could not resolve ffmpeg. Install ffmpeg or set FFMPEG_PATH. ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

const ffmpegPath = resolveFfmpegPath();
ffmpeg.setFfmpegPath(ffmpegPath);
console.log(`✓ ffmpeg binary: ${ffmpegPath}`);

/**
 * Seed fluent-ffmpeg's format capability cache with lavfi.
 *
 * fluent-ffmpeg validates every input's -f against `ffmpeg -formats`, but its
 * line parser chokes on newer ffmpeg builds that mark lavfi as a device
 * ("D d lavfi"), so any lavfi input (intro/outro cards, silence tracks,
 * synthesized music) would be rejected with "Input format lavfi is not
 * available". The capability cache is shared by reference, so patching the
 * object returned by getAvailableFormats fixes all later commands.
 * Call once at startup before any ffmpeg work.
 */
export async function primeFfmpegCapabilities(): Promise<void> {
  return new Promise((resolve) => {
    (ffmpeg as any).getAvailableFormats((err: unknown, formats: any) => {
      if (!err && formats && !formats.lavfi) {
        formats.lavfi = {
          description: 'Libavfilter virtual input device',
          canDemux: true,
          canMux: false,
        };
      }
      resolve();
    });
  });
}

/**
 * Get video duration in seconds
 */
export async function getDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration || 0);
    });
  });
}

/**
 * Get video metadata
 */
export async function getVideoMetadata(filePath: string): Promise<{
  duration: number;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');

      resolve({
        duration: metadata.format.duration || 0,
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
      });
    });
  });
}

/**
 * Probe duration + audio presence in one ffprobe call
 */
async function probeForConcat(
  filePath: string
): Promise<{
  duration: number;
  hasAudio: boolean;
  width: number;
  height: number;
  pixFmt: string | null;
  fps: string | null;
  sampleRate: string | null;
  channelLayout: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');
      resolve({
        duration: metadata.format.duration || 0,
        hasAudio: metadata.streams.some((s) => s.codec_type === 'audio'),
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        pixFmt: videoStream?.pix_fmt || null,
        fps: videoStream?.r_frame_rate || null,
        sampleRate:
          audioStream?.sample_rate !== undefined && audioStream?.sample_rate !== null
            ? String(audioStream.sample_rate)
            : null,
        channelLayout: audioStream?.channel_layout || null,
        videoCodec: videoStream?.codec_name || null,
        audioCodec: audioStream?.codec_name || null,
      });
    });
  });
}

// #region debug-point A:report-helper
function reportVideoFilterDebug(
  hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E',
  location: string,
  msg: string,
  data: Record<string, unknown>
): void {
  let url = 'http://127.0.0.1:7777/event';
  let sessionId = 'video-filter-failure';
  try {
    const env = fs.readFileSync(path.resolve(process.cwd(), '.dbg/video-filter-failure.env'), 'utf8');
    url = env.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() || url;
    sessionId = env.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() || sessionId;
  } catch {}
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      runId: process.env.DEBUG_RUN_ID || 'pre-fix',
      hypothesisId,
      location,
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion

/**
 * Cut a segment from video
 */
export async function cutSegment(
  input: string,
  start: number,
  end: number,
  output: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .setStartTime(start)
      .setDuration(end - start)
      .outputOptions([
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-strict', 'experimental'
      ])
      .output(output)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

/**
 * Generate thumbnail from video
 */
export async function generateThumbnail(
  videoPath: string,
  timestamp: number | string = '50%'
): Promise<string> {
  const thumbPath = videoPath.replace(path.extname(videoPath), '_thumb.jpg');

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [String(timestamp)],
        filename: path.basename(thumbPath),
        folder: path.dirname(thumbPath),
        size: '320x?'
      })
      .on('end', () => resolve(thumbPath))
      .on('error', reject);
  });
}

/**
 * Extract frame from video at specific position
 */
export async function extractFrame(
  videoPath: string,
  position: number // 0-1, percentage position
): Promise<string> {
  const framePath = videoPath.replace(path.extname(videoPath), `_frame_${position}.jpg`);

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [`${position * 100}%`],
        filename: path.basename(framePath),
        folder: path.dirname(framePath)
      })
      .on('end', () => resolve(framePath))
      .on('error', reject);
  });
}

/**
 * Adjust video aspect ratio.
 * Also normalizes fps/SAR/pixel format (xfade requires identical streams) and
 * re-encodes audio to a common format (acrossfade requires identical formats).
 */
export async function adjustAspectRatio(
  inputPath: string,
  aspectRatio: '9:16' | '16:9',
  outputPath: string
): Promise<void> {
  const [width, height] = aspectRatio === '9:16' ? [1080, 1920] : [1920, 1080];

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters([
        `scale=${width}:${height}:force_original_aspect_ratio=increase`,
        `crop=${width}:${height}`,
        'fps=30',
        'setsar=1'
      ])
      .outputOptions([
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-ar', '44100',
        '-ac', '2',
        '-b:a', '192k'
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

/**
 * Add text overlay to video
 */
export async function addTextOverlay(
  inputPath: string,
  text: string,
  outputPath: string,
  fontPath: string,
  fontSize: number = 60
): Promise<void> {
  // Escape single quotes in text
  const escapedText = text.replace(/'/g, "'\\''");

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters([
        `drawtext=fontfile='${fontPath}':text='${escapedText}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=h/2:box=1:boxcolor=black@0.5:boxborderw=10`
      ])
      .outputOptions(['-c:v', 'libx264', '-c:a', 'copy'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

export interface ConcatAudioOptions {
  backgroundMusic?: string;
  musicVolume?: number;
  musicFadeIn?: number;
  musicFadeOut?: number;
  originalVolume?: number;
  keepOriginalAudio?: boolean;
}

/**
 * Concatenate video parts with crossfade transitions, keeping audio and video
 * in lockstep.
 *
 * Video uses chained xfade (each transition overlaps the parts by
 * `transitionDuration`), audio uses a matching acrossfade chain, so the two
 * stay in sync for any number of parts. Parts without an audio stream (intro/
 * outro cards, silent sources) get a synthesized silent track. Background
 * music is looped to the full output length, faded in/out, and mixed under
 * the program audio.
 */
export async function concatVideosWithTransitions(
  inputs: string[],
  output: string,
  transitionType: string = 'fade',
  transitionDuration: number = 0.5,
  audioOptions?: ConcatAudioOptions
): Promise<void> {
  if (inputs.length === 0) {
    throw new Error('concatVideosWithTransitions: no input files');
  }

  const keepOriginal = audioOptions?.keepOriginalAudio ?? true;
  const bgMusic = audioOptions?.backgroundMusic;

  // Probe all parts up front (durations drive the xfade offsets)
  const probes = await Promise.all(inputs.map(probeForConcat));
  // #region debug-point A:concat-input-probes
  reportVideoFilterDebug('A', 'ffmpegUtils.ts:concatVideosWithTransitions:probes', 'concat input probes', {
    output,
    transitionType,
    transitionDuration,
    keepOriginal,
    backgroundMusic: bgMusic ? path.basename(bgMusic) : null,
    inputs: inputs.map((input, index) => ({
      index,
      file: path.basename(input),
      ...probes[index],
    })),
  });
  // #endregion

  // Transitions need at least 2 parts, a positive duration, and every part
  // longer than the overlap itself
  const useTransitions =
    inputs.length > 1 &&
    transitionDuration > 0 &&
    probes.every((p) => p.duration > transitionDuration + 0.05);

  const totalDuration = useTransitions
    ? probes.reduce((sum, p) => sum + p.duration, 0) -
      (inputs.length - 1) * transitionDuration
    : probes.reduce((sum, p) => sum + p.duration, 0);

  const command = ffmpeg();
  inputs.forEach((input) => command.input(input));

  // Synthesized silent tracks for parts without audio (only needed when the
  // program audio is kept)
  let nextInputIdx = inputs.length;
  const audioSrc: string[] = [];
  if (keepOriginal) {
    probes.forEach((p, i) => {
      if (p.hasAudio) {
        audioSrc[i] = `${i}:a`;
      } else {
        command
          .input('anullsrc=r=44100:cl=stereo')
          .inputOptions(['-f', 'lavfi', '-t', p.duration.toFixed(3)]);
        audioSrc[i] = `${nextInputIdx}:a`;
        nextInputIdx++;
      }
    });
  }

  let musicIdx = -1;
  if (bgMusic) {
    command.input(bgMusic).inputOptions(['-stream_loop', '-1']);
    musicIdx = nextInputIdx;
    nextInputIdx++;
  }

  // #region debug-point D:input-index-map
  reportVideoFilterDebug('D', 'ffmpegUtils.ts:concatVideosWithTransitions:input-map', 'computed ffmpeg input map', {
    inputCount: inputs.length,
    audioSrc,
    nextInputIdx,
    musicIdx,
    keepOriginal,
    hasBackgroundMusic: Boolean(bgMusic),
    probes: probes.map((probe, index) => ({
      index,
      duration: probe.duration,
      hasAudio: probe.hasAudio,
      file: path.basename(inputs[index]),
    })),
  });
  // #endregion

  const filters: string[] = [];
  const normalizedVideoLabels = inputs.map((_, i) => `[vv${i}]`);

  inputs.forEach((_, i) => {
    filters.push(`[${i}:v]settb=AVTB${normalizedVideoLabels[i]}`);
  });

  // ---- video chain ----
  if (inputs.length === 1) {
    filters.push(`${normalizedVideoLabels[0]}null[vout]`);
  } else if (useTransitions) {
    let current = normalizedVideoLabels[0];
    let timeline = probes[0].duration;
    for (let i = 1; i < inputs.length; i++) {
      const out = i === inputs.length - 1 ? '[vout]' : `[v${i}]`;
      // Offset is on the accumulated timeline, not the previous part alone
      const offset = Math.max(0, timeline - transitionDuration);
      filters.push(
        `${current}${normalizedVideoLabels[i]}xfade=transition=${transitionType}:duration=${transitionDuration}:offset=${offset.toFixed(3)}${out}`
      );
      timeline = timeline + probes[i].duration - transitionDuration;
      current = out;
    }
  } else {
    const labels = normalizedVideoLabels.join('');
    filters.push(`${labels}concat=n=${inputs.length}:v=1:a=0[vout]`);
  }

  // ---- program (original) audio chain ----
  let programLabel: string | null = null;
  if (keepOriginal) {
    // Normalize every part's audio so acrossfade/concat accept them
    const partLabels: string[] = [];
    inputs.forEach((_, i) => {
      filters.push(
        `[${audioSrc[i]}]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[pa${i}]`
      );
      partLabels.push(`[pa${i}]`);
    });

    if (inputs.length === 1) {
      programLabel = '[pa0]';
    } else if (useTransitions) {
      let current = '[pa0]';
      for (let i = 1; i < inputs.length; i++) {
        const out = `[ax${i}]`;
        filters.push(`${current}[pa${i}]acrossfade=d=${transitionDuration}${out}`);
        current = out;
      }
      programLabel = current;
    } else {
      filters.push(`${partLabels.join('')}concat=n=${inputs.length}:v=0:a=1[acat]`);
      programLabel = '[acat]';
    }

    const originalVolume = audioOptions?.originalVolume ?? 1;
    if (originalVolume !== 1) {
      filters.push(`${programLabel}volume=${originalVolume}[aorig]`);
      programLabel = '[aorig]';
    }
  }

  // ---- background music chain ----
  let musicLabel: string | null = null;
  if (bgMusic && musicIdx >= 0) {
    const musicVolume = audioOptions?.musicVolume ?? 0.3;
    const fadeIn = audioOptions?.musicFadeIn ?? 1;
    const fadeOut = audioOptions?.musicFadeOut ?? 2;

    const chain = [
      'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo',
      `volume=${musicVolume}`,
      fadeIn > 0 ? `afade=t=in:st=0:d=${fadeIn}` : '',
      fadeOut > 0 && totalDuration > fadeOut
        ? `afade=t=out:st=${(totalDuration - fadeOut).toFixed(3)}:d=${fadeOut}`
        : '',
      `atrim=duration=${totalDuration.toFixed(3)}`,
      'asetpts=PTS-STARTPTS',
    ]
      .filter(Boolean)
      .join(',');

    filters.push(`[${musicIdx}:a]${chain}[abg]`);
    musicLabel = '[abg]';
  }

  // ---- final audio routing ----
  let audioOut: string | null = null;
  if (programLabel && musicLabel) {
    // amix averages its inputs, bring the level back up afterwards
    filters.push(
      `${programLabel}${musicLabel}amix=inputs=2:duration=first:dropout_transition=0,volume=1.8[aout]`
    );
    audioOut = '[aout]';
  } else if (programLabel) {
    audioOut = programLabel;
  } else if (musicLabel) {
    audioOut = musicLabel;
  }

  const outputOptions = [
    '-map', '[vout]',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
  ];

  if (audioOut) {
    outputOptions.push('-map', audioOut, '-c:a', 'aac', '-b:a', '192k', '-ar', '44100');
  } else {
    outputOptions.push('-an');
  }

  console.log(
    `Concat: ${inputs.length} parts, transitions=${useTransitions ? transitionType : 'none'}, ` +
      `audio=${audioOut ? (musicLabel ? 'program+music' : 'program') : 'none'}, ~${totalDuration.toFixed(1)}s`
  );

  return new Promise((resolve, reject) => {
    const pipeline: any = command
      .complexFilter(filters)
      .outputOptions(outputOptions)
      .output(output);

    pipeline
      .on('start', (cmd: string) => {
        console.log('FFmpeg command:', cmd);
        // #region debug-point B:filter-graph
        reportVideoFilterDebug('B', 'ffmpegUtils.ts:concatVideosWithTransitions:start', 'starting ffmpeg concat', {
          useTransitions,
          totalDuration,
          filters,
          outputOptions,
          command: cmd,
        });
        // #endregion
      })
      .on('end', () => resolve())
      .on('error', (error: Error, stdout?: string, stderr?: string) => {
        // #region debug-point E:ffmpeg-error
        reportVideoFilterDebug('E', 'ffmpegUtils.ts:concatVideosWithTransitions:error', 'ffmpeg concat failed', {
          error: error.message,
          stdoutTail: stdout ? stdout.split(/\r?\n/).slice(-20) : [],
          stderrTail: stderr ? stderr.split(/\r?\n/).slice(-40) : [],
        });
        // #endregion
        reject(error);
      })
      .run();
  });
}

export default {
  getDuration,
  getVideoMetadata,
  cutSegment,
  generateThumbnail,
  extractFrame,
  concatVideosWithTransitions,
  adjustAspectRatio,
  addTextOverlay
};
