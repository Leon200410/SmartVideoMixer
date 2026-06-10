import path from 'path';
import fs from 'fs-extra';
import ffmpeg from 'fluent-ffmpeg';
import config from '../config';

/**
 * Placeholder background-music synthesis.
 *
 * Templates reference upbeat/dramatic/ambient/acoustic.mp3, but the repo can't
 * ship licensed music. On startup we synthesize simple chord-loop placeholders
 * with ffmpeg's sine generator for any file that is missing, so generated
 * videos always have background music. Drop real royalty-free MP3s with the
 * same names into assets/music to replace them.
 */

interface TrackSpec {
  file: string;
  // Chord progression: each entry is the sine frequencies playing together
  chords: number[][];
  chordDuration: number;
  // Post-processing filter applied to the mixed phrase
  postFilter: string;
  targetDuration: number;
}

const TRACKS: TrackSpec[] = [
  {
    // I–V–vi–IV in C major, pulsing — "energetic" placeholder
    file: 'upbeat.mp3',
    chords: [
      [261.63, 329.63, 392.0],
      [261.63, 329.63, 392.0],
      [196.0, 246.94, 392.0],
      [196.0, 246.94, 392.0],
      [220.0, 261.63, 329.63],
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 349.23],
      [174.61, 220.0, 349.23],
    ],
    chordDuration: 0.85,
    postFilter: 'tremolo=f=5.9:d=0.55,volume=2.0',
    targetDuration: 38,
  },
  {
    // Low minor drones with slow pulse — "tense" placeholder
    file: 'dramatic.mp3',
    chords: [
      [146.83, 220.0, 293.66],
      [116.54, 174.61, 233.08],
      [98.0, 146.83, 196.0],
      [110.0, 164.81, 220.0],
    ],
    chordDuration: 1.8,
    postFilter: 'tremolo=f=2.2:d=0.35,lowpass=f=1500,volume=2.2',
    targetDuration: 40,
  },
  {
    // Long soft maj7 pads — "cinematic ambient" placeholder
    file: 'ambient.mp3',
    chords: [
      [130.81, 164.81, 196.0, 246.94],
      [174.61, 220.0, 261.63, 329.63],
      [146.83, 174.61, 220.0, 261.63],
      [196.0, 246.94, 293.66, 369.99],
    ],
    chordDuration: 3.6,
    postFilter: 'lowpass=f=900,tremolo=f=0.4:d=0.25,volume=2.4',
    targetDuration: 42,
  },
  {
    // Light fast arpeggio pulse — "acoustic-ish" placeholder
    file: 'acoustic.mp3',
    chords: [
      [261.63, 392.0],
      [329.63, 523.25],
      [293.66, 440.0],
      [349.23, 523.25],
      [261.63, 392.0],
      [329.63, 493.88],
      [220.0, 329.63],
      [246.94, 392.0],
    ],
    chordDuration: 0.62,
    postFilter: 'tremolo=f=7.5:d=0.75,highpass=f=180,volume=1.9',
    targetDuration: 36,
  },
];

async function synthesizePhrase(spec: TrackSpec, phrasePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg();

    // One sine input per note (lavfi acceptance relies on the capability
    // cache priming in ffmpegUtils.primeFfmpegCapabilities)
    for (const chord of spec.chords) {
      for (const freq of chord) {
        command
          .input(`sine=frequency=${freq}:sample_rate=44100:duration=${spec.chordDuration}`)
          .inputOptions(['-f', 'lavfi']);
      }
    }

    // Mix the notes of each chord, then concatenate the chords
    const filters: string[] = [];
    let inputIdx = 0;
    const chordLabels: string[] = [];
    spec.chords.forEach((chord, ci) => {
      const noteLabels = chord.map(() => `[${inputIdx++}:a]`).join('');
      filters.push(`${noteLabels}amix=inputs=${chord.length}:duration=longest[c${ci}]`);
      chordLabels.push(`[c${ci}]`);
    });
    filters.push(
      `${chordLabels.join('')}concat=n=${spec.chords.length}:v=0:a=1,${spec.postFilter}[out]`
    );

    command
      .complexFilter(filters)
      .outputOptions(['-map', '[out]', '-ac', '2', '-ar', '44100'])
      .audioCodec('pcm_s16le')
      .output(phrasePath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

async function loopToMp3(
  phrasePath: string,
  outPath: string,
  targetDuration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(phrasePath)
      .inputOptions(['-stream_loop', '-1'])
      .outputOptions(['-t', String(targetDuration), '-q:a', '5'])
      .audioCodec('libmp3lame')
      .output(outPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

/**
 * Generate any missing placeholder tracks. Safe to call on every startup.
 */
export async function ensurePlaceholderMusic(): Promise<void> {
  await fs.ensureDir(config.paths.music);

  for (const spec of TRACKS) {
    const outPath = path.join(config.paths.music, spec.file);
    if (await fs.pathExists(outPath)) continue;

    const phrasePath = path.join(config.paths.temp, `phrase_${spec.file}.wav`);
    try {
      console.log(`Generating placeholder music: ${spec.file}...`);
      await synthesizePhrase(spec, phrasePath);
      await loopToMp3(phrasePath, outPath, spec.targetDuration);
      console.log(`✓ Placeholder music ready: ${spec.file}`);
    } catch (error) {
      console.warn(
        `⚠️  Failed to generate ${spec.file} (videos will fall back to original audio only):`,
        error instanceof Error ? error.message : error
      );
      await fs.remove(outPath).catch(() => {});
    } finally {
      await fs.remove(phrasePath).catch(() => {});
    }
  }
}
