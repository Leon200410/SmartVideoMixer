import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    // Optional relay/proxy base URL (e.g. https://my-relay.example.com).
    // Empty = Google's official endpoint.
    baseUrl: process.env.GEMINI_BASE_URL || '',
    // 'native' = Gemini protocol (/v1beta/...), 'openai' = OpenAI-compatible
    // chat/completions (what most one-api/new-api relays expose)
    protocol: process.env.GEMINI_PROTOCOL || 'native',
  },

  paths: {
    uploads: path.resolve(__dirname, '../uploads'),
    segments: path.resolve(__dirname, '../segments'),
    results: path.resolve(__dirname, '../results'),
    temp: path.resolve(__dirname, '../temp'),
    fonts: path.resolve(__dirname, '../assets/fonts'),
    music: path.resolve(__dirname, '../assets/music'),
    samples: path.resolve(__dirname, '../assets/samples'),
    data: path.resolve(__dirname, '../data'),
  },

  // Explicit font file for ffmpeg drawtext (Chinese text). Empty = auto-detect
  // (assets/fonts -> system fonts).
  fontPath: process.env.FONT_PATH || '',

  video: {
    maxSizeBytes: 200 * 1024 * 1024, // 200MB
    maxDurationSeconds: 600, // 10 minutes
    // video/avi: mimetype most browsers actually report for .avi files
    allowedFormats: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/avi'],
    minSegmentDuration: 5,
    maxSegmentDuration: 8,
    sceneDetectionThreshold: 0.3,
  },

  r2: {
    enabled: process.env.R2_ENABLED === 'true',
    endpoint: process.env.R2_ENDPOINT,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
    publicUrl: process.env.R2_PUBLIC_URL,
  },

  cleanup: {
    intervalHours: parseInt(process.env.CLEANUP_INTERVAL_HOURS || '2', 10),
    maxFileAgeHours: parseInt(process.env.MAX_FILE_AGE_HOURS || '2', 10),
  },
};

export default config;
