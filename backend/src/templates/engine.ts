import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import ffmpeg from 'fluent-ffmpeg';
import { Segment } from '../types';
import { TemplateConfig, SegmentSelectionStrategy } from './types';

export interface ClipPlan {
  segment: Segment;
  /** Cold-open flash of the best moment, prepended before the story */
  isHook?: boolean;
  /** Seconds into the segment file to start from */
  trimStart?: number;
  /** Source seconds to keep */
  trimDuration?: number;
  /** Playback rate (<1 = slow motion) */
  speed?: number;
}
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
   * Turn the selected segments into a clip plan: apply the template's pacing
   * (per-position duration targets, slow motion) and prepend a cold-open hook
   * when configured. Without a `pacing` config every segment plays as-is.
   */
  planClips(selected: Segment[], customOrder?: string[]): ClipPlan[] {
    const pacing = this.template.pacing;
    const plans: ClipPlan[] = selected.map((segment) => ({ segment }));
    if (!pacing) return plans;

    const speed =
      pacing.speed && pacing.speed > 0 && pacing.speed !== 1 ? pacing.speed : undefined;
    const pattern = pacing.pattern;

    plans.forEach((plan, i) => {
      plan.speed = speed;
      if (!pattern || pattern.length === 0) return;

      const sourceDuration =
        plan.segment.duration || plan.segment.end - plan.segment.start;
      // Pattern values are on-screen seconds; slow motion stretches the
      // source, so fewer source seconds are needed to fill the slot
      const target = pattern[Math.min(i, pattern.length - 1)];
      const sourceNeeded = speed ? target * speed : target;
      if (sourceDuration > sourceNeeded) {
        plan.trimStart = (sourceDuration - sourceNeeded) / 2;
        plan.trimDuration = sourceNeeded;
      }
    });

    // Cold-open hook: tease the best-scored moment before the story starts.
    // A user-arranged order is a promise about what plays first, so skip it.
    if (pacing.hook?.enabled && !(customOrder && customOrder.length > 0) && selected.length > 1) {
      const best = [...selected].sort(
        (a, b) => (b.geminiScore || 0) - (a.geminiScore || 0)
      )[0];
      const hookDuration = pacing.hook.duration || 1.2;
      const sourceDuration = best.duration || best.end - best.start;
      plans.unshift({
        segment: best,
        isHook: true,
        trimStart: Math.max(0, (sourceDuration - hookDuration) / 2),
        trimDuration: Math.min(hookDuration, sourceDuration),
        // The hook plays at normal speed even when story clips are slowed
      });
    }

    return plans;
  }

  /**
   * Apply visual style filter to video
   */
  getFilterString(aspectRatio?: '9:16' | '16:9'): string {
    const { filter, brightness, contrast, saturation, kenBurns } = this.template.visualStyle;
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

    // Apply Ken Burns panning effect (scale up slightly and pan slowly)
    if (kenBurns) {
      // Scale up by 1.1x and pan smoothly using sine waves
      filters.push(`scale=iw*1.1:ih*1.1`);
      filters.push(`crop=iw/1.1:ih/1.1:'(iw-ow)/2+(iw-ow)/2*sin(t*0.5)':'(ih-oh)/2+(ih-oh)/2*sin(t*0.3)'`);
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
   * Build the transition for every cut of the final timeline. Cycles through
   * the template's `variety` pool (raw xfade names) when present; a cold-open
   * hook always exits through a white flash, the classic teaser cut.
   */
  getTransitionSequence(cutCount: number, hasHook: boolean): string | string[] {
    const { variety } = this.template.transitions;
    const base = this.getTransitionFilter(this.template.transitions.duration);
    if ((!variety || variety.length === 0) && !hasHook) return base;

    const pool = variety && variety.length > 0 ? variety : [base];
    const sequence = Array.from(
      { length: Math.max(cutCount, 0) },
      (_, i) => pool[i % pool.length]
    );
    if (hasHook && sequence.length > 0) sequence[0] = 'fadewhite';
    return sequence;
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
