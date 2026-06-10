import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import ffmpeg from 'fluent-ffmpeg';
import { Segment } from '../types';
import { TemplateConfig, SegmentSelectionStrategy } from './types';
import { getDuration } from '../services/ffmpegUtils';
import { fontFileOption } from '../services/fontResolver';
import { renderMotionCard } from '../services/remotionRenderer';
import config from '../config';

/**
 * Template Engine - Generates videos based on template configurations
 */
export class TemplateEngine {
  constructor(private template: TemplateConfig) {}

  /**
   * Select segments based on template strategy
   */
  selectSegments(segments: Segment[], customOrder?: string[]): Segment[] {
    const { strategy, maxSegments, minDuration, maxDuration, sortBy } =
      this.template.segmentSelection;

    let filtered = segments;

    // Filter by duration constraints
    if (minDuration !== undefined || maxDuration !== undefined) {
      filtered = segments.filter((seg) => {
        const duration = seg.end - seg.start;
        if (minDuration !== undefined && duration < minDuration) return false;
        if (maxDuration !== undefined && duration > maxDuration) return false;
        return true;
      });
    }

    let selected: Segment[];

    // A user-arranged order always wins over the template strategy — the UI
    // promises "drag to reorder, segments are used in this order".
    if (customOrder && customOrder.length > 0) {
      const segmentMap = new Map(filtered.map((s) => [s.id, s]));
      selected = customOrder
        .map((id) => segmentMap.get(id))
        .filter(Boolean) as Segment[];
      return selected.slice(0, maxSegments || selected.length);
    }

    switch (strategy) {
      case 'first-best-last':
        // Select first, best scored, and last segments
        const first = filtered[0];
        const best = [...filtered].sort(
          (a, b) => (b.geminiScore || 0) - (a.geminiScore || 0)
        )[0];
        const last = filtered[filtered.length - 1];
        selected = [first, best, last].filter((s, i, arr) =>
          arr.findIndex(x => x.id === s.id) === i
        );
        break;

      case 'top-scored':
        // Select top N by score
        const sorted = [...filtered].sort(
          (a, b) => (b.geminiScore || 0) - (a.geminiScore || 0)
        );
        selected = sorted.slice(0, maxSegments || 6);
        // Sort by time if needed
        if (sortBy === 'time') {
          selected.sort((a, b) => a.start - b.start);
        }
        break;

      case 'all':
        // Use all segments
        selected = filtered.slice(0, maxSegments || filtered.length);
        if (sortBy === 'time') {
          selected.sort((a, b) => a.start - b.start);
        }
        break;

      case 'custom':
        // Use custom order from user
        if (customOrder && customOrder.length > 0) {
          const segmentMap = new Map(filtered.map((s) => [s.id, s]));
          selected = customOrder
            .map((id) => segmentMap.get(id))
            .filter(Boolean) as Segment[];
          selected = selected.slice(0, maxSegments || selected.length);
        } else {
          selected = filtered.slice(0, maxSegments || 6);
        }
        break;

      default:
        selected = filtered.slice(0, maxSegments || 6);
    }

    return selected;
  }

  /**
   * Apply visual style filter to video
   */
  getFilterString(): string {
    const { filter, brightness, contrast, saturation } = this.template.visualStyle;
    const filters: string[] = [];

    // Apply color adjustments
    if (brightness !== undefined || contrast !== undefined || saturation !== undefined) {
      const eqParams = [];
      if (brightness !== undefined) eqParams.push(`brightness=${brightness}`);
      if (contrast !== undefined) eqParams.push(`contrast=${1 + contrast}`);
      if (saturation !== undefined) eqParams.push(`saturation=${1 + saturation}`);
      if (eqParams.length > 0) {
        filters.push(`eq=${eqParams.join(':')}`);
      }
    }

    // Apply preset filter
    if (filter && filter !== 'none') {
      switch (filter) {
        // colorbalance instead of colortemperature: the latter needs
        // ffmpeg >= 4.4 and breaks on older binaries
        case 'warm':
          filters.push('colorbalance=rs=0.12:gs=0.02:bs=-0.12');
          break;
        case 'cool':
          filters.push('colorbalance=rs=-0.12:gs=0.0:bs=0.12');
          break;
        case 'vibrant':
          filters.push('eq=saturation=1.3:contrast=1.1');
          break;
        case 'bw':
          filters.push('hue=s=0');
          break;
        case 'cinematic':
          filters.push('curves=preset=darker:blue=0/0 0.5/0.58 1/1');
          break;
      }
    }

    return filters.join(',');
  }

  /**
   * Get transition filter for xfade
   */
  getTransitionFilter(duration: number): string {
    const { type } = this.template.transitions;

    switch (type) {
      case 'fade':
        return 'fade';
      case 'wipe':
        return 'wipeleft';
      case 'slide':
        return 'slideleft';
      case 'zoom':
        return 'fadeblack';
      default:
        return 'fade';
    }
  }

  /**
   * Create intro card
   */
  async createIntro(aspectRatio: '9:16' | '16:9'): Promise<string | null> {
    if (!this.template.layout.intro) return null;

    const { duration, text, style } = this.template.layout.intro;
    const outputPath = path.join(config.paths.temp, `intro_${uuidv4()}.mp4`);
    const [width, height] = aspectRatio === '9:16' ? [1080, 1920] : [1920, 1080];

    try {
      await renderMotionCard({
        templateId: this.template.id,
        kind: 'intro',
        aspectRatio,
        card: this.template.layout.intro,
        outputPath,
      });
      return outputPath;
    } catch (error) {
      console.warn(
        `Remotion intro failed for "${this.template.id}", falling back to FFmpeg card:`,
        error instanceof Error ? error.message : error
      );
    }

    const bgColor = style?.backgroundColor || '#000000';
    const textColor = style?.textColor || '#FFFFFF';
    const fontSize = style?.fontSize || 80;

    // Escape text for FFmpeg
    const escapedText = text?.replace(/'/g, "'\\''").replace(/:/g, '\\:') || '';

    return new Promise((resolve, reject) => {
      ffmpeg()
        // r=30 matches the normalized segment fps (xfade needs equal rates)
        .input(`color=c=${bgColor}:s=${width}x${height}:d=${duration}:r=30`)
        .inputOptions(['-f', 'lavfi'])
        .videoFilters([
          `drawtext=${fontFileOption()}text='${escapedText}':fontcolor=${textColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.18:boxborderw=24:shadowcolor=black@0.75:shadowx=3:shadowy=3`
        ])
        .outputOptions(['-c:v', 'libx264', '-pix_fmt', 'yuv420p'])
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .run();
    });
  }

  /**
   * Create outro card
   */
  async createOutro(aspectRatio: '9:16' | '16:9'): Promise<string | null> {
    if (!this.template.layout.outro) return null;

    const { duration, text, style } = this.template.layout.outro;
    const outputPath = path.join(config.paths.temp, `outro_${uuidv4()}.mp4`);
    const [width, height] = aspectRatio === '9:16' ? [1080, 1920] : [1920, 1080];

    try {
      await renderMotionCard({
        templateId: this.template.id,
        kind: 'outro',
        aspectRatio,
        card: this.template.layout.outro,
        outputPath,
      });
      return outputPath;
    } catch (error) {
      console.warn(
        `Remotion outro failed for "${this.template.id}", falling back to FFmpeg card:`,
        error instanceof Error ? error.message : error
      );
    }

    const bgColor = style?.backgroundColor || '#000000';
    const textColor = style?.textColor || '#FFFFFF';
    const fontSize = style?.fontSize || 70;

    const escapedText = text?.replace(/'/g, "'\\''").replace(/:/g, '\\:') || '';

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(`color=c=${bgColor}:s=${width}x${height}:d=${duration}:r=30`)
        .inputOptions(['-f', 'lavfi'])
        .videoFilters([
          `drawtext=${fontFileOption()}text='${escapedText}':fontcolor=${textColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.18:boxborderw=24:shadowcolor=black@0.75:shadowx=3:shadowy=3`
        ])
        .outputOptions(['-c:v', 'libx264', '-pix_fmt', 'yuv420p'])
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .run();
    });
  }

  /**
   * Get audio filter string for background music and original audio mixing
   */
  getAudioFilterString(hasBackgroundMusic: boolean, segmentCount: number): string {
    const { keepOriginal, originalVolume } = this.template.audioProcessing;
    const bgMusic = this.template.backgroundMusic;

    if (!keepOriginal && !hasBackgroundMusic) {
      return '';
    }

    // If we have both original audio and background music
    if (keepOriginal && hasBackgroundMusic && bgMusic?.enabled) {
      const musicVolume = bgMusic.volume || 0.3;
      return `[0:a]volume=${originalVolume}[a0];[1:a]volume=${musicVolume}[a1];[a0][a1]amix=inputs=2:duration=shortest[aout]`;
    }

    // Only original audio with volume adjustment
    if (keepOriginal && originalVolume !== 1) {
      return `volume=${originalVolume}`;
    }

    return '';
  }
}
