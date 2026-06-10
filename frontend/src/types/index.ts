export interface Segment {
  id: string;
  start: number;
  end: number;
  duration: number;
  thumbnailUrl: string;
  geminiScore?: number;
  geminiReason?: string;
}

export interface VideoInfo {
  videoId: string;
  originalName: string;
  duration: number;
  width: number;
  height: number;
  previewUrl: string;
  thumbnailUrl: string;
}

export interface VideoDetail extends VideoInfo {
  templateId: string | null;
  segments: Segment[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  tag: string;
  sampleUrl: string | null;
}

export interface GenerateRequest {
  videoId: string;
  template: string;
  aspectRatio: '9:16' | '16:9';
  segmentOrder?: string[];
}

export type GenerationStatus = 'processing' | 'completed' | 'failed';

export interface Generation {
  generationId: string;
  videoId: string;
  videoName?: string;
  templateId: string;
  title: string;
  aspectRatio: '9:16' | '16:9';
  status: GenerationStatus;
  error?: string;
  duration?: number;
  createdAt: string;
  videoUrl?: string;
  streamUrl?: string;
  thumbnailUrl?: string;
}
