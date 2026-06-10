import path from 'path';
import fs from 'fs-extra';
import ffmpeg from 'fluent-ffmpeg';
import config from '../config';
import { TemplateConfig } from '../templates/types';

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
  jamendoTags: string[];
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
    jamendoTags: ['electronic', 'dance', 'upbeat'],
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
    jamendoTags: ['cinematic', 'soundtrack', 'dramatic'],
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
    jamendoTags: ['ambient', 'soundtrack', 'piano'],
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
    jamendoTags: ['acoustic', 'folk', 'happy'],
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

interface JamendoTrack {
  id: string;
  name: string;
  artist_name?: string;
  audio?: string;
  audiodownload?: string;
  audiodownload_allowed?: boolean;
  license_ccurl?: string;
}

interface JamendoResponse {
  headers?: {
    status?: string;
    error_message?: string;
  };
  results?: JamendoTrack[];
}

const TRACK_TAGS = new Map(TRACKS.map((track) => [track.file, track.jamendoTags]));

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms).unref?.();
  return controller.signal;
}

function selectJamendoTags(template: TemplateConfig): string[] {
  const bg = template.backgroundMusic;
  if (bg?.jamendoTags?.length) return bg.jamendoTags;
  if (bg?.file && TRACK_TAGS.has(bg.file)) return TRACK_TAGS.get(bg.file)!;
  return ['instrumental', 'soundtrack'];
}

async function searchJamendoTrack(template: TemplateConfig): Promise<JamendoTrack> {
  if (!config.jamendo.clientId) {
    throw new Error('JAMENDO_CLIENT_ID is not configured');
  }

  const bg = template.backgroundMusic;
  const url = new URL('https://api.jamendo.com/v3.0/tracks/');
  url.searchParams.set('client_id', config.jamendo.clientId);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', String(config.jamendo.searchLimit));
  url.searchParams.set('include', 'licenses');
  url.searchParams.set('audioformat', 'mp32');
  url.searchParams.set('audiodlformat', 'mp32');
  url.searchParams.set('durationbetween', '45_600');
  url.searchParams.set('groupby', 'artist_id');
  url.searchParams.set('boost', 'popularity_month');
  url.searchParams.set('fuzzytags', selectJamendoTags(template).join(' '));
  url.searchParams.set('featured', '1');

  if (bg?.jamendoSearch) {
    url.searchParams.set('search', bg.jamendoSearch);
  }
  if (bg?.jamendoVocal !== 'both') {
    url.searchParams.set('vocalinstrumental', bg?.jamendoVocal || 'instrumental');
  }

  const resp = await fetch(url, { signal: withTimeout(12000) });
  if (!resp.ok) {
    throw new Error(`Jamendo search failed: ${resp.status}`);
  }

  const data = (await resp.json()) as JamendoResponse;
  if (data.headers?.status && data.headers.status !== 'success') {
    throw new Error(data.headers.error_message || 'Jamendo search failed');
  }

  const tracks = (data.results || []).filter(
    (track) => track.audiodownload_allowed !== false && (track.audiodownload || track.audio)
  );
  if (tracks.length === 0) {
    throw new Error('Jamendo returned no downloadable tracks');
  }

  return tracks[Math.floor(Math.random() * tracks.length)];
}

async function downloadJamendoTrack(track: JamendoTrack, templateId: string): Promise<string> {
  const url = track.audiodownload || track.audio;
  if (!url) throw new Error('Jamendo track has no audio URL');

  await fs.ensureDir(config.paths.temp);
  const outPath = path.join(
    config.paths.temp,
    `jamendo_${templateId}_${track.id}_${Date.now()}.mp3`
  );

  const resp = await fetch(url, { signal: withTimeout(30000) });
  if (!resp.ok) {
    throw new Error(`Jamendo download failed: ${resp.status}`);
  }

  const audio = Buffer.from(await resp.arrayBuffer());
  if (audio.length < 1024) {
    throw new Error('Jamendo download was empty');
  }

  await fs.writeFile(outPath, audio);
  console.log(
    `✓ Jamendo music: ${track.name}${track.artist_name ? ` - ${track.artist_name}` : ''}` +
      `${track.license_ccurl ? ` (${track.license_ccurl})` : ''}`
  );
  return outPath;
}

export async function resolveBackgroundMusic(
  template: TemplateConfig
): Promise<string | undefined> {
  const bg = template.backgroundMusic;
  if (!bg?.enabled) return undefined;

  if (config.jamendo.enabled && config.jamendo.clientId) {
    try {
      const track = await searchJamendoTrack(template);
      return await downloadJamendoTrack(track, template.id);
    } catch (error) {
      console.warn(
        `Jamendo music unavailable for "${template.id}", falling back to local music:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  if (!bg.file) return undefined;
  const localPath = path.join(config.paths.music, bg.file);
  return (await fs.pathExists(localPath)) ? localPath : undefined;
}

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
