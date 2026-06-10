import fs from 'fs-extra';
import { AIScoreResult } from '../types';
import config from '../config';
import { extractFrame } from './ffmpegUtils';

if (!config.ai.apiKey) {
  console.warn('Warning: ARK_API_KEY not set. AI scoring will not work.');
}

interface ArkTextContent {
  type?: string;
  text?: string;
}

interface ArkOutputItem {
  content?: ArkTextContent[];
}

interface ArkResponse {
  output_text?: string;
  output?: ArkOutputItem[];
}

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  if (typeof timer === 'object' && 'unref' in timer) {
    timer.unref();
  }
  return controller.signal;
}

function extractArkText(data: ArkResponse): string {
  if (typeof data.output_text === 'string') {
    return data.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  return parts.join('\n').trim();
}

/**
 * Send a prompt + image to Volcengine Ark Responses API and return the text.
 */
async function callVision(prompt: string, imageBuffer: Buffer): Promise<string> {
  if (!config.ai.apiKey) {
    throw new Error('Ark API not configured');
  }

  const baseUrl = config.ai.baseUrl.replace(/\/$/, '');
  const resp = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    signal: withTimeout(45000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ai.apiKey}`,
    },
    body: JSON.stringify({
      model: config.ai.model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_image',
              image_url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`,
            },
            {
              type: 'input_text',
              text: prompt,
            },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const body = (await resp.text()).slice(0, 500);
    throw new Error(`Ark API error ${resp.status}: ${body}`);
  }

  const data = (await resp.json()) as ArkResponse;
  const text = extractArkText(data);
  if (!text) {
    throw new Error('Ark API returned no text');
  }
  return text;
}

function parseScore(text: string): AIScoreResult {
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    throw new Error('Ark did not return valid JSON');
  }

  const parsed = JSON.parse(jsonMatch[0]) as { score?: unknown; reason?: unknown };
  const score = Number(parsed.score);
  if (!Number.isFinite(score)) {
    throw new Error('Ark score is not a number');
  }

  return {
    score: Math.max(0, Math.min(10, Math.round(score * 10) / 10)),
    reason: typeof parsed.reason === 'string' && parsed.reason.trim()
      ? parsed.reason.trim()
      : 'AI scoring completed',
  };
}

/**
 * Score a single frame.
 */
async function scoreFrame(imageBuffer: Buffer): Promise<AIScoreResult> {
  const prompt = `你是一名专业短视频剪辑师。请从 0-10 分评价这帧画面是否适合做精彩短视频片段，重点看：
- 画面冲击力、构图、光线和颜色
- 动作感或信息密度
- 情绪吸引力
- 独特性和传播潜力

只返回 JSON，不要 Markdown，不要额外解释，格式必须是：
{"score": <0-10 的数字>, "reason": "<中文短理由，不超过 20 个字>"}`;

  try {
    return parseScore(await callVision(prompt, imageBuffer));
  } catch (error) {
    console.error('Error scoring frame:', error);
    throw error;
  }
}

/**
 * Score a frame with retry logic.
 */
async function scoreFrameWithRetry(
  imageBuffer: Buffer,
  maxRetries: number = 3
): Promise<AIScoreResult> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await scoreFrame(imageBuffer);
    } catch (err) {
      console.error(`Attempt ${i + 1} failed:`, err);
      if (i === maxRetries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Should not reach here');
}

/**
 * Score a video segment: middle frame + one random frame, averaged.
 */
export async function scoreSegment(segmentPath: string): Promise<AIScoreResult> {
  console.log(`Scoring segment: ${segmentPath}`);

  const positions = [0.5, Math.round((0.2 + Math.random() * 0.6) * 100) / 100];
  const framePaths: string[] = [];

  try {
    const results: AIScoreResult[] = [];
    for (const position of positions) {
      const framePath = await extractFrame(segmentPath, position);
      framePaths.push(framePath);
      const frameBuffer = await fs.readFile(framePath);
      results.push(await scoreFrameWithRetry(frameBuffer));
    }

    const avgScore =
      results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const best = results.reduce((a, b) => (b.score > a.score ? b : a));
    const result: AIScoreResult = {
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
 * Score multiple segments with concurrency control.
 */
export async function scoreSegments(
  segmentPaths: string[],
  concurrency: number = 3
): Promise<AIScoreResult[]> {
  const results: AIScoreResult[] = [];

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
        results.push({ score: 5, reason: 'AI scoring failed' });
      }
    }
  }

  return results;
}

/**
 * Generate a catchy title for a video frame.
 */
export async function generateTitle(imageBuffer: Buffer): Promise<string> {
  const prompt = '看这帧画面，生成一个适合短视频封面的大字标题。中文，最多 10 个字。只返回标题文本。';

  try {
    const text = await callVision(prompt, imageBuffer);
    return text.replace(/^["'“”]+|["'“”]+$/g, '').trim() || '精彩瞬间';
  } catch (error) {
    console.error('Error generating title:', error);
    return '精彩瞬间';
  }
}

export { scoreFrame, scoreFrameWithRetry };
