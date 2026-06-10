import { Router, Request, Response } from 'express';
import * as db from '../db';
import { generationToApi } from './generate';

const router = Router();

/**
 * GET /api/history
 * Recent generations, newest first
 */
router.get('/history', (req: Request, res: Response) => {
  const items = db.listGenerations(100).map(generationToApi);
  res.json({ items });
});

/**
 * GET /api/history/:id
 * A single generation record (used by the result page)
 */
router.get('/history/:id', (req: Request, res: Response) => {
  const gen = db.getGeneration(req.params.id);
  if (!gen) {
    return res.status(404).json({ error: 'Generation not found' });
  }
  const video = db.getVideo(gen.videoId);
  res.json(generationToApi({ ...gen, videoName: video?.originalName }));
});

export { router as historyRouter };
