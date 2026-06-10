export interface Segment {
  id: string;
  path: string;
  start: number;
  end: number;
  duration: number;
  thumbnail: string;
  r2Key?: string | null;
  geminiScore?: number;
  geminiReason?: string;
}

export interface GenerateRequest {
  videoId: string;
  template: string;
  aspectRatio: '9:16' | '16:9';
  segmentOrder?: string[];
}

export interface AIScoreResult {
  score: number;
  reason: string;
}
