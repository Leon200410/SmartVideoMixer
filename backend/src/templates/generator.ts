import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import { Segment } from '../types';
import { TemplateConfig } from './types';
import { TemplateEngine } from './engine';
import { adjustAspectRatio, concatVideosWithTransitions } from '../services/ffmpegUtils';
import { generateTitle } from '../services/aiAnalyzer';
import { extractFrame } from '../services/ffmpegUtils';
import { ensureLocal } from '../services/storage';
import { fontFileOption } from '../services/fontResolver';
import { resolveBackgroundMusic } from '../services/musicLibrary';
import config from '../config';

export interface GenerateOptions {
  segments: Segment[];
  aspectRatio: '9:16' | '16:9';
  customOrder?: string[];
}

/**
 * Generate video using template configuration
 */
export async function generateFromTemplate(
  template: TemplateConfig,
  options: GenerateOptions
): Promise<string> {
  const { segments, aspectRatio, customOrder } = options;
  const engine = new TemplateEngine(template);

  console.log(`Generating video with template: ${template.name}`);

  // 1. Select segments based on template strategy, then turn them into a
  // clip plan (pacing trims, slow motion, cold-open hook)
  const selectedSegments = engine.selectSegments(segments, customOrder);
  const clipPlans = engine.planClips(selectedSegments, customOrder);
  const hasHook = clipPlans[0]?.isHook === true;
  console.log(
    `Selected ${selectedSegments.length} segments` + (hasHook ? ' + cold-open hook' : '')
  );

  // 2. Create intro if configured
  const intro = await engine.createIntro(aspectRatio);
  if (intro) console.log('✓ Created intro');

  // 3. Process each planned clip
  const processedSegments: string[] = [];

  for (let i = 0; i < clipPlans.length; i++) {
    const plan = clipPlans[i];
    const seg = plan.segment;
    console.log(`Processing clip ${i + 1}/${clipPlans.length}${plan.isHook ? ' (hook)' : ''}`);

    // Pull the segment back from R2 if the local cache copy was cleaned up
    seg.path = await ensureLocal(seg.path || null, seg.r2Key ?? null, config.paths.segments);

    // Adjust aspect ratio, applying the plan's trim/speed in the same pass
    const adjustedPath = path.join(
      config.paths.temp,
      `adjusted_${i}_${uuidv4()}.mp4`
    );
    await adjustAspectRatio(seg.path, aspectRatio, adjustedPath, {
      trimStart: plan.trimStart,
      trimDuration: plan.trimDuration,
      speed: plan.speed,
    });

    // Apply visual style filter
    const filterString = engine.getFilterString(aspectRatio);
    let styledPath = adjustedPath;

    if (filterString) {
      styledPath = path.join(
        config.paths.temp,
        `styled_${i}_${uuidv4()}.mp4`
      );
      await applyFilters(adjustedPath, styledPath, filterString);
    }

    // Add text overlay if configured (not on the hook — a one-second teaser
    // flash shouldn't carry a title)
    if (template.textOverlay?.enabled && !plan.isHook) {
      const overlayPath = path.join(
        config.paths.temp,
        `overlay_${i}_${uuidv4()}.mp4`
      );

      let title = `片段 ${i + 1}`;
      if (template.textOverlay.generateWithAI) {
        try {
          const framePath = await extractFrame(seg.path, 0.5);
          const frameBuffer = await fs.readFile(framePath);
          title = await generateTitle(frameBuffer);
          await fs.remove(framePath);
          console.log(`✓ Generated AI title: ${title}`);
        } catch (error) {
          console.error('Failed to generate AI title:', error);
        }
      }

      await addTextOverlay(
        styledPath,
        overlayPath,
        title,
        template.textOverlay,
        aspectRatio
      );
      processedSegments.push(overlayPath);
    } else {
      processedSegments.push(styledPath);
    }
  }

  // 4. Create outro if configured
  const outro = await engine.createOutro(aspectRatio);
  if (outro) console.log('✓ Created outro');

  // 5. Combine all parts (the cold-open hook plays before the intro card)
  const allParts: string[] = [];
  if (hasHook) allParts.push(processedSegments[0]);
  if (intro) allParts.push(intro);
  allParts.push(...processedSegments.slice(hasHook ? 1 : 0));
  if (outro) allParts.push(outro);

  // 6. Concatenate with transitions
  const outputPath = path.join(
    config.paths.results,
    `${template.id}_${Date.now()}.mp4`
  );

  const transitionType = engine.getTransitionSequence(allParts.length - 1, hasHook);
  const transitionDuration = template.transitions.duration;

  const backgroundMusic = await resolveBackgroundMusic(template);
  if (backgroundMusic) {
    console.log(`✓ Using background music: ${path.basename(backgroundMusic)}`);
  }

  await concatVideosWithTransitions(
    allParts,
    outputPath,
    transitionType,
    transitionDuration,
    {
      backgroundMusic,
      musicVolume: template.backgroundMusic?.volume,
      musicFadeIn: template.backgroundMusic?.fadeIn,
      musicFadeOut: template.backgroundMusic?.fadeOut,
      originalVolume: template.audioProcessing.originalVolume,
      keepOriginalAudio: template.audioProcessing.keepOriginal,
    }
  );

  console.log(`✓ Video generated: ${outputPath}`);
  return outputPath;
}

/**
 * Apply visual filters to video
 */
async function applyFilters(
  inputPath: string,
  outputPath: string,
  filterString: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = require('fluent-ffmpeg');
    ffmpeg(inputPath)
      .videoFilters(filterString)
      .outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-c:a', 'copy'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

/**
 * Add text overlay to video
 */
async function addTextOverlay(
  inputPath: string,
  outputPath: string,
  text: string,
  overlay: any,
  aspectRatio: '9:16' | '16:9'
): Promise<void> {
  const fontSize = overlay.fontSize || 60;
  const fontColor = overlay.fontColor || 'white';
  const bgColor = overlay.backgroundColor || 'black@0.5';

  // Escape text for FFmpeg
  const escapedText = text.replace(/'/g, "'\\''").replace(/:/g, '\\:');

  // Position mapping
  const yPosition =
    overlay.position === 'top'
      ? 'h*0.14'
      : overlay.position === 'bottom'
      ? 'h*0.72'
      : 'h/2';

  const boxBorder = Math.max(12, Math.round(fontSize * 0.25));
  const filterString = `drawtext=${fontFileOption()}text='${escapedText}':fontcolor=${fontColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPosition}:box=1:boxcolor=${bgColor}:boxborderw=${boxBorder}:shadowcolor=black@0.65:shadowx=3:shadowy=3`;

  return new Promise((resolve, reject) => {
    const ffmpeg = require('fluent-ffmpeg');
    ffmpeg(inputPath)
      .videoFilters([filterString])
      .outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-c:a', 'copy'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}
