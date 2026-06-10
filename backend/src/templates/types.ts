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
}

export interface VisualStyle {
  filter?: FilterType;
  brightness?: number;
  contrast?: number;
  saturation?: number;
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
  visualStyle: VisualStyle;
  textOverlay?: TextOverlay;
  backgroundMusic?: BackgroundMusic;
  audioProcessing: AudioProcessing;
}
