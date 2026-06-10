import path from 'path';
import fs from 'fs-extra';
import ffmpeg from 'fluent-ffmpeg';
import config from '../config';
import { TemplateConfig } from '../templates/types';
import { TemplateEngine } from '../templates/engine';
import { fontFileOption } from './fontResolver';

/**
 * Auto-generated per-template sample clips.
 *
 * Each template gets a short demo video (two synthetic scenes joined with the
 * template's transition, graded with its visual filter, captioned with its
 * name, scored with its background music) so users can preview what a
 * template "feels like" before splitting. Samples are regenerated when the
 * matching template config is newer; drop your own newer <templateId>.mp4
 * there to override.
 */

const SCENE_DURATION = 2.8;
const SIZE = '720x1280';

interface SamplePalette {
  bgA: string;
  bgB: string;
  washA: string;
  washB: string;
  accentA: string;
  accentB: string;
}

const SAMPLE_PALETTES: Record<string, SamplePalette> = {
  cinematic: {
    bgA: '0x11100f',
    bgB: '0x171512',
    washA: '0xc19a5b',
    washB: '0x4f6f91',
    accentA: '0xf2d28b',
    accentB: '0x8ab4d6',
  },
  highlights: {
    bgA: '0x17131f',
    bgB: '0x201115',
    washA: '0xff365e',
    washB: '0xffc247',
    accentA: '0xff4d6d',
    accentB: '0xffd166',
  },
  suspense: {
    bgA: '0x071214',
    bgB: '0x120b17',
    washA: '0x11d3a6',
    washB: '0x8a5cf6',
    accentA: '0x67e8f9',
    accentB: '0xfacc15',
  },
  vlog: {
    bgA: '0x16201c',
    bgB: '0x251c17',
    washA: '0x7dd3fc',
    washB: '0xfbbf77',
    accentA: '0x86efac',
    accentB: '0xf9a8d4',
  },
};

export function samplePath(templateId: string): string {
  return path.join(config.paths.samples, `${templateId}.mp4`);
}

export function sampleExists(templateId: string): boolean {
  try {
    return fs.existsSync(samplePath(templateId));
  } catch {
    return false;
  }
}

async function shouldGenerateSample(templateId: string): Promise<boolean> {
  const outPath = samplePath(templateId);
  if (!(await fs.pathExists(outPath))) return true;

  const configPath = path.resolve(
    __dirname,
    `../templates/configs/${templateId}.json`
  );
  if (!(await fs.pathExists(configPath))) return false;

  const [sampleStat, configStat, generatorStat] = await Promise.all([
    fs.stat(outPath),
    fs.stat(configPath),
    fs.stat(__filename),
  ]);
  return configStat.mtimeMs > sampleStat.mtimeMs || generatorStat.mtimeMs > sampleStat.mtimeMs;
}

function escapeDrawtext(text: string): string {
  return text.replace(/'/g, "'\\''").replace(/:/g, '\\:');
}

function getPalette(templateId: string): SamplePalette {
  return SAMPLE_PALETTES[templateId] || SAMPLE_PALETTES.highlights;
}

function sceneFilter(
  inputIndex: number,
  outputLabel: string,
  palette: SamplePalette,
  style: string,
  variant: 0 | 1
): string {
  const wash = variant === 0 ? palette.washA : palette.washB;
  const accent = variant === 0 ? palette.accentA : palette.accentB;
  const accentY = variant === 0 ? 'ih*0.68' : 'ih*0.26';
  const panelY = variant === 0 ? 'ih*0.14' : 'ih*0.58';

  return (
    `[${inputIndex}:v]` +
    [
      `drawbox=x=iw*0.07:y=${panelY}:w=iw*0.86:h=ih*0.2:color=${wash}@0.22:t=fill`,
      `drawbox=x=iw*0.14:y=ih*0.38:w=iw*0.72:h=ih*0.28:color=${accent}@0.11:t=fill`,
      `drawbox=x=iw*0.2:y=${accentY}:w=iw*0.6:h=7:color=${accent}@0.68:t=fill`,
      `drawbox=x=iw*0.09:y=ih*0.82:w=iw*0.82:h=2:color=white@0.24:t=fill`,
      style,
      'vignette=PI/5',
      'noise=alls=3:allf=t',
      'format=yuv420p',
      'setsar=1',
    ]
      .filter(Boolean)
      .join(',') +
    `[${outputLabel}]`
  );
}

async function generateSample(template: TemplateConfig): Promise<void> {
  const outPath = samplePath(template.id);
  const engine = new TemplateEngine(template);

  const styleFilter = engine.getFilterString();
  const style = styleFilter || '';
  const palette = getPalette(template.id);
  const transition = engine.getTransitionFilter(template.transitions.duration);
  const transitionDuration = Math.min(
    Math.max(template.transitions.duration, 0.2),
    1
  );
  const totalDuration = SCENE_DURATION * 2 - transitionDuration;

  const musicFile = template.backgroundMusic?.file
    ? path.join(config.paths.music, template.backgroundMusic.file)
    : null;
  const hasMusic = musicFile ? await fs.pathExists(musicFile) : false;

  const caption = escapeDrawtext(template.name);
  const font = fontFileOption();

  const filters = [
    sceneFilter(0, 's0', palette, style, 0),
    sceneFilter(1, 's1', palette, style, 1),
    `[s0][s1]xfade=transition=${transition}:duration=${transitionDuration}:offset=${(SCENE_DURATION - transitionDuration).toFixed(2)}[xf]`,
    `[xf]drawtext=${font}text='${caption}':fontcolor=white:fontsize=62:x=(w-text_w)/2:y=h*0.74:box=1:boxcolor=black@0.34:boxborderw=18:shadowcolor=black@0.65:shadowx=3:shadowy=3[vout]`,
  ];

  if (hasMusic) {
    const volume = template.backgroundMusic?.volume ?? 0.3;
    filters.push(
      `[2:a]volume=${Math.min(volume * 2, 1)},atrim=duration=${totalDuration.toFixed(2)},` +
        `afade=t=out:st=${(totalDuration - 0.8).toFixed(2)}:d=0.8,asetpts=PTS-STARTPTS[aout]`
    );
  }

  return new Promise((resolve, reject) => {
    const command = ffmpeg()
      .input(`color=c=${palette.bgA}:s=${SIZE}:r=30:d=${SCENE_DURATION}`)
      .inputOptions(['-f', 'lavfi'])
      .input(`color=c=${palette.bgB}:s=${SIZE}:r=30:d=${SCENE_DURATION}`)
      .inputOptions(['-f', 'lavfi']);

    if (hasMusic && musicFile) {
      command.input(musicFile);
    }

    const outputOptions = [
      '-map', '[vout]',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '21',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-t', totalDuration.toFixed(2),
    ];
    if (hasMusic) {
      outputOptions.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '96k');
    } else {
      outputOptions.push('-an');
    }

    command
      .complexFilter(filters)
      .outputOptions(outputOptions)
      .output(outPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

/**
 * Generate any missing template samples. Best-effort: a failed sample only
 * means the template card has no preview clip.
 */
export async function ensureTemplateSamples(
  templates: TemplateConfig[]
): Promise<void> {
  await fs.ensureDir(config.paths.samples);

  for (const template of templates) {
    if (!(await shouldGenerateSample(template.id))) continue;

    try {
      console.log(`Generating template sample: ${template.id}...`);
      await generateSample(template);
      console.log(`✓ Template sample ready: ${template.id}`);
    } catch (error) {
      console.warn(
        `⚠️  Failed to generate sample for "${template.id}":`,
        error instanceof Error ? error.message : error
      );
      await fs.remove(samplePath(template.id)).catch(() => {});
    }
  }
}
