import 'dotenv/config';
import express, { Request, Response } from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const VIDEOS_DIR = path.resolve(DATA_DIR, 'videos');
const CLIPS_DIR = path.resolve(process.cwd(), 'public', 'clips');
const DB_FILE = path.resolve(DATA_DIR, 'db.json');

const ALLOWED_ASPECT_RATIOS = new Set(['16:9', '9:16']);
const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const SAFE_VIDEO_NAME_RE = /^[a-zA-Z0-9_-]+\.mp4$/;
const MAX_IMAGE_BASE64_BYTES = 12 * 1024 * 1024; // ~12MB base64 payload limit

interface StoredDb {
  episodes: unknown[];
  difficultItems: unknown[] | null;
}

fs.mkdirSync(VIDEOS_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify({ episodes: [], difficultItems: null }, null, 2),
    'utf-8'
  );
}

let dbQueue = Promise.resolve();

function withDbLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = dbQueue.then(fn, fn);
  dbQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function readDb(): Promise<StoredDb> {
  try {
    const raw = await fsp.readFile(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoredDb>;
    return {
      episodes: Array.isArray(parsed.episodes) ? parsed.episodes : [],
      difficultItems: Array.isArray(parsed.difficultItems)
        ? parsed.difficultItems
        : null,
    };
  } catch {
    return { episodes: [], difficultItems: null };
  }
}

async function writeDb(data: StoredDb): Promise<void> {
  const tempFile = `${DB_FILE}.${process.pid}.tmp`;
  await fsp.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  await fsp.rename(tempFile, DB_FILE);
}

function getGenAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

interface ExtractedVideo {
  buffer: Buffer;
  mimeType: string;
}

function extractVideoFromInteraction(interaction: unknown): {
  data?: string;
  uri?: string;
  mimeType?: string;
} {
  const obj = interaction as {
    output_video?: { data?: string; uri?: string; mime_type?: string };
    outputs?: Array<{
      type?: string;
      data?: string;
      uri?: string;
      mime_type?: string;
    }>;
  };

  if (obj?.output_video?.data || obj?.output_video?.uri) {
    return {
      data: obj.output_video.data,
      uri: obj.output_video.uri,
      mimeType: obj.output_video.mime_type || 'video/mp4',
    };
  }

  if (Array.isArray(obj?.outputs)) {
    const videoOut = obj.outputs.find(
      (item) => item?.type === 'video' || item?.mime_type?.startsWith('video/')
    );
    if (videoOut && (videoOut.data || videoOut.uri)) {
      return {
        data: videoOut.data,
        uri: videoOut.uri,
        mimeType: videoOut.mime_type || 'video/mp4',
      };
    }
  }

  return {};
}

async function materializeVideoBuffer(
  interaction: unknown
): Promise<ExtractedVideo> {
  const extracted = extractVideoFromInteraction(interaction);
  if (extracted.data) {
    const clean = extracted.data.replace(/^data:[^;]+;base64,/, '');
    return {
      buffer: Buffer.from(clean, 'base64'),
      mimeType: extracted.mimeType || 'video/mp4',
    };
  }

  if (extracted.uri) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(extracted.uri);
    } catch {
      throw new Error('Model returned an invalid video URI.');
    }
    const allowedHosts = new Set([
      'generativelanguage.googleapis.com',
      'storage.googleapis.com',
    ]);
    if (
      parsedUrl.protocol !== 'https:' ||
      !allowedHosts.has(parsedUrl.hostname)
    ) {
      throw new Error('Model returned a video URI outside approved Google hosts.');
    }

    const headers: Record<string, string> = {};
    if (
      parsedUrl.hostname === 'generativelanguage.googleapis.com' &&
      process.env.GEMINI_API_KEY
    ) {
      headers['x-goog-api-key'] = process.env.GEMINI_API_KEY;
    }

    const res = await fetch(parsedUrl.toString(), { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch generated video (${res.status}).`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: extracted.mimeType || 'video/mp4',
    };
  }

  throw new Error('The video generation response did not contain playable video data.');
}

function formatApiError(err: unknown): { status: number; message: string } {
  const e = err as {
    status?: number;
    code?: number;
    message?: string;
    error?: { code?: number; message?: string; status?: string };
  };

  const status =
    typeof e?.status === 'number'
      ? e.status
      : typeof e?.error?.code === 'number'
        ? e.error.code
        : 500;

  const rawMessage =
    e?.error?.message || e?.message || 'Unexpected video generation error.';

  const safeStatus = status >= 400 && status < 600 ? status : 500;
  return { status: safeStatus, message: rawMessage };
}

function buildCueLinesFromScript(
  scriptText: string,
  speakerName: string
): Array<{
  id: string;
  startSec: number;
  endSec: number;
  speaker: string;
  tokens: Array<{ text: string }>;
  azSubtitle: string;
}> {
  const cleanedLines = scriptText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  const lines =
    cleanedLines.length > 0
      ? cleanedLines
      : [
          'Observe the subtle cadence of every unfamiliar expression within this scene.',
        ];

  const step = Math.max(2, Math.floor(10 / lines.length));
  return lines.map((line, index) => ({
    id: `gen-cue-${index + 1}`,
    startSec: index * step,
    endSec: (index + 1) * step,
    speaker: speakerName,
    tokens: [{ text: line }],
    azSubtitle: 'Səhnədəki istənilən sözə klikləyərək tərcümə edin və çətin sözlərə əlavə edin.',
  }));
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '16mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get('/api/episodes', async (_req: Request, res: Response) => {
    const db = await readDb();
    res.json({ episodes: db.episodes });
  });

  app.delete('/api/episodes/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'Episode ID is required.' });
      return;
    }

    await withDbLock(async () => {
      const db = await readDb();
      const target = db.episodes.find(
        (ep) => (ep as { id?: string }).id === id
      ) as { videoUrl?: string } | undefined;

      if (!target) {
        res.status(404).json({ error: 'Episode not found.' });
        return;
      }

      if (target.videoUrl && target.videoUrl.startsWith('/api/videos/file/')) {
        const filename = target.videoUrl.replace('/api/videos/file/', '');
        if (SAFE_VIDEO_NAME_RE.test(filename)) {
          const resolved = path.resolve(VIDEOS_DIR, filename);
          if (resolved.startsWith(VIDEOS_DIR + path.sep)) {
            await fsp.unlink(resolved).catch(() => undefined);
          }
        }
      }

      db.episodes = db.episodes.filter(
        (ep) => (ep as { id?: string }).id !== id
      );
      await writeDb(db);
      res.json({ ok: true });
    });
  });

  app.get('/api/difficult-words', async (_req: Request, res: Response) => {
    const db = await readDb();
    res.json({ items: db.difficultItems });
  });

  app.put('/api/difficult-words', async (req: Request, res: Response) => {
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length > 500) {
      res.status(400).json({ error: 'Expected an array of difficult items.' });
      return;
    }

    await withDbLock(async () => {
      const db = await readDb();
      db.difficultItems = items;
      await writeDb(db);
    });
    res.json({ ok: true });
  });

  async function streamMp4File(
    baseDir: string,
    filename: string,
    req: Request,
    res: Response
  ) {
    if (!SAFE_VIDEO_NAME_RE.test(filename)) {
      res.status(400).json({ error: 'Invalid video filename.' });
      return;
    }

    const resolvedPath = path.resolve(baseDir, filename);
    if (!resolvedPath.startsWith(baseDir + path.sep)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }

    try {
      const stat = await fsp.stat(resolvedPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        if (
          Number.isNaN(start) ||
          Number.isNaN(end) ||
          start < 0 ||
          end >= fileSize ||
          start > end
        ) {
          res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
          return;
        }
        const chunkSize = end - start + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': 'video/mp4',
        });
        fs.createReadStream(resolvedPath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(resolvedPath).pipe(res);
      }
    } catch {
      res.status(404).json({ error: 'Video file not found.' });
    }
  }

  app.get('/clips/:filename', async (req: Request, res: Response) => {
    await streamMp4File(CLIPS_DIR, String(req.params.filename || ''), req, res);
  });

  app.get('/api/videos/file/:filename', async (req: Request, res: Response) => {
    await streamMp4File(VIDEOS_DIR, String(req.params.filename || ''), req, res);
  });

  app.post('/api/videos/generate-text', async (req: Request, res: Response) => {
    const prompt = String(req.body?.prompt ?? '').trim();
    const aspectRatio = String(req.body?.aspectRatio ?? '16:9').trim();
    const filmTitle =
      String(req.body?.filmTitle ?? 'Original Film Study').trim().slice(0, 120) ||
      'Original Film Study';
    const episodeTitle =
      String(req.body?.episodeTitle ?? 'Generated Cinema Scene').trim().slice(0, 120) ||
      'Generated Cinema Scene';
    const scriptText = String(req.body?.scriptText ?? prompt).trim().slice(0, 2000);

    if (!prompt || prompt.length > 1500) {
      res.status(400).json({
        error: 'Please enter a descriptive scene prompt (up to 1,500 characters).',
      });
      return;
    }

    if (!ALLOWED_ASPECT_RATIOS.has(aspectRatio)) {
      res.status(400).json({ error: 'Aspect ratio must be 16:9 or 9:16.' });
      return;
    }

    const ai = getGenAiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured in the server environment. Add a valid key in Secrets to generate videos with gemini-omni-1.2-flash.',
      });
      return;
    }

    try {
      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: prompt,
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: aspectRatio as '16:9' | '9:16',
            duration: '10s',
            resolution: '720p',
          },
        },
        { timeout: 300000 }
      );

      const { buffer } = await materializeVideoBuffer(interaction);
      const id = `ep-gen-${crypto.randomUUID()}`;
      const filename = `${id}.mp4`;
      const targetPath = path.resolve(VIDEOS_DIR, filename);

      if (!targetPath.startsWith(VIDEOS_DIR + path.sep)) {
        res.status(500).json({ error: 'Invalid video output path.' });
        return;
      }

      await fsp.writeFile(targetPath, buffer);

      const episode = {
        id,
        kind: 'generated',
        filmTitle,
        releaseYear: `Text-to-Video · ${aspectRatio}`,
        directorNote: prompt,
        episodeTitle,
        sceneTag: `AI Film · ${aspectRatio}`,
        durationSec: 10,
        aspectRatio,
        videoUrl: `/api/videos/file/${filename}`,
        promptUsed: prompt,
        cues: buildCueLinesFromScript(scriptText, 'Scene Dialogue'),
        createdAt: Date.now(),
      };

      await withDbLock(async () => {
        const db = await readDb();
        db.episodes = [episode, ...db.episodes];
        await writeDb(db);
      });

      res.status(201).json({ episode });
    } catch (err) {
      const formatted = formatApiError(err);
      console.error('Text-to-video generation failed:', formatted.message);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/videos/animate-image', async (req: Request, res: Response) => {
    const prompt = String(req.body?.prompt ?? '').trim();
    const aspectRatio = String(req.body?.aspectRatio ?? '16:9').trim();
    const mimeType = String(req.body?.mimeType ?? '').trim().toLowerCase();
    const rawBase64 = String(req.body?.imageBase64 ?? '').trim();
    const filmTitle =
      String(req.body?.filmTitle ?? 'Animated Film Still').trim().slice(0, 120) ||
      'Animated Film Still';
    const episodeTitle =
      String(req.body?.episodeTitle ?? 'Photo-to-Film Episode').trim().slice(0, 120) ||
      'Photo-to-Film Episode';
    const scriptText = String(req.body?.scriptText ?? prompt).trim().slice(0, 2000);

    if (!ALLOWED_IMAGE_MIME.has(mimeType)) {
      res.status(400).json({
        error: 'Please upload a PNG, JPEG, or WebP photograph to animate.',
      });
      return;
    }

    const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/, '');
    if (!cleanBase64 || cleanBase64.length > MAX_IMAGE_BASE64_BYTES) {
      res.status(400).json({
        error: 'Image payload is empty or exceeds the maximum 9 MB file size.',
      });
      return;
    }

    if (!prompt || prompt.length > 1500) {
      res.status(400).json({
        error: 'Please enter a motion direction prompt (up to 1,500 characters).',
      });
      return;
    }

    if (!ALLOWED_ASPECT_RATIOS.has(aspectRatio)) {
      res.status(400).json({ error: 'Aspect ratio must be 16:9 or 9:16.' });
      return;
    }

    const ai = getGenAiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured in the server environment. Add a valid key in Secrets to animate images with gemini-omni-1.2-flash.',
      });
      return;
    }

    try {
      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: [
            { type: 'image', mime_type: mimeType, data: cleanBase64 },
            { type: 'text', text: prompt },
          ],
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: aspectRatio as '16:9' | '9:16',
          },
        },
        { timeout: 300000 }
      );

      const { buffer } = await materializeVideoBuffer(interaction);
      const id = `ep-anim-${crypto.randomUUID()}`;
      const filename = `${id}.mp4`;
      const targetPath = path.resolve(VIDEOS_DIR, filename);

      if (!targetPath.startsWith(VIDEOS_DIR + path.sep)) {
        res.status(500).json({ error: 'Invalid video output path.' });
        return;
      }

      await fsp.writeFile(targetPath, buffer);

      const episode = {
        id,
        kind: 'generated',
        filmTitle,
        releaseYear: `Image-to-Video · ${aspectRatio}`,
        directorNote: prompt,
        episodeTitle,
        sceneTag: `Animated Still · ${aspectRatio}`,
        durationSec: 10,
        aspectRatio,
        videoUrl: `/api/videos/file/${filename}`,
        promptUsed: prompt,
        cues: buildCueLinesFromScript(scriptText, 'Scene Narration'),
        createdAt: Date.now(),
      };

      await withDbLock(async () => {
        const db = await readDb();
        db.episodes = [episode, ...db.episodes];
        await writeDb(db);
      });

      res.status(201).json({ episode });
    } catch (err) {
      const formatted = formatApiError(err);
      console.error('Image-to-video animation failed:', formatted.message);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`The Crown server running at http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
