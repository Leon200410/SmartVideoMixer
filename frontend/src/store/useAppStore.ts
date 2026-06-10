import { create } from 'zustand';
import { Segment, VideoInfo } from '../types';

/**
 * Cross-page editing state. Pages re-hydrate from the API on refresh
 * (videoId / generationId live in the URL), this store just keeps the flow
 * snappy between route changes.
 */
interface AppState {
  video: VideoInfo | null;
  /** Template currently selected in the UI */
  templateId: string | null;
  /** Template whose parameters produced the current segments */
  splitTemplateId: string | null;
  segments: Segment[];
  aspectRatio: '9:16' | '16:9';
  orderCustomized: boolean;

  setVideo: (video: VideoInfo | null) => void;
  setTemplateId: (templateId: string | null) => void;
  setSplitTemplateId: (templateId: string | null) => void;
  setSegments: (segments: Segment[], customized?: boolean) => void;
  reorderSegments: (orderedIds: string[]) => void;
  setAspectRatio: (ratio: '9:16' | '16:9') => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  video: null,
  templateId: null,
  splitTemplateId: null,
  segments: [],
  aspectRatio: '9:16',
  orderCustomized: false,

  setVideo: (video) => set({ video }),
  setTemplateId: (templateId) => set({ templateId }),
  setSplitTemplateId: (splitTemplateId) => set({ splitTemplateId }),
  setSegments: (segments, customized = false) =>
    set({ segments, orderCustomized: customized }),
  reorderSegments: (orderedIds) => {
    const map = new Map(get().segments.map((s) => [s.id, s]));
    set({
      segments: orderedIds
        .map((id) => map.get(id))
        .filter(Boolean) as Segment[],
      orderCustomized: true,
    });
  },
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  reset: () =>
    set({
      video: null,
      templateId: null,
      splitTemplateId: null,
      segments: [],
      aspectRatio: '9:16',
      orderCustomized: false,
    }),
}));
