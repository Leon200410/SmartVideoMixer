import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs-extra';
import config from './config';

/**
 * SQLite persistence layer (built-in node:sqlite, no native deps).
 * Replaces the old in-memory videoMetadataStore so videos, segments and
 * generation history survive server restarts.
 */

export interface VideoRow {
  id: string;
  projectId: string;
  originalName: string;
  duration: number;
  width: number;
  height: number;
  localPath: string | null;
  r2Key: string | null;
  thumbLocalPath: string | null;
  thumbR2Key: string | null;
  createdAt: string;
}

export interface SegmentRow {
  id: string;
  videoId: string;
  sourceVideoId: string | null;
  sourceName: string | null;
  seq: number;
  startTime: number;
  endTime: number;
  duration: number;
  localPath: string | null;
  r2Key: string | null;
  thumbLocalPath: string | null;
  thumbR2Key: string | null;
  score: number | null;
  reason: string | null;
  templateId: string | null;
  createdAt: string;
}

export type GenerationStatus = 'processing' | 'completed' | 'failed';

export interface GenerationRow {
  id: string;
  videoId: string;
  templateId: string;
  title: string;
  aspectRatio: string;
  status: GenerationStatus;
  error: string | null;
  duration: number | null;
  localPath: string | null;
  r2Key: string | null;
  thumbLocalPath: string | null;
  thumbR2Key: string | null;
  createdAt: string;
  completedAt: string | null;
}

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) {
    fs.ensureDirSync(config.paths.data);
    db = new DatabaseSync(path.join(config.paths.data, 'app.db'));
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db);
  }
  return db;
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      original_name TEXT NOT NULL,
      duration REAL NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      local_path TEXT,
      r2_key TEXT,
      thumb_local_path TEXT,
      thumb_r2_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS segments (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      source_video_id TEXT,
      source_name TEXT,
      seq INTEGER NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      duration REAL NOT NULL,
      local_path TEXT,
      r2_key TEXT,
      thumb_local_path TEXT,
      thumb_r2_key TEXT,
      score REAL,
      reason TEXT,
      template_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_segments_video ON segments(video_id, seq);

    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL,
      title TEXT NOT NULL,
      aspect_ratio TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      error TEXT,
      duration REAL,
      local_path TEXT,
      r2_key TEXT,
      thumb_local_path TEXT,
      thumb_r2_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_generations_created ON generations(created_at DESC);
  `);

  const videoColumns = db.prepare('PRAGMA table_info(videos)').all() as Array<{ name: string }>;
  if (!videoColumns.some((col) => col.name === 'project_id')) {
    db.exec('ALTER TABLE videos ADD COLUMN project_id TEXT');
    db.exec('UPDATE videos SET project_id = id WHERE project_id IS NULL');
  }
  db.exec('UPDATE videos SET project_id = id WHERE project_id IS NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_videos_project ON videos(project_id, created_at)');

  const segmentColumns = db.prepare('PRAGMA table_info(segments)').all() as Array<{ name: string }>;
  if (!segmentColumns.some((col) => col.name === 'source_video_id')) {
    db.exec('ALTER TABLE segments ADD COLUMN source_video_id TEXT');
  }
  if (!segmentColumns.some((col) => col.name === 'source_name')) {
    db.exec('ALTER TABLE segments ADD COLUMN source_name TEXT');
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toVideo(row: any): VideoRow {
  return {
    id: row.id,
    projectId: row.project_id || row.id,
    originalName: row.original_name,
    duration: row.duration,
    width: row.width,
    height: row.height,
    localPath: row.local_path,
    r2Key: row.r2_key,
    thumbLocalPath: row.thumb_local_path,
    thumbR2Key: row.thumb_r2_key,
    createdAt: row.created_at,
  };
}

function toSegment(row: any): SegmentRow {
  return {
    id: row.id,
    videoId: row.video_id,
    sourceVideoId: row.source_video_id,
    sourceName: row.source_name,
    seq: row.seq,
    startTime: row.start_time,
    endTime: row.end_time,
    duration: row.duration,
    localPath: row.local_path,
    r2Key: row.r2_key,
    thumbLocalPath: row.thumb_local_path,
    thumbR2Key: row.thumb_r2_key,
    score: row.score,
    reason: row.reason,
    templateId: row.template_id,
    createdAt: row.created_at,
  };
}

function toGeneration(row: any): GenerationRow {
  return {
    id: row.id,
    videoId: row.video_id,
    templateId: row.template_id,
    title: row.title,
    aspectRatio: row.aspect_ratio,
    status: row.status as GenerationStatus,
    error: row.error,
    duration: row.duration,
    localPath: row.local_path,
    r2Key: row.r2_key,
    thumbLocalPath: row.thumb_local_path,
    thumbR2Key: row.thumb_r2_key,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

// ---------- videos ----------

export function insertVideo(v: {
  id: string;
  projectId?: string | null;
  originalName: string;
  duration: number;
  width: number;
  height: number;
  localPath?: string | null;
  r2Key?: string | null;
  thumbLocalPath?: string | null;
  thumbR2Key?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO videos (id, project_id, original_name, duration, width, height, local_path, r2_key, thumb_local_path, thumb_r2_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      v.id,
      v.projectId ?? v.id,
      v.originalName,
      v.duration,
      v.width,
      v.height,
      v.localPath ?? null,
      v.r2Key ?? null,
      v.thumbLocalPath ?? null,
      v.thumbR2Key ?? null
    );
}

export function getVideo(id: string): VideoRow | null {
  const row = getDb().prepare('SELECT * FROM videos WHERE id = ?').get(id);
  return row ? toVideo(row) : null;
}

export function getProjectVideos(projectId: string): VideoRow[] {
  const rows = getDb()
    .prepare('SELECT * FROM videos WHERE project_id = ? ORDER BY created_at ASC, rowid ASC')
    .all(projectId)
    .map(toVideo);

  if (rows.length > 0) return rows;

  const single = getVideo(projectId);
  return single ? [single] : [];
}

// ---------- segments ----------

export function replaceSegments(
  videoId: string,
  templateId: string | null,
  segments: Array<{
    id: string;
    seq: number;
    sourceVideoId?: string | null;
    sourceName?: string | null;
    startTime: number;
    endTime: number;
    duration: number;
    localPath?: string | null;
    r2Key?: string | null;
    thumbLocalPath?: string | null;
    thumbR2Key?: string | null;
    score?: number | null;
    reason?: string | null;
  }>
): void {
  const d = getDb();
  d.exec('BEGIN');
  try {
    d.prepare('DELETE FROM segments WHERE video_id = ?').run(videoId);
    const stmt = d.prepare(
      `INSERT INTO segments (id, video_id, source_video_id, source_name, seq, start_time, end_time, duration, local_path, r2_key, thumb_local_path, thumb_r2_key, score, reason, template_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const s of segments) {
      stmt.run(
        s.id,
        videoId,
        s.sourceVideoId ?? null,
        s.sourceName ?? null,
        s.seq,
        s.startTime,
        s.endTime,
        s.duration,
        s.localPath ?? null,
        s.r2Key ?? null,
        s.thumbLocalPath ?? null,
        s.thumbR2Key ?? null,
        s.score ?? null,
        s.reason ?? null,
        templateId
      );
    }
    d.exec('COMMIT');
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

export function getSegmentsByVideo(videoId: string): SegmentRow[] {
  return getDb()
    .prepare('SELECT * FROM segments WHERE video_id = ? ORDER BY seq ASC')
    .all(videoId)
    .map(toSegment);
}

export function updateSegmentLocalPaths(
  id: string,
  patch: { localPath?: string | null; thumbLocalPath?: string | null }
): void {
  if (patch.localPath !== undefined) {
    getDb().prepare('UPDATE segments SET local_path = ? WHERE id = ?').run(patch.localPath, id);
  }
  if (patch.thumbLocalPath !== undefined) {
    getDb()
      .prepare('UPDATE segments SET thumb_local_path = ? WHERE id = ?')
      .run(patch.thumbLocalPath, id);
  }
}

// ---------- generations ----------

export function insertGeneration(g: {
  id: string;
  videoId: string;
  templateId: string;
  title: string;
  aspectRatio: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO generations (id, video_id, template_id, title, aspect_ratio, status)
       VALUES (?, ?, ?, ?, ?, 'processing')`
    )
    .run(g.id, g.videoId, g.templateId, g.title, g.aspectRatio);
}

export function completeGeneration(
  id: string,
  patch: {
    duration: number;
    localPath?: string | null;
    r2Key?: string | null;
    thumbLocalPath?: string | null;
    thumbR2Key?: string | null;
  }
): void {
  getDb()
    .prepare(
      `UPDATE generations
       SET status = 'completed', duration = ?, local_path = ?, r2_key = ?,
           thumb_local_path = ?, thumb_r2_key = ?, completed_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      patch.duration,
      patch.localPath ?? null,
      patch.r2Key ?? null,
      patch.thumbLocalPath ?? null,
      patch.thumbR2Key ?? null,
      id
    );
}

export function failGeneration(id: string, error: string): void {
  getDb()
    .prepare(
      `UPDATE generations SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?`
    )
    .run(error.slice(0, 500), id);
}

export function getGeneration(id: string): GenerationRow | null {
  const row = getDb().prepare('SELECT * FROM generations WHERE id = ?').get(id);
  return row ? toGeneration(row) : null;
}

/**
 * Find the R2 key for a stored file by its basename (all R2 keys end with the
 * file's basename). Used by download/stream routes to redirect to R2 when the
 * local cache copy has been cleaned up.
 */
export function findR2KeyByFilename(filename: string): string | null {
  const d = getDb();
  const like = `%/${filename}`;
  const queries = [
    'SELECT r2_key AS k FROM generations WHERE r2_key LIKE ? LIMIT 1',
    'SELECT thumb_r2_key AS k FROM generations WHERE thumb_r2_key LIKE ? LIMIT 1',
    'SELECT r2_key AS k FROM videos WHERE r2_key LIKE ? LIMIT 1',
    'SELECT thumb_r2_key AS k FROM videos WHERE thumb_r2_key LIKE ? LIMIT 1',
    'SELECT r2_key AS k FROM segments WHERE r2_key LIKE ? LIMIT 1',
    'SELECT thumb_r2_key AS k FROM segments WHERE thumb_r2_key LIKE ? LIMIT 1',
  ];
  for (const q of queries) {
    const row = d.prepare(q).get(like) as { k?: string } | undefined;
    if (row?.k) return row.k;
  }
  return null;
}

export function listGenerations(limit = 50): Array<GenerationRow & { videoName: string }> {
  return getDb()
    .prepare(
      `SELECT g.*, v.original_name AS video_name
       FROM generations g JOIN videos v ON v.id = g.video_id
       ORDER BY g.created_at DESC, g.rowid DESC
       LIMIT ?`
    )
    .all(limit)
    .map((row: any) => ({ ...toGeneration(row), videoName: row.video_name }));
}
