import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),

  ai: {
    apiKey: process.env.ARK_API_KEY || process.env.VOLCENGINE_API_KEY || '',
    model: process.env.ARK_MODEL || 'doubao-seed-2-0-mini-260428',
    baseUrl: process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    scoringConcurrency: parseInt(process.env.AI_SCORING_CONCURRENCY || '3', 10),
  },

  jamendo: {
    enabled: process.env.JAMENDO_ENABLED !== 'false',
    clientId: process.env.JAMENDO_CLIENT_ID || '',
    searchLimit: parseInt(process.env.JAMENDO_SEARCH_LIMIT || '12', 10),
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
    maxMultiVideoSizeBytes: 30 * 1024 * 1024, // 30MB per video when uploading multiple
    maxMultiVideoDurationSeconds: 30, // 30 seconds per video when uploading multiple
    maxUploadCount: parseInt(process.env.MAX_UPLOAD_COUNT || '10', 10),
    // video/avi: mimetype most browsers actually report for .avi files
    allowedFormats: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/avi'],
    minSegmentDuration: 5,
    maxSegmentDuration: 8,
    sceneDetectionThreshold: 0.3,
    sceneDetectionFps: parseInt(process.env.SCENE_DETECTION_FPS || '4', 10),
    maxSplitSegments: parseInt(process.env.MAX_SPLIT_SEGMENTS || '36', 10),
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
