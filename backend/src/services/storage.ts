import path from 'path';
import fs from 'fs-extra';
import config from '../config';
import { uploadToR2, downloadFromR2, isR2Enabled } from './r2Storage';

/**
 * Storage facade: local disk is the ffmpeg working cache, R2 (when enabled)
 * is the durable copy. Files are written locally first, mirrored to R2, and
 * pulled back from R2 whenever the local cache was cleaned up or the server
 * restarted on a fresh disk.
 */

/**
 * Mirror a local file to R2. Returns the R2 key on success, or null when R2
 * is disabled or the upload failed (the local file keeps working either way).
 */
export async function mirrorToR2(
  localPath: string,
  key: string,
  contentType: string
): Promise<string | null> {
  if (!isR2Enabled()) return null;

  try {
    await uploadToR2(localPath, key, contentType);
    return key;
  } catch (error) {
    console.warn(
      `⚠️  R2 upload failed for ${key}, falling back to local storage:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Make sure a file referenced by (localPath, r2Key) exists on local disk so
 * ffmpeg can read it. Restores it from R2 when the local copy is gone.
 * Returns the usable local path.
 */
export async function ensureLocal(
  localPath: string | null,
  r2Key: string | null,
  restoreDir: string
): Promise<string> {
  if (localPath && (await fs.pathExists(localPath))) {
    return localPath;
  }

  if (r2Key && isR2Enabled()) {
    const target = localPath || path.join(restoreDir, path.basename(r2Key));
    console.log(`Restoring from R2: ${r2Key} -> ${target}`);
    await downloadFromR2(r2Key, target);
    return target;
  }

  throw new Error(
    `File is gone from local disk and no R2 copy exists (local=${localPath}, r2=${r2Key}). ` +
      'It may have been removed by the cleanup job — please upload again.'
  );
}

/**
 * Build the URL a browser should use for a stored file: the R2 public URL
 * when a durable copy exists, otherwise the local API route.
 */
export function resolveUrl(r2Key: string | null, localApiUrl: string): string {
  if (r2Key && isR2Enabled() && config.r2.publicUrl) {
    return `${config.r2.publicUrl}/${r2Key}`;
  }
  return localApiUrl;
}
