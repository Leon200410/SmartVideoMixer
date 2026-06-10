/**
 * Template configuration types
 */

export type SegmentSelectionStrategy = 'top-scored' | 'first-best-last' | 'all' | 'custom';
export type TransitionType = 'fade' | 'wipe' | 'slide' | 'zoom' | 'none';
export type FilterType = 'warm' | 'cool' | 'vibrant' | 'bw' | 'cinematic' | 'none';
export type TextPosition = 'top' | 'center' | 'bottom';

export interface SegmentSelection {
  strategy: SegmentSelectionStrategy;
  maxSegments?: number;
  minDuration?: number;
  maxDuration?: number;
  sortBy?: 'score' | 'time';
}

export interface IntroOutro {
  duration: number;
  type: 'text' | 'image';
  text?: string;
  style?: {
    backgroundColor?: string;
    textColor?: string;
    fontSize?: number;
  };
}

export interface Layout {
  intro?: IntroOutro;
  outro?: IntroOutro;
}

export interface Transitions {
  type: TransitionType;
  duration: number;
  /**
   * Optional pool of raw ffmpeg xfade transition names cycled per cut
   * (e.g. ["slideleft", "wipeleft", "smoothup"]). Overrides `type` when set.
   */
  variety?: string[];
}

export interface Pacing {
  /**
   * Target on-screen seconds per clip position; the last value repeats for
   * the remaining clips. Longer clips are center-trimmed to the target so the
   * cut keeps the action in the middle of the segment.
   */
  pattern?: number[];
  /**
   * Cold open: flash the best-scored moment before the story starts
   * (skipped when the user hand-ordered segments).
   */
  hook?: {
    enabled: boolean;
    duration?: number;
  };
  /** Playback rate for story clips, e.g. 0.85 = slight slow motion. */
  speed?: number;
}

export interface VisualStyle {
  filter?: FilterType;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  kenBurns?: boolean;
}

export interface TextOverlay {
  enabled: boolean;
  position: TextPosition;
  fontSize: number;
  fontColor: string;
  backgroundColor?: string;
  generateWithAI: boolean;
}

export interface BackgroundMusic {
  enabled: boolean;
  file?: string;
  jamendoTags?: string[];
  jamendoSearch?: string;
  jamendoVocal?: 'instrumental' | 'vocal' | 'both';
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface AudioProcessing {
  keepOriginal: boolean;
  originalVolume: number;
  normalize: boolean;
}

export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  tag: string;
  segmentSelection: SegmentSelection;
  layout: Layout;
  transitions: Transitions;
  pacing?: Pacing;
  visualStyle: VisualStyle;
  textOverlay?: TextOverlay;
  backgroundMusic?: BackgroundMusic;
  audioProcessing: AudioProcessing;
}
