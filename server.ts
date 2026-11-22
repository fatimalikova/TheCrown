import 'dotenv/config';
import express, { Request, Response } from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  extractDocxTextComplete,
  extractPdfTextInReadingOrder,
  normalizeFinalDocumentText,
} from './server/documentExtractor.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const VIDEOS_DIR = path.resolve(DATA_DIR, 'videos');
const CLIPS_DIR = path.resolve(process.cwd(), 'public', 'clips');
const DB_FILE = path.resolve(DATA_DIR, 'db.json');

const ALLOWED_ASPECT_RATIOS = new Set(['16:9', '9:16']);
const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const SAFE_VIDEO_NAME_RE = /^[a-zA-Z0-9_-]+\.mp4$/;
const MAX_IMAGE_BASE64_BYTES = 12 * 1024 * 1024; // ~12MB base64 payload limit
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024; // 20MB decoded file limit
const MAX_DOCUMENT_CHARS = 2_500_000;

interface SavedDocument {
  id: string;
  title: string;
  fileName: string;
  format: string;
  wordCount: number;
  pageCount?: number;
  text: string;
  truncated?: boolean;
  uploadedAt: number;
}

interface CustomLexiconStore {
  words: unknown[];
  idioms: unknown[];
  phrasals: unknown[];
}

interface StoredDb {
  episodes: unknown[];
  difficultItems: unknown[] | null;
  wordCache?: Record<string, unknown>;
  documents?: SavedDocument[];
  customLexicon?: CustomLexiconStore;
}

fs.mkdirSync(VIDEOS_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(
      {
        episodes: [],
        difficultItems: null,
        wordCache: {},
        documents: [],
        customLexicon: { words: [], idioms: [], phrasals: [] },
      },
      null,
      2
    ),
    'utf-8'
  );
}

let dbQueue = Promise.resolve();
let videoGenQueue = Promise.resolve();

function enqueueVideoGeneration(fn: () => Promise<void>) {
  videoGenQueue = videoGenQueue.then(fn, fn);
}

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
    const cl = parsed.customLexicon;
    return {
      episodes: Array.isArray(parsed.episodes) ? parsed.episodes : [],
      difficultItems: Array.isArray(parsed.difficultItems)
        ? parsed.difficultItems
        : null,
      wordCache:
        parsed.wordCache && typeof parsed.wordCache === 'object'
          ? parsed.wordCache
          : {},
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      customLexicon: {
        words: Array.isArray(cl?.words) ? cl.words : [],
        idioms: Array.isArray(cl?.idioms) ? cl.idioms : [],
        phrasals: Array.isArray(cl?.phrasals) ? cl.phrasals : [],
      },
    };
  } catch {
    return {
      episodes: [],
      difficultItems: null,
      wordCache: {},
      documents: [],
      customLexicon: { words: [], idioms: [], phrasals: [] },
    };
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
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateJsonWithFallback<T>(
  ai: GoogleGenAI,
  params: {
    contents: string;
    systemInstruction: string;
    responseSchema: Record<string, unknown>;
    timeoutMs?: number;
  }
): Promise<T> {
  const timeoutMs = params.timeoutMs ?? 9000;
  const attempts: Array<{ model: string; useLowThinking: boolean }> = [
    { model: 'gemini-3.1-flash-lite', useLowThinking: false },
    { model: 'gemini-4-hydrogen', useLowThinking: true },
  ];

  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model: attempt.model,
          contents: params.contents,
          config: {
            ...(attempt.useLowThinking
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            systemInstruction: params.systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: params.responseSchema,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Model ${attempt.model} timed out.`)),
            timeoutMs
          )
        ),
      ]);

      const text = (response.text ?? '').trim();
      if (!text) {
        throw new Error(`Empty response from ${attempt.model}`);
      }
      return JSON.parse(text) as T;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr ?? new Error('All Gemini models failed to respond.');
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

function sanitizeDocumentFileName(rawName: string): string {
  const base = path.basename(rawName || 'document.txt')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  return (base || 'document.txt').slice(0, 120);
}

function resolveDocumentExtension(fileName: string, mimeType: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext) return ext;
  const mime = mimeType.toLowerCase();
  if (mime === 'application/pdf') return '.pdf';
  if (
    mime ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return '.docx';
  }
  if (mime === 'application/msword') return '.doc';
  if (mime === 'application/rtf' || mime === 'text/rtf') return '.rtf';
  if (mime === 'text/html') return '.html';
  if (mime === 'text/markdown') return '.md';
  if (mime === 'text/csv') return '.csv';
  if (mime.startsWith('text/')) return '.txt';
  return '';
}

function stripRtfToPlainText(rtf: string): string {
  let out = rtf
    .replace(/\{\\\*\\[^{}]*\}/g, ' ')
    .replace(/\\(?:par|line)\b\s?/g, '\n')
    .replace(/\\tab\b\s?/g, ' ')
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\\u(-?\d+)\??/g, (_, codeStr: string) => {
      const code = Number(codeStr);
      const normalized = code < 0 ? code + 65536 : code;
      return Number.isFinite(normalized) ? String.fromCharCode(normalized) : '';
    })
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
    .replace(/[{}]/g, '');
  return out;
}

function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<\/?(?:p|div|br|li|h[1-6]|tr|blockquote|section|article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, num: string) =>
      String.fromCharCode(Number(num))
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '36mb' }));

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

  app.get('/api/custom-lexicon', async (_req: Request, res: Response) => {
    const db = await readDb();
    res.json(db.customLexicon ?? { words: [], idioms: [], phrasals: [] });
  });

  app.put('/api/custom-lexicon', async (req: Request, res: Response) => {
    const words = Array.isArray(req.body?.words) ? req.body.words.slice(0, 500) : [];
    const idioms = Array.isArray(req.body?.idioms) ? req.body.idioms.slice(0, 500) : [];
    const phrasals = Array.isArray(req.body?.phrasals) ? req.body.phrasals.slice(0, 500) : [];

    await withDbLock(async () => {
      const db = await readDb();
      db.customLexicon = { words, idioms, phrasals };
      await writeDb(db);
    });
    res.json({ ok: true });
  });

  app.post('/api/translate-word', async (req: Request, res: Response) => {
    const rawWord = String(req.body?.word ?? '')
      .replace(/’/g, "'")
      .replace(/[^\p{L}\s'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const context = String(req.body?.context ?? '').trim().slice(0, 400);
    const detailed = Boolean(req.body?.detailed);

    if (!rawWord || rawWord.length > 80) {
      res.status(400).json({ error: 'A valid English word or phrase is required.' });
      return;
    }

    const cacheKey = rawWord.toLowerCase();
    const existingDb = await readDb();
    const cached = existingDb.wordCache?.[cacheKey] as
      | {
          term?: string;
          category?: 'word' | 'idiom' | 'phrasal';
          cefrLevel?: string;
          partOfSpeech?: string;
          ipa?: string;
          badge?: string;
          azTranslation?: string;
          definition?: string;
          etymology?: string;
          exampleEn?: string;
          exampleAz?: string;
        }
      | undefined;

    if (cached && (!detailed || (cached.cefrLevel && cached.exampleEn && cached.exampleAz))) {
      res.json({ entry: cached });
      return;
    }

    const ai = getGenAiClient();
    if (!ai) {
      if (cached) {
        res.json({ entry: cached });
        return;
      }
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured on the server to look up custom words.',
      });
      return;
    }

    try {
      const parsed = await generateJsonWithFallback<{
        term: string;
        category?: 'word' | 'idiom' | 'phrasal';
        cefrLevel?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
        partOfSpeech?: string;
        ipa: string;
        badge: string;
        azTranslation: string;
        definition: string;
        etymology?: string;
        exampleEn?: string;
        exampleAz?: string;
      }>(ai, {
        contents: `Analyze and translate the English expression "${rawWord}" into natural, literary Azerbaijani.${context ? ` Sentence context: "${context}"` : ''} Classify category strictly as "word" (single vocabulary word), "phrasal" (verb + particle like give up, look forward to, carry out), or "idiom" (figurative multi-word expression like break the ice, once in a blue moon). Accurately assign its CEFR difficulty level ("A1", "A2", "B1", "B2", "C1", or "C2"), primary partOfSpeech (e.g. "Noun", "Verb", "Adjective", "Adverb"), brief etymology (e.g. "Latin: ubique"), and one natural literary example sentence in English (exampleEn) with its Azerbaijani translation (exampleAz).`,
        systemInstruction:
          'You are an English-Azerbaijani lexicographer for The Crown app. Return accurate British IPA, category ("word", "idiom", or "phrasal"), CEFR level ("A1"-"C2"), primary partOfSpeech, badge ("CEFR · PartOfSpeech"), natural Azerbaijani translation(s), concise English definition, brief origin note, and a bilingual example sentence.',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            term: { type: Type.STRING },
            category: { type: Type.STRING, enum: ['word', 'idiom', 'phrasal'] },
            cefrLevel: {
              type: Type.STRING,
              enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
            },
            partOfSpeech: { type: Type.STRING },
            ipa: { type: Type.STRING },
            badge: { type: Type.STRING },
            azTranslation: { type: Type.STRING },
            definition: { type: Type.STRING },
            etymology: { type: Type.STRING },
            exampleEn: { type: Type.STRING },
            exampleAz: { type: Type.STRING },
          },
          required: [
            'term',
            'category',
            'cefrLevel',
            'partOfSpeech',
            'ipa',
            'badge',
            'azTranslation',
            'definition',
            'exampleEn',
            'exampleAz',
          ],
        },
        timeoutMs: 9000,
      });

      if (!parsed.category) {
        parsed.category = 'word';
      }
      if (!parsed.cefrLevel) {
        const lvlMatch = parsed.badge?.match(/\b(A1|A2|B1|B2|C1|C2)\b/i);
        parsed.cefrLevel = (lvlMatch?.[1]?.toUpperCase() ?? 'B2') as
          | 'A1'
          | 'A2'
          | 'B1'
          | 'B2'
          | 'C1'
          | 'C2';
      }

      await withDbLock(async () => {
        const db = await readDb();
        db.wordCache = db.wordCache ?? {};
        db.wordCache[cacheKey] = parsed;
        await writeDb(db);
      });

      res.json({ entry: parsed });
    } catch (err) {
      if (cached) {
        res.json({ entry: cached });
        return;
      }
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.get('/api/documents', async (_req: Request, res: Response) => {
    const db = await readDb();
    res.json({ documents: db.documents ?? [] });
  });

  app.delete('/api/documents/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'Document ID is required.' });
      return;
    }

    await withDbLock(async () => {
      const db = await readDb();
      const existing = db.documents ?? [];
      const next = existing.filter((d) => d.id !== id);
      if (next.length === existing.length) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }
      db.documents = next;
      await writeDb(db);
      res.json({ ok: true });
    });
  });

  app.post('/api/documents/extract', async (req: Request, res: Response) => {
    const safeName = sanitizeDocumentFileName(String(req.body?.fileName ?? ''));
    const mimeType = String(req.body?.mimeType ?? '').trim();
    const rawBase64 = String(req.body?.dataBase64 ?? '').trim();

    const cleanBase64 = rawBase64.replace(/^data:[^;]*;base64,/, '');
    if (!cleanBase64) {
      res.status(400).json({ error: 'Uploaded file payload is empty.' });
      return;
    }

    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_DOCUMENT_BYTES) {
      res.status(400).json({
        error: 'Document is empty or exceeds the maximum 20 MB file size.',
      });
      return;
    }

    const ext = resolveDocumentExtension(safeName, mimeType);
    if (ext === '.doc') {
      res.status(400).json({
        error:
          'Legacy binary .doc files are not supported. Please save the file as .docx, .pdf, or .txt and upload again.',
      });
      return;
    }

    try {
      let extractedRaw = '';
      let pageCount: number | undefined;

      if (ext === '.pdf') {
        const result = await extractPdfTextInReadingOrder(buffer);
        extractedRaw = result.text;
        pageCount = result.pageCount;
      } else if (ext === '.docx') {
        const result = await extractDocxTextComplete(buffer);
        extractedRaw = result.text;
      } else if (ext === '.rtf') {
        extractedRaw = stripRtfToPlainText(buffer.toString('utf-8'));
      } else if (ext === '.html' || ext === '.htm') {
        extractedRaw = stripHtmlToPlainText(buffer.toString('utf-8'));
      } else if (
        ext === '.txt' ||
        ext === '.md' ||
        ext === '.csv' ||
        ext === '.log'
      ) {
        extractedRaw = buffer.toString('utf-8');
      } else {
        res.status(400).json({
          error:
            'Unsupported document format. Supported formats: PDF, DOCX, TXT, MD, RTF, CSV, HTML.',
        });
        return;
      }

      const normalized = normalizeFinalDocumentText(extractedRaw);
      if (!normalized) {
        res.status(422).json({
          error:
            'No readable text could be extracted from this file (for example, it may be a scanned image-only PDF).',
        });
        return;
      }

      const truncated = normalized.length > MAX_DOCUMENT_CHARS;
      const finalText = truncated
        ? `${normalized.slice(0, MAX_DOCUMENT_CHARS)}\n\n[Document truncated at 2,500,000 characters]`
        : normalized;

      const wordCount = finalText.split(/\s+/).filter(Boolean).length;
      const title =
        safeName.replace(/\.[^/.]+$/, '').trim() || 'Uploaded Document';

      const document: SavedDocument = {
        id: `doc-${crypto.randomUUID()}`,
        title,
        fileName: safeName,
        format: ext.replace('.', '').toUpperCase() || 'TXT',
        wordCount,
        ...(pageCount ? { pageCount } : {}),
        text: finalText,
        ...(truncated ? { truncated: true } : {}),
        uploadedAt: Date.now(),
      };

      await withDbLock(async () => {
        const db = await readDb();
        db.documents = [document, ...(db.documents ?? [])].slice(0, 20);
        await writeDb(db);
      });

      res.status(201).json({ document });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to parse document.';
      res.status(422).json({
        error: `Could not extract text from ${safeName}: ${message}`,
      });
    }
  });

  function splitDialogueAroundTerm(
    line: string,
    term: string,
    tokenMeta: {
      lexiconId: string;
      term: string;
      badge: string;
      category: 'word' | 'idiom' | 'phrasal';
      ipa: string;
      azTranslation: string;
      definition: string;
      exampleEn: string;
      exampleAz?: string;
      etymology?: string;
    }
  ) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${escaped})`, 'i');
    const match = line.match(re);
    if (!match || match.index === undefined) {
      return [
        { text: line },
        { text: ` (${term})`, ...tokenMeta },
      ];
    }
    const before = line.slice(0, match.index);
    const exact = match[1];
    const after = line.slice(match.index + exact.length);
    const tokens: Array<Record<string, unknown>> = [];
    if (before) tokens.push({ text: before });
    tokens.push({ text: exact, ...tokenMeta });
    if (after) tokens.push({ text: after });
    return tokens;
  }

  function scheduleEpisodeVideoRender(episodeId: string, prompt: string) {
    enqueueVideoGeneration(async () => {
      const ai = getGenAiClient();
      if (!ai) {
        await withDbLock(async () => {
          const db = await readDb();
          db.episodes = db.episodes.map((ep) => {
            const item = ep as Record<string, unknown>;
            if (item.id !== episodeId) return ep;
            return {
              ...item,
              status: 'audio-only',
              generationError: 'GEMINI_API_KEY is not configured for video generation.',
            };
          });
          await writeDb(db);
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
              aspect_ratio: '16:9',
              duration: '10s',
              resolution: '720p',
            },
          },
          { timeout: 300000 }
        );

        const { buffer } = await materializeVideoBuffer(interaction);
        const filename = `${episodeId}.mp4`;
        const targetPath = path.resolve(VIDEOS_DIR, filename);
        if (!targetPath.startsWith(VIDEOS_DIR + path.sep)) {
          throw new Error('Invalid video output path.');
        }
        await fsp.writeFile(targetPath, buffer);

        await withDbLock(async () => {
          const db = await readDb();
          db.episodes = db.episodes.map((ep) => {
            const item = ep as Record<string, unknown>;
            if (item.id !== episodeId) return ep;
            return {
              ...item,
              status: 'ready',
              videoUrl: `/api/videos/file/${filename}`,
              generationError: undefined,
            };
          });
          await writeDb(db);
        });
      } catch (err) {
        const formatted = formatApiError(err);
        await withDbLock(async () => {
          const db = await readDb();
          db.episodes = db.episodes.map((ep) => {
            const item = ep as Record<string, unknown>;
            if (item.id !== episodeId) return ep;
            return {
              ...item,
              status: 'audio-only',
              generationError: formatted.message,
            };
          });
          await writeDb(db);
        });
      }
    });
  }

  app.post('/api/episodes/from-lexicon', async (req: Request, res: Response) => {
    const term = String(req.body?.term ?? '').trim().slice(0, 100);
    const categoryRaw = String(req.body?.category ?? 'word').trim();
    const category: 'word' | 'idiom' | 'phrasal' =
      categoryRaw === 'idiom' || categoryRaw === 'phrasal' ? categoryRaw : 'word';
    const lexiconId = String(req.body?.id ?? '').trim() || `lex-${crypto.randomUUID()}`;
    const badge = String(req.body?.badge ?? 'Reader Vocabulary').trim().slice(0, 60);
    const ipa = String(req.body?.ipa ?? '/—/').trim().slice(0, 80);
    const azTranslation = String(req.body?.azTranslation ?? '').trim().slice(0, 300);
    const definition = String(req.body?.definition ?? '').trim().slice(0, 500);
    const exampleEn = String(req.body?.exampleEn ?? '').trim().slice(0, 400);
    const exampleAz = String(req.body?.exampleAz ?? '').trim().slice(0, 400);
    const etymology = String(req.body?.etymology ?? '').trim().slice(0, 400);

    if (!term) {
      res.status(400).json({ error: 'Term is required.' });
      return;
    }

    const lowerTerm = term.toLowerCase();
    const existingDb = await readDb();
    const already = existingDb.episodes.find((ep) => {
      const t = (ep as { targetTerm?: string }).targetTerm;
      return typeof t === 'string' && t.toLowerCase() === lowerTerm;
    });
    if (already) {
      res.json({ episode: already, alreadyExists: true });
      return;
    }

    const ai = getGenAiClient();
    let filmTitle = 'The Literary Archive';
    let episodeTitle = `Scene · ${term}`;
    let speaker = 'NARRATOR';
    let spokenLine =
      exampleEn && exampleEn.toLowerCase().includes(lowerTerm)
        ? exampleEn
        : `In quiet moments, one comes to appreciate what "${term}" truly means.`;
    let azSubtitle = exampleAz || azTranslation || term;
    let videoPrompt = `35mm classic cinema scene in a warm candlelit British library, two thoughtful characters speaking the line "${spokenLine}", film grain, dramatic natural lighting`;

    if (ai) {
      try {
        const parsed = await generateJsonWithFallback<{
          filmTitle?: string;
          episodeTitle?: string;
          speaker?: string;
          spokenLine?: string;
          azSubtitle?: string;
          videoPrompt?: string;
        }>(ai, {
          contents: `Create a short 1-line classic cinema scene where an actor naturally speaks the English expression "${term}" (${category}). Azerbaijani meaning: "${azTranslation}". Context sentence: "${exampleEn}".`,
          systemInstruction:
            'You write concise, natural film dialogue scenes for an English-Azerbaijani learning app. The spokenLine MUST contain the exact target expression naturally inside a 8-18 word movie line, and azSubtitle must translate spokenLine accurately into Azerbaijani.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              filmTitle: { type: Type.STRING },
              episodeTitle: { type: Type.STRING },
              speaker: { type: Type.STRING },
              spokenLine: { type: Type.STRING },
              azSubtitle: { type: Type.STRING },
              videoPrompt: { type: Type.STRING },
            },
            required: [
              'filmTitle',
              'episodeTitle',
              'speaker',
              'spokenLine',
              'azSubtitle',
              'videoPrompt',
            ],
          },
          timeoutMs: 6500,
        });
        if (parsed.filmTitle) filmTitle = parsed.filmTitle.slice(0, 90);
        if (parsed.episodeTitle) episodeTitle = parsed.episodeTitle.slice(0, 90);
        if (parsed.speaker) speaker = parsed.speaker.slice(0, 50).toUpperCase();
        if (parsed.spokenLine) spokenLine = parsed.spokenLine.slice(0, 260);
        if (parsed.azSubtitle) azSubtitle = parsed.azSubtitle.slice(0, 320);
        if (parsed.videoPrompt) videoPrompt = parsed.videoPrompt.slice(0, 800);
      } catch {
        // Fallback smoothly to provided example sentence
      }
    }

    const id = `ep-lex-${crypto.randomUUID()}`;
    const catLabel =
      category === 'phrasal'
        ? 'Phrasal Verb'
        : category === 'idiom'
          ? 'Idiom'
          : 'Word';

    const episode = {
      id,
      kind: 'generated' as const,
      sourceSection: 'reader' as const,
      status: ai ? ('generating' as const) : ('audio-only' as const),
      filmTitle,
      releaseYear: 'Marked Vocabulary · 16:9',
      directorNote: `Cinema dialogue clip featuring “${term}” from your difficult words.`,
      episodeTitle,
      sceneTag: `${catLabel} · Marked Clip`,
      targetTerm: term,
      targetCategory: category,
      durationSec: 5,
      aspectRatio: '16:9' as const,
      promptUsed: videoPrompt,
      cues: [
        {
          id: `${id}-cue-1`,
          startSec: 0,
          endSec: 5,
          speaker,
          tokens: splitDialogueAroundTerm(spokenLine, term, {
            lexiconId,
            term,
            badge,
            category,
            ipa,
            azTranslation: azTranslation || azSubtitle,
            definition: definition || `Featured expression: ${term}`,
            exampleEn: spokenLine,
            exampleAz: azSubtitle,
            etymology,
          }),
          azSubtitle,
        },
      ],
      createdAt: Date.now(),
    };

    await withDbLock(async () => {
      const db = await readDb();
      db.episodes = [episode, ...db.episodes];
      await writeDb(db);
    });

    if (ai) {
      scheduleEpisodeVideoRender(id, videoPrompt);
    }

    res.status(201).json({ episode });
  });

  app.post('/api/episodes/sync-difficult', async (req: Request, res: Response) => {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const excludeTerms = new Set(
      (Array.isArray(req.body?.excludeTerms) ? req.body.excludeTerms : [])
        .map((t: unknown) => String(t || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const createdEpisodes: unknown[] = [];

    await withDbLock(async () => {
      const db = await readDb();
      const existingTerms = new Set(
        db.episodes
          .map((ep) => String((ep as { targetTerm?: string }).targetTerm || '').trim().toLowerCase())
          .filter(Boolean)
      );

      for (const raw of rawItems.slice(0, 40)) {
        const item = raw as {
          id?: string;
          term?: string;
          category?: string;
          badge?: string;
          ipa?: string;
          azTranslation?: string;
          definition?: string;
          exampleEn?: string;
          exampleAz?: string;
          etymologyNote?: string;
        };
        const term = String(item?.term ?? '').trim().slice(0, 100);
        if (!term) continue;
        const lower = term.toLowerCase();
        if (existingTerms.has(lower) || excludeTerms.has(lower)) continue;

        existingTerms.add(lower);
        const category: 'word' | 'idiom' | 'phrasal' =
          item.category === 'idiom' || item.category === 'phrasal'
            ? item.category
            : 'word';
        const catLabel =
          category === 'phrasal'
            ? 'Phrasal Verb'
            : category === 'idiom'
              ? 'Idiom'
              : 'Word';
        const lexiconId = String(item.id || `lex-${crypto.randomUUID()}`);
        const azTranslation = String(item.azTranslation || term).trim().slice(0, 300);
        const rawExample = String(item.exampleEn || '').trim().slice(0, 260);
        const spokenLine =
          rawExample && rawExample.toLowerCase().includes(lower)
            ? rawExample
            : `In tonight’s scene, the true weight of “${term}” becomes unmistakably clear.`;
        const azSubtitle =
          String(item.exampleAz || '').trim().slice(0, 320) || azTranslation;
        const id = `ep-lex-${crypto.randomUUID()}`;

        const ep = {
          id,
          kind: 'generated' as const,
          sourceSection: 'reader' as const,
          status: 'audio-only' as const,
          filmTitle: 'The Crown Cinema Archive',
          releaseYear: 'Marked Vocabulary · 16:9',
          directorNote: `Cinema dialogue study featuring “${term}” (${azTranslation}).`,
          episodeTitle: `Scene · ${term}`,
          sceneTag: `${catLabel} · Marked Clip`,
          targetTerm: term,
          targetCategory: category,
          durationSec: 5,
          aspectRatio: '16:9' as const,
          promptUsed: `35mm classic cinema scene in a warm candlelit British library, character speaking the line "${spokenLine}", film grain`,
          cues: [
            {
              id: `${id}-cue-1`,
              startSec: 0,
              endSec: 5,
              speaker: 'SCHOLAR',
              tokens: splitDialogueAroundTerm(spokenLine, term, {
                lexiconId,
                term,
                badge: String(item.badge || catLabel),
                category,
                ipa: String(item.ipa || '/—/'),
                azTranslation,
                definition: String(item.definition || `Marked expression: ${term}`),
                exampleEn: spokenLine,
                exampleAz: azSubtitle,
                etymology: item.etymologyNote,
              }),
              azSubtitle,
            },
          ],
          createdAt: Date.now(),
        };

        db.episodes = [ep, ...db.episodes];
        createdEpisodes.push(ep);
      }

      if (createdEpisodes.length > 0) {
        await writeDb(db);
      }
    });

    res.json({ created: createdEpisodes });
  });

  app.post('/api/episodes/:id/retry-video', async (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'Episode ID is required.' });
      return;
    }

    const ai = getGenAiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured in the server environment to render cinema clips.',
      });
      return;
    }

    let promptToUse = '';
    let found = false;

    await withDbLock(async () => {
      const db = await readDb();
      db.episodes = db.episodes.map((ep) => {
        const item = ep as Record<string, unknown>;
        if (item.id !== id) return ep;
        found = true;
        promptToUse =
          String(item.promptUsed || item.directorNote || '') ||
          `35mm cinema scene featuring the English expression "${String(item.targetTerm || 'eloquence')}"`;
        return {
          ...item,
          status: 'generating',
          generationError: undefined,
        };
      });
      if (found) {
        await writeDb(db);
      }
    });

    if (!found) {
      res.status(404).json({ error: 'Episode not found.' });
      return;
    }

    scheduleEpisodeVideoRender(id, promptToUse);
    res.json({ ok: true, status: 'generating' });
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
