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
 * Send a prompt + one or more images to Volcengine Ark Responses API and
 * return the text.
 */
async function callVision(prompt: string, imageBuffer: Buffer | Buffer[]): Promise<string> {
  if (!config.ai.apiKey) {
    throw new Error('Ark API not configured');
  }

  const imageBuffers = Array.isArray(imageBuffer) ? imageBuffer : [imageBuffer];
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
            ...imageBuffers.map((buffer) => ({
              type: 'input_image',
              image_url: `data:image/jpeg;base64,${buffer.toString('base64')}`,
            })),
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

  const parsed = JSON.parse(jsonMatch[0]) as {
    score?: unknown;
    reason?: unknown;
    subject?: unknown;
    action?: unknown;
    mood?: unknown;
    risk?: unknown;
  };
  const score = Number(parsed.score);
  if (!Number.isFinite(score)) {
    throw new Error('Ark score is not a number');
  }

  const details = [parsed.subject, parsed.action, parsed.mood]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());
  const risk =
    typeof parsed.risk === 'string' && parsed.risk.trim() && parsed.risk.trim() !== '无'
      ? `风险:${parsed.risk.trim()}`
      : '';
  const reason =
    typeof parsed.reason === 'string' && parsed.reason.trim()
      ? parsed.reason.trim()
      : [...details, risk].filter(Boolean).join('，');

  return {
    score: Math.max(0, Math.min(10, Math.round(score * 10) / 10)),
    reason: reason || 'AI scoring completed',
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
- 极度重要：如果画面模糊、人物闭眼、说话半张嘴、面部表情崩坏、主体不完整，请直接给极低分（0-3分）。

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
 * Score a short segment from ordered keyframes.
 */
async function scoreKeyframes(imageBuffers: Buffer[]): Promise<AIScoreResult> {
  const prompt = `你是一名专业短视频剪辑师。下面的图片按时间顺序来自同一个视频片段（开头/中间/结尾）。
请把它当作一个完整片段理解，而不是孤立截图。重点判断：
- 主体是否明确，人物/物体/场景是否容易一眼看懂
- 是否有动作推进、情绪变化或信息反转
- 是否适合短视频开头、高光或承接段落
- 构图、光线、清晰度、遮挡、闭眼、表情崩坏、运动模糊等质量风险

评分规则：
- 8-10：主体清楚，动作/情绪强，适合作为核心高光
- 5-7：可用但亮点一般，适合承接
- 0-4：主体不清、画质差、无信息量或观感尴尬

只返回 JSON，不要 Markdown，不要额外解释，格式必须是：
{"score": <0-10 的数字>, "subject": "<主体，最多10字>", "action": "<动作/事件，最多12字>", "mood": "<情绪/氛围，最多8字>", "risk": "<主要风险，没有写无>", "reason": "<中文短理由，不超过28字>"}`;

  try {
    return parseScore(await callVision(prompt, imageBuffers));
  } catch (error) {
    console.error('Error scoring keyframes:', error);
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
 * Score a video segment from ordered keyframes, so Ark can understand the
 * mini-story inside the clip instead of judging isolated screenshots.
 */
export async function scoreSegment(segmentPath: string): Promise<AIScoreResult> {
  console.log(`Scoring segment: ${segmentPath}`);

  const positions = [0.18, 0.5, 0.82];
  const framePaths: string[] = [];

  try {
    const frameBuffers: Buffer[] = [];
    for (const position of positions) {
      const framePath = await extractFrame(segmentPath, position);
      framePaths.push(framePath);
      frameBuffers.push(await fs.readFile(framePath));
    }

    const result = await scoreKeyframes(frameBuffers);
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
