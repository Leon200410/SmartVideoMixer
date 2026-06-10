import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs-extra';
import cron from 'node-cron';
import config from './config';
import { uploadRouter } from './routes/upload';
import { generateRouter } from './routes/generate';
import { downloadRouter } from './routes/download';
import { historyRouter } from './routes/history';
import { templateRegistry } from './templates/registry';
import { getDb } from './db';
import { isR2Enabled } from './services/r2Storage';
import { ensurePlaceholderMusic } from './services/musicLibrary';
import { ensureTemplateSamples } from './services/sampleGenerator';
import { primeFfmpegCapabilities } from './services/ffmpegUtils';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure required directories exist
async function ensureDirectories() {
  await fs.ensureDir(config.paths.uploads);
  await fs.ensureDir(config.paths.segments);
  await fs.ensureDir(config.paths.results);
  await fs.ensureDir(config.paths.temp);
  await fs.ensureDir(config.paths.fonts);
  await fs.ensureDir(config.paths.music);
  await fs.ensureDir(config.paths.samples);
  await fs.ensureDir(config.paths.data);
  console.log('✓ All required directories created');
}

// Cleanup old files.
// temp/ is always fair game. uploads/segments/results are only a local cache
// when R2 is enabled (they can be restored from R2 on demand); without R2
// they are the only copy backing history/regeneration, so they are kept.
async function cleanupOldFiles() {
  const now = Date.now();
  const maxAge = config.cleanup.maxFileAgeHours * 60 * 60 * 1000;

  const cleanupDir = async (dirPath: string) => {
    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = await fs.stat(filePath);

        if (now - stat.mtimeMs > maxAge) {
          await fs.remove(filePath);
          console.log(`Cleaned up: ${filePath}`);
        }
      }
    } catch (error) {
      console.error(`Error cleaning ${dirPath}:`, error);
    }
  };

  await cleanupDir(config.paths.temp);
  if (isR2Enabled()) {
    await cleanupDir(config.paths.uploads);
    await cleanupDir(config.paths.segments);
    await cleanupDir(config.paths.results);
  }
}

// Schedule cleanup
function setupCleanupCron() {
  const schedule = `0 */${config.cleanup.intervalHours} * * *`; // Every N hours
  cron.schedule(schedule, async () => {
    console.log('Running scheduled cleanup...');
    await cleanupOldFiles();
  });
  console.log(
    `✓ Cleanup scheduled every ${config.cleanup.intervalHours} hours ` +
      `(${isR2Enabled() ? 'temp + local R2 cache' : 'temp only, no R2 configured'})`
  );
}

// Routes
app.use('/api', uploadRouter);
app.use('/api', generateRouter);
app.use('/api', downloadRouter);
app.use('/api', historyRouter);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    aiConfigured: !!config.ai.apiKey,
    r2Enabled: isR2Enabled(),
  });
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'SmartVideoMixer API',
    version: '2.0.0',
    endpoints: {
      health: 'GET /api/health',
      upload: 'POST /api/upload',
      video: 'GET /api/video/:videoId',
      split: 'POST /api/video/:videoId/split',
      templates: 'GET /api/templates',
      templateSample: 'GET /api/templates/:id/sample',
      generate: 'POST /api/generate',
      history: 'GET /api/history',
      historyItem: 'GET /api/history/:id',
      download: 'GET /api/download/:filename',
      stream: 'GET /api/stream/:filename',
      thumbnail: 'GET /api/thumbnail/:filename',
    },
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
async function start() {
  try {
    await ensureDirectories();

    // Make fluent-ffmpeg accept lavfi inputs (see primeFfmpegCapabilities)
    await primeFfmpegCapabilities();

    // Open the SQLite database (creates schema on first run)
    getDb();
    console.log('✓ Database ready');

    // Load template configurations
    await templateRegistry.loadAll();

    setupCleanupCron();

    if (!config.ai.apiKey) {
      console.warn('⚠️  Warning: ARK_API_KEY not set. AI features will not work.');
      console.warn('   Please set it in .env file');
    }

    app.listen(config.port, () => {
      console.log('');
      console.log('🎬 SmartVideoMixer Backend');
      console.log(`🚀 Server running at http://localhost:${config.port}`);
      console.log(`📊 Model: ${config.ai.model}`);
      console.log(`☁️  R2 storage: ${isR2Enabled() ? 'enabled' : 'disabled (local only)'}`);
      console.log(`🎨 Templates loaded: ${templateRegistry.getAllIds().join(', ')}`);
      console.log('');
    });

    // Background bootstrap: placeholder music first (samples mix it in),
    // then per-template sample clips. Best-effort, never blocks startup.
    void (async () => {
      await ensurePlaceholderMusic();
      await ensureTemplateSamples(templateRegistry.getAll());
    })().catch((error) => {
      console.warn('Asset bootstrap failed:', error);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
