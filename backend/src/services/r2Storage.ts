import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import config from '../config';
import fs from 'fs-extra';
import path from 'path';

let s3Client: S3Client | null = null;

/**
 * Initialize R2 client
 */
export function getR2Client(): S3Client | null {
  if (!config.r2.enabled) {
    return null;
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: config.r2.endpoint,
      credentials: {
        accessKeyId: config.r2.accessKeyId!,
        secretAccessKey: config.r2.secretAccessKey!,
      },
      requestHandler: {
        requestTimeout: 300000, // 5 minutes
        connectionTimeout: 60000, // 1 minute
      },
      maxAttempts: 5, // Increase retry attempts
    });
  }

  return s3Client;
}

/**
 * Upload file to R2
 */
export async function uploadToR2(
  localPath: string,
  key: string,
  contentType?: string
): Promise<string> {
  const client = getR2Client();
  if (!client) {
    throw new Error('R2 is not enabled');
  }

  const fileBuffer = await fs.readFile(localPath);

  await client.send(
    new PutObjectCommand({
      Bucket: config.r2.bucketName!,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    })
  );

  // Return public URL
  return `${config.r2.publicUrl}/${key}`;
}

/**
 * Get signed URL for private R2 object (optional, if not using public bucket)
 */
export async function getSignedR2Url(key: string, expiresIn = 3600): Promise<string> {
  const client = getR2Client();
  if (!client) {
    throw new Error('R2 is not enabled');
  }

  const command = new GetObjectCommand({
    Bucket: config.r2.bucketName!,
    Key: key,
  });

  return await getSignedUrl(client, command, { expiresIn });
}

/**
 * Download an R2 object to a local file
 */
export async function downloadFromR2(key: string, destPath: string): Promise<void> {
  const client = getR2Client();
  if (!client) {
    throw new Error('R2 is not enabled');
  }

  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.r2.bucketName!,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`R2 object has no body: ${key}`);
  }

  await fs.ensureDir(path.dirname(destPath));
  await pipeline(response.Body as Readable, fs.createWriteStream(destPath));
}

/**
 * Check if R2 is enabled
 */
export function isR2Enabled(): boolean {
  return config.r2.enabled;
}
