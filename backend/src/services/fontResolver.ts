import path from 'path';
import fs from 'fs';
import config from '../config';

/**
 * Resolve a font file for ffmpeg drawtext. Without an explicit fontfile,
 * drawtext relies on fontconfig, which is typically missing on Windows
 * builds — Chinese titles then fail or render as boxes.
 *
 * Order: FONT_PATH env -> assets/fonts -> common system fonts.
 */

let cached: string | null | undefined;

export function resolveFontFile(): string | null {
  if (cached !== undefined) return cached;

  const candidates: string[] = [];

  if (config.fontPath) {
    candidates.push(config.fontPath);
  }

  try {
    const files = fs
      .readdirSync(config.paths.fonts)
      .filter((f) => /\.(ttf|otf|ttc)$/i.test(f));
    candidates.push(...files.map((f) => path.join(config.paths.fonts, f)));
  } catch {
    // fonts dir missing — fall through to system fonts
  }

  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Windows\\Fonts\\msyh.ttc', // 微软雅黑
      'C:\\Windows\\Fonts\\msyhbd.ttc',
      'C:\\Windows\\Fonts\\simhei.ttf',
      'C:\\Windows\\Fonts\\arial.ttf'
    );
  } else {
    candidates.push(
      '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc', // alpine font-noto-cjk
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    );
  }

  cached = candidates.find((c) => {
    try {
      return fs.existsSync(c);
    } catch {
      return false;
    }
  }) ?? null;

  if (cached) {
    console.log(`✓ drawtext font: ${cached}`);
  } else {
    console.warn('⚠️  No font file found for drawtext; relying on fontconfig defaults');
  }
  return cached;
}

/**
 * "fontfile='...':" option fragment for a drawtext filter, with ffmpeg
 * filter-graph escaping for Windows paths ("C\:/Windows/..."). Empty string
 * when no font was found (drawtext then uses fontconfig).
 */
export function fontFileOption(): string {
  const font = resolveFontFile();
  if (!font) return '';
  const escaped = font.replace(/\\/g, '/').replace(/:/g, '\\:');
  return `fontfile='${escaped}':`;
}
