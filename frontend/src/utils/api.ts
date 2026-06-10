import axios from 'axios';
import {
  VideoDetail,
  GenerateRequest,
  Generation,
  Template,
  Segment,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 600000, // 10 minutes: splitting + generation are long-running
});

export const videoApi = {
  getVideo: async (videoId: string): Promise<VideoDetail> => {
    const response = await api.get<VideoDetail>(`/video/${videoId}`);
    return response.data;
  },

  splitVideo: async (
    videoId: string,
    templateId: string
  ): Promise<{ videoId: string; templateId: string; segments: Segment[] }> => {
    const response = await api.post(`/video/${videoId}/split`, { templateId });
    return response.data;
  },

  generateVideo: async (request: GenerateRequest): Promise<Generation> => {
    const response = await api.post<Generation>('/generate', request);
    return response.data;
  },

  getTemplates: async (): Promise<Template[]> => {
    const response = await api.get<{ templates: Template[] }>('/templates');
    return response.data.templates;
  },

  getHistory: async (): Promise<Generation[]> => {
    const response = await api.get<{ items: Generation[] }>('/history');
    return response.data.items;
  },

  getGeneration: async (generationId: string): Promise<Generation> => {
    const response = await api.get<Generation>(`/history/${generationId}`);
    return response.data;
  },
};

export default api;
