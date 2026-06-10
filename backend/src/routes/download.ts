import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs-extra';
import config from '../config';
import { isR2Enabled, getSignedR2Url, downloadFromR2 } from '../services/r2Storage';
import { resolveUrl } from '../services/storage';
import { findR2KeyByFilename } from '../db';

const router = Router();

/**
 * Locate a served file on local disk. Filenames are reduced to their basename
 * to prevent path traversal.
 */
async function findLocalFile(
  filename: string,
  dirs: string[]
): Promise<string | null> {
  const safeName = path.basename(filename);
  for (const dir of dirs) {
    const filePath = path.join(dir, safeName);
    if (await fs.pathExists(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * When the local cache copy is gone, redirect to the durable R2 copy
 * (public URL when configured, signed URL otherwise).
 */
async function redirectToR2(filename: string, res: Response): Promise<boolean> {
  if (!isR2Enabled()) return false;

  const r2Key = findR2KeyByFilename(path.basename(filename));
  if (!r2Key) return false;

  const url = config.r2.publicUrl
    ? resolveUrl(r2Key, '')
    : await getSignedR2Url(r2Key);
  res.redirect(302, url);
  return true;
}

/**
 * GET /api/download/:filename
 * Download result video (local cache first, R2 fallback)
 */
router.get('/download/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    let filePath = await findLocalFile(filename, [
      config.paths.results,
      config.paths.uploads,
    ]);

    if (!filePath) {
      const r2Key = isR2Enabled() ? findR2KeyByFilename(path.basename(filename)) : null;
      if (!r2Key) {
        return res.status(404).json({ error: 'File not found' });
      }

      filePath = path.join(config.paths.results, path.basename(filename));
      await downloadFromR2(r2Key, filePath);
    }

    res.download(filePath, path.basename(filePath));
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

/**
 * GET /api/stream/:filename
 * Stream video for preview (range requests supported; results + originals)
 */
router.get('/stream/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = await findLocalFile(filename, [
      config.paths.results,
      config.paths.uploads,
      config.paths.segments,
    ]);

    if (!filePath) {
      if (await redirectToR2(filename, res)) return;
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = await fs.stat(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Support range requests for video seeking
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      });

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      });

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    }
  } catch (error) {
    console.error('Stream error:', error);
    res.status(500).json({ error: 'Failed to stream file' });
  }
});

/**
 * GET /api/thumbnail/:filename
 * Serve thumbnail images (local cache first, R2 fallback)
 */
router.get('/thumbnail/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = await findLocalFile(filename, [
      config.paths.segments,
      config.paths.results,
      config.paths.uploads,
    ]);

    if (!filePath) {
      if (await redirectToR2(filename, res)) return;
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    res.setHeader('Content-Type', 'image/jpeg');
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (error) {
    console.error('Thumbnail error:', error);
    res.status(500).json({ error: 'Failed to serve thumbnail' });
  }
});

export { router as downloadRouter };
