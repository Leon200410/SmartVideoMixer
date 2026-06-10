import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs-extra';
import { GeminiScoreResult } from '../types';
import config from '../config';
import { extractFrame } from './ffmpegUtils';

if (!config.gemini.apiKey) {
  console.warn('Warning: GEMINI_API_KEY not set. AI scoring will not work.');
}

const genAI = config.gemini.apiKey
  ? new GoogleGenerativeAI(config.gemini.apiKey)
  : null;

const model = genAI?.getGenerativeModel(
  { model: config.gemini.model },
  config.gemini.baseUrl ? { baseUrl: config.gemini.baseUrl } : undefined
);

/**
 * Send a prompt + image to the model and return the raw text reply.
 * Supports the native Gemini protocol and OpenAI-compatible relays.
 */
async function callVision(prompt: string, imageBuffer: Buffer): Promise<string> {
  if (config.gemini.protocol === 'openai') {
    if (!config.gemini.apiKey || !config.gemini.baseUrl) {
      throw new Error('Gemini API not configured (openai protocol needs GEMINI_BASE_URL)');
    }

    const resp = await fetch(`${config.gemini.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.gemini.apiKey}`,
      },
      body: JSON.stringify({
        model: config.gemini.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const body = (await resp.text()).slice(0, 300);
      throw new Error(`Relay API error ${resp.status}: ${body}`);
    }

    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content || '';
  }

  if (!model) {
    throw new Error('Gemini API not configured');
  }

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: imageBuffer.toString('base64'),
      },
    },
  ]);
  return result.response.text();
}

/**
 * Score a single frame
 */
async function scoreFrame(imageBuffer: Buffer): Promise<GeminiScoreResult> {
  const prompt = `You are a professional video editor. Rate this video frame on a scale of 0-10 based on:
- Visual impact (colors, composition, lighting)
- Action or movement
- Emotional appeal
- Uniqueness

Return ONLY a JSON object with this exact format:
{"score": <number 0-10>, "reason": "<brief reason in English, max 20 words>"}`;

  try {
    const text = await callVision(prompt, imageBuffer);
    const jsonMatch = text.match(/\{[^}]+\}/);

    if (!jsonMatch) {
      throw new Error('Gemini did not return valid JSON');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Error scoring frame:', error);
    throw error;
  }
}

/**
 * Score a frame with retry logic
 */
async function scoreFrameWithRetry(
  imageBuffer: Buffer,
  maxRetries: number = 3
): Promise<GeminiScoreResult> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await scoreFrame(imageBuffer);
    } catch (err) {
      console.error(`Attempt ${i + 1} failed:`, err);
      if (i === maxRetries - 1) throw err;
      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Should not reach here');
}

/**
 * Score a video segment: middle frame + one random frame, averaged
 */
export async function scoreSegment(segmentPath: string): Promise<GeminiScoreResult> {
  console.log(`Scoring segment: ${segmentPath}`);

  // Middle frame + a random frame elsewhere in the segment
  const positions = [0.5, Math.round((0.2 + Math.random() * 0.6) * 100) / 100];
  const framePaths: string[] = [];

  try {
    const results: GeminiScoreResult[] = [];
    for (const position of positions) {
      const framePath = await extractFrame(segmentPath, position);
      framePaths.push(framePath);
      const frameBuffer = await fs.readFile(framePath);
      results.push(await scoreFrameWithRetry(frameBuffer));
    }

    const avgScore =
      results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const best = results.reduce((a, b) => (b.score > a.score ? b : a));
    const result: GeminiScoreResult = {
      score: Math.round(avgScore * 10) / 10,
      reason: best.reason,
    };

    console.log(`Score: ${result.score} - ${result.reason}`);
    return result;
  } finally {
    await Promise.all(framePaths.map((p) => fs.remove(p).catch(() => {})));
  }
}

/**
 * Score multiple segments with concurrency control
 */
export async function scoreSegments(
  segmentPaths: string[],
  concurrency: number = 3
): Promise<GeminiScoreResult[]> {
  const results: GeminiScoreResult[] = [];

  for (let i = 0; i < segmentPaths.length; i += concurrency) {
    const batch = segmentPaths.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((path) => scoreSegment(path))
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error('Segment scoring failed:', result.reason);
        // Provide default score for failed segments
        results.push({ score: 5, reason: 'Scoring failed' });
      }
    }
  }

  return results;
}

/**
 * Generate a catchy title for a video frame
 */
export async function generateTitle(imageBuffer: Buffer): Promise<string> {
  const prompt = `You are a social media expert. Look at this video frame and generate a SHORT, catchy title (max 10 words) that creates curiosity or excitement. Use Chinese. Return ONLY the title text, no quotes or extra formatting.`;

  try {
    const text = await callVision(prompt, imageBuffer);
    return text.trim() || '精彩瞬间';
  } catch (error) {
    console.error('Error generating title:', error);
    return '精彩瞬间';
  }
}

export { scoreFrame, scoreFrameWithRetry };
