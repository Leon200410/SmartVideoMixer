import path from 'path';
import fs from 'fs-extra';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import config from '../config';
import { IntroOutro } from '../templates/types';

interface RenderMotionCardOptions {
  templateId: string;
  kind: 'intro' | 'outro';
  aspectRatio: '9:16' | '16:9';
  card: IntroOutro;
  outputPath: string;
}

let bundlePromise: Promise<string> | null = null;
let browserPromise: Promise<void> | null = null;
let browserExecutable: string | null | undefined;

function getBrowserExecutable(): string | null {
  if (browserExecutable !== undefined) return browserExecutable;

  const candidates = [
    process.env.REMOTION_BROWSER_EXECUTABLE || '',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);

  browserExecutable = candidates.find((candidate) => fs.existsSync(candidate)) || null;
  return browserExecutable;
}

function getRemotionEntry(): string {
  const candidates = [
    path.resolve(__dirname, '../remotion/index.js'),
    path.resolve(process.cwd(), 'src/remotion/index.tsx'),
  ];

  const entry = candidates.find((candidate) => fs.existsSync(candidate));
  if (!entry) {
    throw new Error(`Remotion entry not found. Tried: ${candidates.join(', ')}`);
  }
  return entry;
}

async function getServeUrl(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: getRemotionEntry(),
      onProgress: (progress) => {
        if (progress === 1) console.log('✓ Remotion bundle ready');
      },
    });
  }
  return bundlePromise;
}

async function ensureRemotionBrowser(): Promise<void> {
  if (!browserPromise) {
    browserPromise = ensureBrowser({
      browserExecutable: getBrowserExecutable() || undefined,
      logLevel: 'warn',
    }).then(() => undefined);
  }
  return browserPromise;
}

export async function renderMotionCard({
  templateId,
  kind,
  aspectRatio,
  card,
  outputPath,
}: RenderMotionCardOptions): Promise<void> {
  const [width, height] = aspectRatio === '9:16' ? [1080, 1920] : [1920, 1080];
  const fps = 30;
  const inputProps = {
    templateId,
    kind,
    text: card.text || '',
    width,
    height,
    durationInFrames: Math.max(12, Math.round(card.duration * fps)),
    backgroundColor: card.style?.backgroundColor,
    textColor: card.style?.textColor,
  };

  await fs.ensureDir(config.paths.temp);
  await ensureRemotionBrowser();
  const serveUrl = await getServeUrl();
  const composition = await selectComposition({
    serveUrl,
    id: 'MotionCard',
    inputProps,
    browserExecutable: getBrowserExecutable() || undefined,
  });

  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: 'h264',
    outputLocation: outputPath,
    browserExecutable: getBrowserExecutable() || undefined,
    imageFormat: 'jpeg',
    logLevel: 'warn',
  });
}
