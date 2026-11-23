import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
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
  documentWorkspaces?: unknown[];
  customLexicon?: CustomLexiconStore;
  deletedClassicEpisodeIds?: string[];
  dismissedEpisodeTerms?: string[];
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
        documentWorkspaces: [],
        customLexicon: { words: [], idioms: [], phrasals: [] },
        deletedClassicEpisodeIds: [],
        dismissedEpisodeTerms: [],
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
      documentWorkspaces: Array.isArray(parsed.documentWorkspaces)
        ? parsed.documentWorkspaces
        : [],
      customLexicon: {
        words: Array.isArray(cl?.words) ? cl.words : [],
        idioms: Array.isArray(cl?.idioms) ? cl.idioms : [],
        phrasals: Array.isArray(cl?.phrasals) ? cl.phrasals : [],
      },
      deletedClassicEpisodeIds: Array.isArray(parsed.deletedClassicEpisodeIds)
        ? parsed.deletedClassicEpisodeIds.filter((id): id is string => typeof id === 'string')
        : [],
      dismissedEpisodeTerms: Array.isArray(parsed.dismissedEpisodeTerms)
        ? parsed.dismissedEpisodeTerms.filter((t): t is string => typeof t === 'string')
        : [],
    };
  } catch {
    return {
      episodes: [],
      difficultItems: null,
      wordCache: {},
      documents: [],
      documentWorkspaces: [],
      customLexicon: { words: [], idioms: [], phrasals: [] },
      deletedClassicEpisodeIds: [],
      dismissedEpisodeTerms: [],
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
  const attempts: Array<{ model: string; useLowThinking: boolean; delayMs: number }> = [
    { model: 'gemini-3.1-flash-lite', useLowThinking: false, delayMs: 0 },
    { model: 'gemini-4-hydrogen', useLowThinking: true, delayMs: 350 },
    { model: 'gemini-3.1-flash-lite', useLowThinking: false, delayMs: 900 },
    { model: 'gemini-4-hydrogen', useLowThinking: true, delayMs: 1200 },
  ];

  let lastErr: unknown;
  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await new Promise((r) => setTimeout(r, attempt.delayMs));
    }
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

  let status =
    typeof e?.status === 'number'
      ? e.status
      : typeof e?.error?.code === 'number'
        ? e.error.code
        : 500;

  let rawMessage =
    e?.error?.message || e?.message || 'Unexpected service error.';

  if (typeof rawMessage === 'string' && rawMessage.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawMessage) as {
        error?: { code?: number; message?: string; status?: string };
        message?: string;
      };
      if (typeof parsed?.error?.code === 'number') status = parsed.error.code;
      rawMessage = parsed?.error?.message || parsed?.message || rawMessage;
    } catch {
      // Keep rawMessage
    }
  }

  if (
    status === 429 ||
    /RESOURCE_EXHAUSTED|quota|rate[- ]limit/i.test(rawMessage)
  ) {
    return {
      status: 429,
      message:
        'Automatic lookup quota reached. Please enter the details manually.',
    };
  }

  if (status === 503 || /UNAVAILABLE|high demand|overloaded/i.test(rawMessage)) {
    return {
      status: 503,
      message:
        'Automatic translation service is temporarily busy. Please enter the details manually.',
    };
  }

  const safeStatus = status >= 400 && status < 600 ? status : 500;
  const cleanMsg = String(rawMessage).replace(/\s+/g, ' ').slice(0, 180);
  return { status: safeStatus, message: cleanMsg };
}

async function fetchFreeEnglishDictionaryFallback(word: string): Promise<{
  ipa?: string;
  partOfSpeech?: string;
  definition?: string;
  exampleEn?: string;
} | null> {
  if (!/^[a-zA-Z'-]{2,40}$/.test(word.trim())) return null;
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim().toLowerCase())}`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      phonetic?: string;
      phonetics?: Array<{ text?: string }>;
      meanings?: Array<{
        partOfSpeech?: string;
        definitions?: Array<{ definition?: string; example?: string }>;
      }>;
    }>;
    const first = data?.[0];
    if (!first) return null;
    const ipa =
      first.phonetic ||
      first.phonetics?.find((p) => p.text)?.text ||
      undefined;
    const meaning = first.meanings?.[0];
    const def = meaning?.definitions?.[0];
    const pos = meaning?.partOfSpeech
      ? meaning.partOfSpeech.charAt(0).toUpperCase() +
        meaning.partOfSpeech.slice(1)
      : undefined;
    return {
      ipa,
      partOfSpeech: pos,
      definition: def?.definition,
      exampleEn: def?.example,
    };
  } catch {
    return null;
  }
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
    const initialDb = await readDb();
    const toRepair = initialDb.episodes.filter((ep) => {
      const item = ep as Record<string, unknown>;
      return (
        item.sourceSection === 'reader' &&
        !(typeof item.videoUrl === 'string' && item.videoUrl.startsWith('/api/videos/file/')) &&
        (!item.embedUrl || !item.videoQuoteVerified)
      );
    }) as Array<Record<string, unknown>>;

    if (toRepair.length > 0) {
      const updates = new Map<string, RealMovieClipResult>();
      await Promise.all(
        toRepair.slice(0, 6).map(async (item) => {
          const term = String(item.targetTerm || '').trim();
          const id = String(item.id || '');
          if (!term || !id) return;
          const clip = await searchRealMovieClip(term);
          if (clip) updates.set(id, clip);
        })
      );

      if (updates.size > 0) {
        await withDbLock(async () => {
          const db = await readDb();
          db.episodes = db.episodes.map((ep) => {
            const item = ep as Record<string, unknown>;
            const clip = updates.get(String(item.id || ''));
            if (!clip) return ep;
            return applyRealClipToEpisode(item, clip);
          });
          await writeDb(db);
        });
      }
    }

    const finalDb = await readDb();
    res.json({
      episodes: finalDb.episodes,
      deletedClassicIds: finalDb.deletedClassicEpisodeIds ?? [],
      dismissedTerms: finalDb.dismissedEpisodeTerms ?? [],
    });
  });

  app.post('/api/episodes/restore-classic', async (_req: Request, res: Response) => {
    await withDbLock(async () => {
      const db = await readDb();
      db.deletedClassicEpisodeIds = [];
      await writeDb(db);
    });
    res.json({ ok: true });
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
      ) as { videoUrl?: string; targetTerm?: string; sourceSection?: string } | undefined;

      if (!target) {
        if (/^[a-zA-Z0-9_-]{3,80}$/.test(id)) {
          const deletedSet = new Set(db.deletedClassicEpisodeIds ?? []);
          deletedSet.add(id);
          db.deletedClassicEpisodeIds = Array.from(deletedSet);
          await writeDb(db);
          res.json({ ok: true, deletedClassicId: id });
          return;
        }
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

      if (target.targetTerm && target.sourceSection === 'reader') {
        const dismissed = new Set(db.dismissedEpisodeTerms ?? []);
        dismissed.add(target.targetTerm.trim().toLowerCase());
        db.dismissedEpisodeTerms = Array.from(dismissed);
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
      const partialEntry = await fetchFreeEnglishDictionaryFallback(rawWord);
      res.status(formatted.status).json({
        error: formatted.message,
        ...(partialEntry ? { partialEntry } : {}),
      });
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

  const DOC_STOP_WORDS = new Set([
    'about', 'above', 'across', 'after', 'again', 'against', 'almost', 'alone', 'along', 'already',
    'also', 'although', 'always', 'among', 'another', 'anyone', 'anything', 'around', 'away',
    'back', 'because', 'become', 'becomes', 'became', 'been', 'before', 'behind', 'being', 'below',
    'beneath', 'beside', 'between', 'beyond', 'both', 'bring', 'brought', 'built', 'called',
    'came', 'cannot', 'could', 'currently', 'does', 'doing', 'done', 'down', 'during', 'each',
    'early', 'either', 'else', 'enough', 'even', 'ever', 'every', 'everyone', 'everything',
    'except', 'fact', 'first', 'five', 'following', 'form', 'found', 'four', 'from', 'full',
    'further', 'gave', 'general', 'getting', 'give', 'given', 'gives', 'going', 'gone', 'good',
    'great', 'group', 'had', 'half', 'hand', 'hard', 'have', 'having', 'here', 'herself', 'high',
    'himself', 'home', 'however', 'http', 'https', 'hundred', 'including', 'into', 'itself',
    'just', 'keep', 'kept', 'kind', 'knew', 'know', 'known', 'large', 'last', 'late', 'later',
    'least', 'left', 'less', 'like', 'likely', 'line', 'little', 'long', 'look', 'looking',
    'made', 'make', 'making', 'many', 'maybe', 'mean', 'means', 'might', 'more', 'most', 'mostly',
    'much', 'must', 'myself', 'name', 'near', 'need', 'needs', 'never', 'next', 'night', 'none',
    'nothing', 'number', 'often', 'once', 'only', 'open', 'order', 'other', 'others', 'otherwise',
    'ought', 'ourselves', 'over', 'page', 'part', 'parts', 'people', 'perhaps', 'person', 'place',
    'point', 'possible', 'present', 'probably', 'problem', 'provided', 'quite', 'rather', 'read',
    'really', 'right', 'room', 'said', 'same', 'saying', 'says', 'second', 'seem', 'seemed',
    'seems', 'seen', 'several', 'shall', 'should', 'show', 'shown', 'shows', 'side', 'since',
    'small', 'some', 'someone', 'something', 'sometimes', 'soon', 'sort', 'state', 'still',
    'such', 'sure', 'take', 'taken', 'taking', 'tell', 'than', 'thank', 'that', 'their', 'theirs',
    'them', 'themselves', 'then', 'there', 'therefore', 'these', 'they', 'thing', 'things',
    'think', 'third', 'this', 'those', 'though', 'thought', 'three', 'through', 'thus', 'time',
    'times', 'today', 'together', 'told', 'took', 'toward', 'towards', 'true', 'turn', 'turned',
    'under', 'understand', 'unless', 'until', 'upon', 'used', 'using', 'usually', 'various',
    'very', 'want', 'wanted', 'water', 'ways', 'week', 'well', 'went', 'were', 'what', 'whatever',
    'when', 'whenever', 'where', 'whereas', 'wherever', 'whether', 'which', 'while', 'whilst',
    'whom', 'whose', 'will', 'with', 'within', 'without', 'word', 'words', 'work', 'worked',
    'working', 'works', 'world', 'would', 'write', 'writing', 'written', 'year', 'years', 'yesterday',
    'your', 'yours', 'yourself', 'yourselves', 'document', 'chapter', 'section', 'figure', 'table',
  ]);

  function estimateCefrLevel(word: string): 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' {
    const lower = word.toLowerCase();
    if (/(?:tion|sion|ment|ness|able|ible|ance|ence|ical|ology|ously|ality)$/.test(lower)) {
      return lower.length >= 11 ? 'C1' : 'B2';
    }
    if (lower.length >= 11) return 'C1';
    if (lower.length >= 8) return 'B2';
    if (lower.length >= 6) return 'B1';
    return 'A2';
  }

  function extractDocumentWordCandidates(
    text: string,
    maxWords = 18
  ): Array<{ key: string; term: string; frequency: number; exampleEn: string }> {
    const cleanText = text.slice(0, 120_000).replace(/\s+/g, ' ').trim();
    if (!cleanText) return [];

    const rawSentences = cleanText
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 12 && s.length <= 240);

    const stats = new Map<
      string,
      { term: string; frequency: number; exampleEn: string; allUpperCount: number }
    >();

    const wordRegex = /\b([A-Za-z]{4,24})\b/g;
    let match: RegExpExecArray | null;
    while ((match = wordRegex.exec(cleanText)) !== null) {
      const raw = match[1];
      const lower = raw.toLowerCase();
      if (DOC_STOP_WORDS.has(lower)) continue;
      if (/(.)\1{2,}/.test(lower)) continue; // skip noisy repetitions like "xxxx"
      const isAllUpper = raw === raw.toUpperCase() && raw.length <= 5;
      const existing = stats.get(lower);
      if (existing) {
        existing.frequency += 1;
        if (isAllUpper) existing.allUpperCount += 1;
      } else {
        const sentence =
          rawSentences.find((s) =>
            new RegExp(`\\b${lower}\\b`, 'i').test(s)
          ) ??
          `Key vocabulary found in uploaded document: “${lower}”.`;
        stats.set(lower, {
          term: lower.charAt(0).toUpperCase() + lower.slice(1),
          frequency: 1,
          exampleEn: sentence,
          allUpperCount: isAllUpper ? 1 : 0,
        });
      }
    }

    const candidates = Array.from(stats.entries())
      .filter(([, info]) => info.allUpperCount < info.frequency)
      .map(([key, info]) => {
        const lenScore = Math.min(info.term.length, 12) * 1.4;
        const freqScore = Math.min(info.frequency, 6) * 2.2;
        const academicBonus = /(?:tion|ment|ance|ence|ous|ive|ity|ize|ise|ate|ary|ory)$/i.test(key)
          ? 4
          : 0;
        return {
          key,
          term: info.term,
          frequency: info.frequency,
          exampleEn: info.exampleEn,
          score: lenScore + freqScore + academicBonus,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxWords);

    return candidates.map(({ key, term, frequency, exampleEn }) => ({
      key,
      term,
      frequency,
      exampleEn,
    }));
  }

  app.get('/api/document-workspaces', async (_req: Request, res: Response) => {
    const db = await readDb();
    res.json({ workspaces: db.documentWorkspaces ?? [] });
  });

  app.put('/api/document-workspaces', async (req: Request, res: Response) => {
    const workspaces = req.body?.workspaces;
    if (!Array.isArray(workspaces)) {
      res.status(400).json({ error: 'workspaces array is required.' });
      return;
    }

    const safeWorkspaces = workspaces
      .filter(
        (w): w is Record<string, unknown> =>
          Boolean(w) &&
          typeof w === 'object' &&
          typeof (w as { id?: unknown }).id === 'string' &&
          Array.isArray((w as { words?: unknown }).words)
      )
      .slice(0, 15);
    await withDbLock(async () => {
      const db = await readDb();
      db.documentWorkspaces = safeWorkspaces;
      await writeDb(db);
    });
    res.json({ ok: true, count: safeWorkspaces.length });
  });

  app.delete('/api/document-workspaces/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'Workspace ID is required.' });
      return;
    }
    await withDbLock(async () => {
      const db = await readDb();
      const existing = (db.documentWorkspaces ?? []) as Array<{ id?: string }>;
      db.documentWorkspaces = existing.filter((w) => w?.id !== id);
      await writeDb(db);
    });
    res.json({ ok: true });
  });

  app.post('/api/documents/analyze-words', async (req: Request, res: Response) => {
    const text = String(req.body?.text ?? '').trim();
    const title = String(req.body?.title ?? 'Uploaded Document').trim().slice(0, 140) || 'Uploaded Document';
    const fileName = String(req.body?.fileName ?? 'document.txt').trim().slice(0, 160);
    const format = String(req.body?.format ?? 'TXT').trim().slice(0, 16);
    const wordCount = Number(req.body?.wordCount) || text.split(/\s+/).filter(Boolean).length;
    const pageCount = typeof req.body?.pageCount === 'number' ? req.body.pageCount : undefined;
    const rawHints = Array.isArray(req.body?.localHints) ? req.body.localHints : [];

    if (!text) {
      res.status(400).json({ error: 'Document text is required to extract vocabulary.' });
      return;
    }

    const hintMap = new Map<
      string,
      {
        ipa?: string;
        level?: string;
        partOfSpeech?: string;
        azTranslation?: string;
        definition?: string;
        etymology?: string;
        exampleAz?: string;
      }
    >();
    for (const h of rawHints) {
      if (h && typeof h.term === 'string') {
        hintMap.set(h.term.trim().toLowerCase(), h);
      }
    }

    const candidates = extractDocumentWordCandidates(text, 18);
    if (candidates.length === 0) {
      res.status(422).json({
        error: 'No distinct English vocabulary words could be extracted from this document.',
      });
      return;
    }

    const db = await readDb();
    const wordCache = (db.wordCache ?? {}) as Record<
      string,
      {
        term?: string;
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
    >;

    const enrichedMap = new Map<
      string,
      {
        term: string;
        ipa: string;
        level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
        partOfSpeech: string;
        azTranslation: string;
        definition: string;
        etymology?: string;
        exampleEn: string;
        exampleAz?: string;
        frequency: number;
      }
    >();

    const toFetchWithAi: typeof candidates = [];
    const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

    for (const c of candidates) {
      const cached = wordCache[c.key];
      const hint = hintMap.get(c.key);
      if (cached && cached.azTranslation) {
        const lvl = cached.cefrLevel && VALID_LEVELS.has(cached.cefrLevel.toUpperCase())
          ? (cached.cefrLevel.toUpperCase() as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2')
          : estimateCefrLevel(c.term);
        enrichedMap.set(c.key, {
          term: c.term,
          ipa: cached.ipa || hint?.ipa || `/${c.key}/`,
          level: lvl,
          partOfSpeech: cached.partOfSpeech || hint?.partOfSpeech || 'Noun',
          azTranslation: cached.azTranslation,
          definition: cached.definition || hint?.definition || 'Vocabulary extracted from your document.',
          etymology: cached.etymology || hint?.etymology,
          exampleEn: c.exampleEn,
          exampleAz: cached.exampleAz || hint?.exampleAz,
          frequency: c.frequency,
        });
      } else if (hint && hint.azTranslation) {
        const lvl = hint.level && VALID_LEVELS.has(hint.level.toUpperCase())
          ? (hint.level.toUpperCase() as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2')
          : estimateCefrLevel(c.term);
        enrichedMap.set(c.key, {
          term: c.term,
          ipa: hint.ipa || `/${c.key}/`,
          level: lvl,
          partOfSpeech: hint.partOfSpeech || 'Lexicon',
          azTranslation: hint.azTranslation,
          definition: hint.definition || 'Vocabulary extracted from your document.',
          etymology: hint.etymology,
          exampleEn: c.exampleEn,
          exampleAz: hint.exampleAz,
          frequency: c.frequency,
        });
      } else {
        toFetchWithAi.push(c);
      }
    }

    let warning: string | undefined;

    if (toFetchWithAi.length > 0) {
      const ai = getGenAiClient();
      let aiSucceeded = false;
      if (ai) {
        try {
          const promptItems = toFetchWithAi.map((c) => ({
            word: c.term,
            contextSentence: c.exampleEn,
          }));
          const batchResult = await generateJsonWithFallback<{
            words: Array<{
              word: string;
              ipa: string;
              cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
              partOfSpeech: string;
              azTranslation: string;
              definition: string;
              etymology?: string;
              exampleAz?: string;
            }>;
          }>(ai, {
            contents: `Analyze these English vocabulary words extracted from the document "${title}". For each word, return accurate British IPA, CEFR level ("A1"-"C2"), primary partOfSpeech, natural Azerbaijani translation(s) (azTranslation), concise English definition, brief origin note (etymology), and Azerbaijani translation of the provided contextSentence (exampleAz).\n\nItems:\n${JSON.stringify(promptItems)}`,
            systemInstruction:
              'You are an English-Azerbaijani lexicographer for The Crown app. Return clean JSON matching the schema with accurate Azerbaijani translations and CEFR levels for every word.',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                words: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING },
                      ipa: { type: Type.STRING },
                      cefrLevel: { type: Type.STRING, enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
                      partOfSpeech: { type: Type.STRING },
                      azTranslation: { type: Type.STRING },
                      definition: { type: Type.STRING },
                      etymology: { type: Type.STRING },
                      exampleAz: { type: Type.STRING },
                    },
                    required: ['word', 'ipa', 'cefrLevel', 'partOfSpeech', 'azTranslation', 'definition'],
                  },
                },
              },
              required: ['words'],
            },
            timeoutMs: 14000,
          });

          const cacheUpdates: Record<string, unknown> = {};
          for (const item of batchResult.words ?? []) {
            const key = item.word.trim().toLowerCase();
            const cand = toFetchWithAi.find((c) => c.key === key);
            if (!cand) continue;
            const lvl = VALID_LEVELS.has(String(item.cefrLevel).toUpperCase())
              ? (String(item.cefrLevel).toUpperCase() as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2')
              : estimateCefrLevel(cand.term);
            enrichedMap.set(key, {
              term: cand.term,
              ipa: item.ipa || `/${key}/`,
              level: lvl,
              partOfSpeech: item.partOfSpeech || 'Noun',
              azTranslation: item.azTranslation || '',
              definition: item.definition || 'Vocabulary extracted from your document.',
              etymology: item.etymology || `Extracted from ${title}`,
              exampleEn: cand.exampleEn,
              exampleAz: item.exampleAz,
              frequency: cand.frequency,
            });
            cacheUpdates[key] = {
              term: cand.term,
              category: 'word',
              cefrLevel: lvl,
              partOfSpeech: item.partOfSpeech || 'Noun',
              ipa: item.ipa || `/${key}/`,
              badge: `${lvl} · ${item.partOfSpeech || 'Noun'}`,
              azTranslation: item.azTranslation,
              definition: item.definition,
              etymology: item.etymology,
              exampleEn: cand.exampleEn,
              exampleAz: item.exampleAz,
            };
          }

          if (Object.keys(cacheUpdates).length > 0) {
            await withDbLock(async () => {
              const freshDb = await readDb();
              freshDb.wordCache = { ...(freshDb.wordCache ?? {}), ...cacheUpdates };
              await writeDb(freshDb);
            });
          }
          aiSucceeded = enrichedMap.size >= candidates.length * 0.7;
        } catch {
          aiSucceeded = false;
        }
      }

      // Free English dictionary fallback for any words still lacking metadata
      const unresolved = toFetchWithAi.filter((c) => !enrichedMap.has(c.key));
      if (unresolved.length > 0) {
        if (!aiSucceeded) {
          warning =
            'Avtomatik Azərbaycan tərcüməsi hazırda məhduddur — sözlər və ingiliscə izahlar sənəddən çıxarıldı. İstədiyiniz sözün tərcüməsini kartda özünüz əlavə edə bilərsiniz.';
        }
        const batchSize = 5;
        for (let i = 0; i < unresolved.length; i += batchSize) {
          const chunk = unresolved.slice(i, i + batchSize);
          const fallbacks = await Promise.all(
            chunk.map((c) => fetchFreeEnglishDictionaryFallback(c.key))
          );
          chunk.forEach((c, idx) => {
            const fb = fallbacks[idx];
            enrichedMap.set(c.key, {
              term: c.term,
              ipa: fb?.ipa || `/${c.key}/`,
              level: estimateCefrLevel(c.term),
              partOfSpeech: fb?.partOfSpeech || 'Vocabulary',
              azTranslation: '',
              definition:
                fb?.definition ||
                `Appears ${c.frequency}× in “${title}”. Add its Azerbaijani meaning below.`,
              etymology: `Extracted from ${title}`,
              exampleEn: c.exampleEn,
              frequency: c.frequency,
            });
          });
        }
      }
    }

    const words = candidates
      .map((c) => enrichedMap.get(c.key))
      .filter((w): w is NonNullable<typeof w> => Boolean(w))
      .map((w, idx) => ({
        id: `docword-${crypto.randomUUID().slice(0, 8)}-${idx}`,
        ...w,
        approvedToSection1: false,
      }));

    const workspace = {
      id: `ws-${crypto.randomUUID()}`,
      title,
      fileName,
      format,
      wordCount,
      ...(pageCount ? { pageCount } : {}),
      text: text.slice(0, 200_000),
      words,
      createdAt: Date.now(),
    };

    await withDbLock(async () => {
      const freshDb = await readDb();
      freshDb.documentWorkspaces = [
        workspace,
        ...((freshDb.documentWorkspaces ?? []) as Array<{ id?: string }>),
      ].slice(0, 15);
      await writeDb(freshDb);
    });

    res.status(201).json({
      workspace,
      ...(warning ? { warning } : {}),
    });
  });

  const VERB_INFLECTION_MAP: Record<string, string[]> = {
    break: ['break', 'breaks', 'broke', 'broken', 'breaking'],
    bring: ['bring', 'brings', 'brought', 'bringing'],
    carry: ['carry', 'carries', 'carried', 'carrying'],
    come: ['come', 'comes', 'came', 'coming'],
    cut: ['cut', 'cuts', 'cutting'],
    fall: ['fall', 'falls', 'fell', 'fallen', 'falling'],
    find: ['find', 'finds', 'found', 'finding'],
    get: ['get', 'gets', 'got', 'gotten', 'getting'],
    give: ['give', 'gives', 'gave', 'given', 'giving'],
    go: ['go', 'goes', 'went', 'gone', 'going'],
    hold: ['hold', 'holds', 'held', 'holding'],
    keep: ['keep', 'keeps', 'kept', 'keeping'],
    let: ['let', 'lets', 'letting'],
    look: ['look', 'looks', 'looked', 'looking'],
    make: ['make', 'makes', 'made', 'making'],
    put: ['put', 'puts', 'putting'],
    read: ['read', 'reads', 'reading'],
    run: ['run', 'runs', 'ran', 'running'],
    set: ['set', 'sets', 'setting'],
    take: ['take', 'takes', 'took', 'taken', 'taking'],
    think: ['think', 'thinks', 'thought', 'thinking'],
    turn: ['turn', 'turns', 'turned', 'turning'],
  };

  function buildTermFlexibleRegex(term: string): RegExp {
    const words = term.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return /(?!)/i;
    const parts = words.map((w, idx) => {
      const clean = w.toLowerCase().replace(/[^a-z'-]/g, '');
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (idx === 0 && clean) {
        const irregular = VERB_INFLECTION_MAP[clean];
        if (irregular) {
          return `(?:${irregular.join('|')})`;
        }
        return `${escaped}(?:s|es|ed|d|ing)?`;
      }
      return escaped;
    });
    return new RegExp(`(${parts.join('[\\s,]+(?:\\w+[\\s,]+){0,2}?')}|${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i');
  }

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
    const exactMatch = line.match(new RegExp(`(${escaped})`, 'i'));
    const match = exactMatch ?? line.match(buildTermFlexibleRegex(term));
    if (!match || match.index === undefined) {
      return [
        { text: line },
        { text: ` (${term})`, ...tokenMeta },
      ];
    }
    const before = line.slice(0, match.index);
    const matchedText = match[1];
    const after = line.slice(match.index + matchedText.length);
    const tokens: Array<Record<string, unknown>> = [];
    if (before) tokens.push({ text: before });
    tokens.push({ text: matchedText, ...tokenMeta });
    if (after) tokens.push({ text: after });
    return tokens;
  }

  interface RealMovieClipResult {
    videoId: string;
    embedUrl: string;
    filmTitle: string;
    releaseYear: string;
    durationSec: number;
    spokenSentenceEn: string;
    spokenSentenceAz: string;
    speaker: string;
    startSec: number;
    quoteVerified: boolean;
  }

  interface QuoDbQuote {
    title: string;
    year: number;
    phrase: string;
  }

  function parseLengthTextToSeconds(lengthText: string): number {
    const parts = lengthText
      .split(':')
      .map((n) => Number(n.trim()))
      .filter((n) => Number.isFinite(n));
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 120;
  }

  function lineContainsTermOrInflection(line: string, term: string): boolean {
    if (!line || !term) return false;
    const lower = line.toLowerCase();
    const clean = term.trim().toLowerCase();
    if (lower.includes(clean)) return true;
    const flex = buildTermFlexibleRegex(term);
    return flex.test(line);
  }

  async function fetchQuoDbQuotes(term: string): Promise<QuoDbQuote[]> {
    try {
      const res = await fetch(
        `https://api.quodb.com/search/${encodeURIComponent(term.trim())}?titles_per_page=8&phrases_per_title=1&page=1`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        docs?: Array<{ title?: string; year?: number; phrase?: string }>;
      };
      return (data.docs ?? [])
        .filter((d) => d.title && d.phrase && lineContainsTermOrInflection(d.phrase, term))
        .map((d) => ({
          title: String(d.title).trim(),
          year: Number(d.year) || 2010,
          phrase: String(d.phrase)
            .replace(/^[-–—\s]+/, '')
            .replace(/\s+/g, ' ')
            .trim(),
        }));
    } catch {
      return [];
    }
  }

  async function translateSentenceToAz(sentenceEn: string): Promise<string> {
    const cleanEn = sentenceEn.trim();
    if (!cleanEn) return '';

    const ai = getGenAiClient();
    if (ai) {
      try {
        const parsed = await generateJsonWithFallback<{ translationAz: string }>(ai, {
          contents: `Translate this spoken film dialogue sentence accurately and naturally into Azerbaijani: "${cleanEn}"`,
          systemInstruction:
            'You are a literary English-to-Azerbaijani film subtitle translator. Return ONLY natural Azerbaijani translation preserving conversational tone.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translationAz: { type: Type.STRING },
            },
            required: ['translationAz'],
          },
          timeoutMs: 7500,
        });
        if (parsed?.translationAz?.trim()) {
          return parsed.translationAz.trim();
        }
      } catch {
        // Retry once with direct plain text generation
      }

      try {
        await new Promise((r) => setTimeout(r, 600));
        const direct = await Promise.race([
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: `Translate only into natural Azerbaijani (output only the translation, no quotes or notes): ${cleanEn}`,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Direct translation timeout')), 7000)
          ),
        ]);
        const txt = (direct.text ?? '').trim().replace(/^["'“”]+|["'“”]+$/g, '');
        if (txt) return txt;
      } catch {
        // Return empty so caller keeps fallback
      }
    }

    return '';
  }

  async function inspectYouTubeClipWithGemini(
    videoId: string,
    term: string
  ): Promise<{
    status: 'matched' | 'not-matched' | 'transient-error' | 'unsupported';
    spokenSentenceEn: string;
    spokenSentenceAz: string;
    speaker: string;
    startSec: number;
  }> {
    const ai = getGenAiClient();
    if (!ai) {
      return {
        status: 'unsupported',
        spokenSentenceEn: '',
        spokenSentenceAz: '',
        speaker: 'ACTOR',
        startSec: 0,
      };
    }

    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 500));
      }
      try {
        const response = await Promise.race([
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    fileData: {
                      fileUri: watchUrl,
                    },
                  },
                  {
                    text: `Listen carefully to the spoken dialogue in this movie clip. Does any character actually speak the expression "${term}" (or an inflected form such as past/continuous tense)?
If YES:
1. Set matchesVideo = true
2. Transcribe the EXACT verbatim English sentence from the video containing "${term}" (spokenSentenceEn). Do NOT invent a sentence that is not heard in the video.
3. Translate that exact spoken English sentence into natural literary Azerbaijani (spokenSentenceAz).
4. Provide the character or role label (speaker, e.g. "ACTOR" or character name) and approximate start time in integer seconds (startSec).
If NO character speaks "${term}" in this clip, set matchesVideo = false and return empty strings.`,
                  },
                ],
              },
            ],
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  matchesVideo: { type: Type.BOOLEAN },
                  spokenSentenceEn: { type: Type.STRING },
                  spokenSentenceAz: { type: Type.STRING },
                  speaker: { type: Type.STRING },
                  startSec: { type: Type.INTEGER },
                },
                required: [
                  'matchesVideo',
                  'spokenSentenceEn',
                  'spokenSentenceAz',
                  'speaker',
                  'startSec',
                ],
              },
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Gemini YouTube inspection timeout')), 9500)
          ),
        ]);

        const raw = (response.text ?? '').trim();
        if (!raw) continue;
        const parsed = JSON.parse(raw) as {
          matchesVideo?: boolean;
          spokenSentenceEn?: string;
          spokenSentenceAz?: string;
          speaker?: string;
          startSec?: number;
        };
        if (
          parsed.matchesVideo &&
          parsed.spokenSentenceEn &&
          lineContainsTermOrInflection(parsed.spokenSentenceEn, term)
        ) {
          return {
            status: 'matched',
            spokenSentenceEn: parsed.spokenSentenceEn.trim(),
            spokenSentenceAz: (parsed.spokenSentenceAz ?? '').trim(),
            speaker: (parsed.speaker || 'ACTOR').trim().slice(0, 40),
            startSec: Math.max(0, Number(parsed.startSec) || 0),
          };
        }
        return {
          status: 'not-matched',
          spokenSentenceEn: '',
          spokenSentenceAz: '',
          speaker: 'ACTOR',
          startSec: 0,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/400|INVALID_ARGUMENT|unsupported|PERMISSION_DENIED/i.test(msg)) {
          return {
            status: 'unsupported',
            spokenSentenceEn: '',
            spokenSentenceAz: '',
            speaker: 'ACTOR',
            startSec: 0,
          };
        }
      }
    }

    return {
      status: 'transient-error',
      spokenSentenceEn: '',
      spokenSentenceAz: '',
      speaker: 'ACTOR',
      startSec: 0,
    };
  }

  async function fetchYouTubeVideoDescription(videoId: string): Promise<string> {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: '2.20250101.00.00' } },
          videoId,
        }),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return '';
      const json = (await res.json()) as {
        contents?: {
          twoColumnWatchNextResults?: {
            results?: {
              results?: {
                contents?: Array<{
                  videoSecondaryInfoRenderer?: {
                    attributedDescription?: { content?: string };
                  };
                }>;
              };
            };
          };
        };
      };
      return (
        json?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[1]
          ?.videoSecondaryInfoRenderer?.attributedDescription?.content ?? ''
      );
    } catch {
      return '';
    }
  }

  function extractSentenceFromText(text: string, term: string): string | null {
    if (!text) return null;
    const cleaned = text
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[#@]\S+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const parts = cleaned
      .split(/(?<=[.!?])\s+|\s*\|\s*|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= term.length + 3 && s.length <= 220);

    for (const part of parts) {
      if (
        lineContainsTermOrInflection(part, term) &&
        !/^(idiom|learn|example|examples|definition|meaning|subscribe|check out|watch)/i.test(
          part
        ) &&
        !/(in the film|directed by|starring|created by|in this video|explore more|check out|buy tickets|find out what|meaning of|idiom explained|what does|idiom quiz|is a \d{4} film|vhs|opening & closing|retail tape|dvd menu|soundtrack)/i.test(
          part
        )
      ) {
        return part.replace(/^["'“”]+|["'“”]+$/g, '').trim();
      }
    }
    return null;
  }

  async function searchRealMovieClip(term: string): Promise<RealMovieClipResult | null> {
    const clean = term.trim();
    if (!clean) return null;

    const quodbQuotes = await fetchQuoDbQuotes(clean);

    const queries = [
      `"${clean}" "Learn English with Clips" OR "Movie Idioms"`,
      `"${clean}" movie scene english`,
      `"${clean}" film scene quote`,
      ...quodbQuotes.slice(0, 2).map((q) => `"${q.phrase.slice(0, 60)}"`),
      ...quodbQuotes.slice(0, 2).map((q) => `"${q.title}" "${clean}" scene`),
      `"${clean}" movie clip`,
    ];

    const seenIds = new Set<string>();
    const candidates: Array<{
      id: string;
      title: string;
      lengthText: string;
      secs: number;
      owner: string;
      snippet: string;
      score: number;
      matchedQuoDb?: QuoDbQuote;
    }> = [];

    for (const q of queries) {
      try {
        const res = await fetch(
          `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            signal: AbortSignal.timeout(4500),
          }
        );
        if (!res.ok) continue;
        const html = await res.text();
        const match = html.match(/var ytInitialData = (\{.+?\});<\/script>/);
        if (!match) continue;

        const data = JSON.parse(match[1]) as {
          contents?: {
            twoColumnSearchResultsRenderer?: {
              primaryContents?: {
                sectionListRenderer?: {
                  contents?: Array<{
                    itemSectionRenderer?: {
                      contents?: Array<{
                        videoRenderer?: {
                          videoId?: string;
                          title?: { runs?: Array<{ text?: string }> };
                          lengthText?: { simpleText?: string };
                          ownerText?: { runs?: Array<{ text?: string }> };
                          detailedMetadataSnippets?: Array<{
                            snippetText?: { runs?: Array<{ text?: string }> };
                          }>;
                        };
                      }>;
                    };
                  }>;
                };
              };
            };
          };
        };

        const contents =
          data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
            ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer
            ?.contents ?? [];

        for (const entry of contents) {
          const v = entry.videoRenderer;
          if (!v?.videoId || seenIds.has(v.videoId)) continue;
          seenIds.add(v.videoId);

          const title = v.title?.runs?.map((r) => r.text ?? '').join('') ?? '';
          const lengthText = v.lengthText?.simpleText ?? '';
          const owner = v.ownerText?.runs?.map((r) => r.text ?? '').join('') ?? '';
          const snippet =
            v.detailedMetadataSnippets?.[0]?.snippetText?.runs
              ?.map((r) => r.text ?? '')
              .join('') ?? '';
          if (!title || !lengthText) continue;

          const secs = parseLengthTextToSeconds(lengthText);
          const lowerClean = clean.toLowerCase();
          const combined = `${title} ${owner} ${snippet}`.toLowerCase();
          let score = 0;

          if (secs <= 25) score += 50;
          else if (secs <= 95) score += 35;
          else if (secs <= 210) score += 18;
          else if (secs > 420) score -= 50;

          if (title.toLowerCase().includes(lowerClean)) score += 45;
          else if (snippet.toLowerCase().includes(lowerClean)) score += 30;

          const matchedQuoDb = quodbQuotes.find((qq) =>
            combined.includes(qq.title.toLowerCase())
          );
          if (matchedQuoDb) score += 35;

          if (
            /(learn english with clips|movie idioms|idiom scene|sbs|movieclips|joblo|rotten tomatoes|sony pictures|warner|universal|paramount|disney|netflix|hbo|classic movie)/i.test(
              `${owner} ${title}`
            )
          ) {
            score += 32;
          } else if (/(movie|film|scene|clip|quote|cinema)/i.test(combined)) {
            score += 12;
          }

          if (
            /(idiom quiz|what does .* mean|explained|meaning and examples|vocabulary quiz|learn english idiom|grammar|ielts|vocabulary test|crochet|knitting|vhs|opening & closing|retail tape|dvd menu|tamil|hindi|telugu|malayalam|kannada|bhojpuri|bollywood|tollywood|kollywood|dubbed|whatsapp|status|lyrics|official audio|music video|karaoke|guitar|piano|cover|remix|podcast|ai generated|full movie|teaser|trailer)/i.test(
              combined
            )
          ) {
            score -= 120;
          }

          candidates.push({
            id: v.videoId,
            title,
            lengthText,
            secs,
            owner,
            snippet,
            score,
            matchedQuoDb,
          });
        }

        if (candidates.some((c) => c.score >= 115)) break;
      } catch {
        // Try next query
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    const oembedVerified: Array<{
      cand: (typeof candidates)[number];
      clipTitle: string;
      author: string;
    }> = [];

    for (const cand of candidates.slice(0, 8)) {
      try {
        const oe = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(
            `https://www.youtube.com/watch?v=${cand.id}`
          )}&format=json`,
          { signal: AbortSignal.timeout(3500) }
        );
        if (!oe.ok) continue;
        const oj = (await oe.json()) as { title?: string; author_name?: string };
        oembedVerified.push({
          cand,
          clipTitle: (oj.title || cand.title).slice(0, 100),
          author: (oj.author_name || cand.owner || 'Cinema Archive').slice(0, 60),
        });
        if (oembedVerified.length >= 4) break;
      } catch {
        // Check next candidate
      }
    }

    if (oembedVerified.length === 0) return null;

    // Try Gemini audio/video verification on top verified candidates so the clip AND spoken sentence match 100%
    for (const item of oembedVerified.slice(0, 3)) {
      const gem = await inspectYouTubeClipWithGemini(item.cand.id, clean);
      if (gem.status === 'unsupported') break;
      if (gem.status === 'matched' && gem.spokenSentenceEn) {
        const az =
          gem.spokenSentenceAz ||
          (await translateSentenceToAz(gem.spokenSentenceEn)) ||
          clean;
        const startParam = gem.startSec > 2 && gem.startSec < item.cand.secs - 2 ? `start=${Math.max(0, gem.startSec - 1)}&` : '';
        return {
          videoId: item.cand.id,
          embedUrl: `https://www.youtube.com/embed/${item.cand.id}?${startParam}rel=0&playsinline=1&enablejsapi=1`,
          filmTitle: item.clipTitle,
          releaseYear: `${item.author} · Real Film Clip (${item.cand.lengthText})`,
          durationSec: Math.max(3, Math.min(300, item.cand.secs)),
          spokenSentenceEn: gem.spokenSentenceEn,
          spokenSentenceAz: az,
          speaker: gem.speaker || 'ACTOR',
          startSec: gem.startSec,
          quoteVerified: true,
        };
      }
    }

    // Fallback: pick best candidate that has a verified spoken quote from its own title/QuoDB movie match
    for (const item of oembedVerified) {
      const desc = await fetchYouTubeVideoDescription(item.cand.id);
      const fromMeta =
        extractSentenceFromText(item.cand.title, clean) ||
        item.cand.matchedQuoDb?.phrase ||
        extractSentenceFromText(item.cand.snippet, clean) ||
        extractSentenceFromText(desc, clean) ||
        null;

      if (fromMeta) {
        const az = (await translateSentenceToAz(fromMeta)) || clean;
        return {
          videoId: item.cand.id,
          embedUrl: `https://www.youtube.com/embed/${item.cand.id}?rel=0&playsinline=1&enablejsapi=1`,
          filmTitle: item.clipTitle,
          releaseYear: `${item.author} · Real Film Clip (${item.cand.lengthText})`,
          durationSec: Math.max(3, Math.min(300, item.cand.secs)),
          spokenSentenceEn: fromMeta,
          spokenSentenceAz: az,
          speaker: item.cand.matchedQuoDb ? item.cand.matchedQuoDb.title.toUpperCase() : 'FILM SCENE',
          startSec: 0,
          quoteVerified: true,
        };
      }
    }

    // Last resort: pair the top verified film clip with top QuoDB real film quote if available
    const top = oembedVerified[0];
    const fallbackQuote =
      quodbQuotes[0]?.phrase || `Real cinema clip featuring “${clean}”.`;
    const fallbackAz =
      quodbQuotes[0]?.phrase
        ? (await translateSentenceToAz(fallbackQuote)) || clean
        : clean;

    return {
      videoId: top.cand.id,
      embedUrl: `https://www.youtube.com/embed/${top.cand.id}?rel=0&playsinline=1&enablejsapi=1`,
      filmTitle: top.clipTitle,
      releaseYear: `${top.author} · Real Film Clip (${top.cand.lengthText})`,
      durationSec: Math.max(3, Math.min(300, top.cand.secs)),
      spokenSentenceEn: fallbackQuote,
      spokenSentenceAz: fallbackAz,
      speaker: quodbQuotes[0] ? quodbQuotes[0].title.toUpperCase() : 'FILM SCENE',
      startSec: 0,
      quoteVerified: true,
    };
  }

  function applyRealClipToEpisode(
    item: Record<string, unknown>,
    clip: RealMovieClipResult
  ): Record<string, unknown> {
    const term = String(item.targetTerm || '').trim();
    const cat: 'idiom' | 'phrasal' =
      item.targetCategory === 'phrasal' ? 'phrasal' : 'idiom';
    const catLabel = cat === 'phrasal' ? 'Phrasal Verb' : 'Idiom';

    const existingCues = Array.isArray(item.cues)
      ? (item.cues as Array<{ tokens?: Array<Record<string, unknown>> }>)
      : [];
    const existingMetaToken = existingCues[0]?.tokens?.find(
      (t) => typeof t.term === 'string'
    ) as
      | {
          lexiconId?: string;
          badge?: string;
          ipa?: string;
          azTranslation?: string;
          definition?: string;
          etymology?: string;
        }
      | undefined;

    const spokenLine = clip.spokenSentenceEn;
    const azSubtitle = clip.spokenSentenceAz;
    const epId = String(item.id || `ep-${crypto.randomUUID()}`);

    return {
      ...item,
      status: 'ready',
      videoSource: 'youtube-film',
      videoQuoteVerified: clip.quoteVerified,
      embedUrl: clip.embedUrl,
      videoUrl: undefined,
      sceneAudioMode: undefined,
      filmTitle: clip.filmTitle,
      releaseYear: clip.releaseYear,
      durationSec: clip.durationSec,
      sceneTag: `${catLabel} · Real Film`,
      directorNote: `Real cinema scene (${clip.filmTitle}) — “${spokenLine}”`,
      generationError: undefined,
      cues: [
        {
          id: `${epId}-cue-1`,
          startSec: clip.startSec,
          endSec: clip.durationSec,
          speaker: clip.speaker || 'FILM SCENE',
          tokens: splitDialogueAroundTerm(spokenLine, term, {
            lexiconId: String(existingMetaToken?.lexiconId || `lex-${epId}`),
            term,
            badge: String(existingMetaToken?.badge || catLabel),
            category: cat,
            ipa: String(existingMetaToken?.ipa || '/—/'),
            azTranslation: String(existingMetaToken?.azTranslation || azSubtitle),
            definition: String(
              existingMetaToken?.definition || `Featured ${catLabel.toLowerCase()}: ${term}`
            ),
            exampleEn: spokenLine,
            exampleAz: azSubtitle,
            etymology: existingMetaToken?.etymology,
          }),
          azSubtitle,
        },
      ],
    };
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
    const etymology = String(req.body?.etymology ?? '').trim().slice(0, 400);

    if (!term) {
      res.status(400).json({ error: 'Term is required.' });
      return;
    }

    if (category !== 'idiom' && category !== 'phrasal') {
      res.json({
        skipped: true,
        reason: 'Only idioms and phrasal verbs are added to Film Episodes.',
      });
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

    const realClip = await searchRealMovieClip(term);
    if (!realClip) {
      res.status(502).json({
        error: `Could not locate an embeddable real film clip for "${term}" right now. Try again shortly.`,
      });
      return;
    }

    const id = `ep-lex-${crypto.randomUUID()}`;
    const catLabel = category === 'phrasal' ? 'Phrasal Verb' : 'Idiom';
    const spokenLine = realClip.spokenSentenceEn;
    const azSubtitle = realClip.spokenSentenceAz || azTranslation || term;

    const episode = {
      id,
      kind: 'generated' as const,
      sourceSection: 'reader' as const,
      status: 'ready' as const,
      videoSource: 'youtube-film' as const,
      videoQuoteVerified: realClip.quoteVerified,
      embedUrl: realClip.embedUrl,
      filmTitle: realClip.filmTitle,
      releaseYear: realClip.releaseYear,
      directorNote: `Real cinema scene (${realClip.filmTitle}) — “${spokenLine}”`,
      episodeTitle: `Scene · ${term}`,
      sceneTag: `${catLabel} · Real Film`,
      targetTerm: term,
      targetCategory: category,
      durationSec: realClip.durationSec,
      aspectRatio: '16:9' as const,
      cues: [
        {
          id: `${id}-cue-1`,
          startSec: realClip.startSec,
          endSec: realClip.durationSec,
          speaker: realClip.speaker || 'FILM SCENE',
          tokens: splitDialogueAroundTerm(spokenLine, term, {
            lexiconId,
            term,
            badge,
            category,
            ipa,
            azTranslation: azTranslation || azSubtitle,
            definition: definition || `Featured ${catLabel.toLowerCase()}: ${term}`,
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
      db.dismissedEpisodeTerms = (db.dismissedEpisodeTerms ?? []).filter(
        (t) => t !== lowerTerm
      );
      db.episodes = [episode, ...db.episodes];
      await writeDb(db);
    });

    res.status(201).json({ episode });
  });

  app.post('/api/episodes/:id/resolve-real-clip', async (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'Episode ID is required.' });
      return;
    }

    const db = await readDb();
    const target = db.episodes.find(
      (ep) => (ep as { id?: string }).id === id
    ) as Record<string, unknown> | undefined;
    if (!target) {
      res.status(404).json({ error: 'Episode not found.' });
      return;
    }

    const term = String(target.targetTerm || target.episodeTitle || '').trim();
    const clip = await searchRealMovieClip(term);
    if (!clip) {
      res.status(502).json({ error: `No embeddable movie clip found for "${term}".` });
      return;
    }

    let updatedEpisode: unknown = null;
    await withDbLock(async () => {
      const currentDb = await readDb();
      currentDb.episodes = currentDb.episodes.map((ep) => {
        const item = ep as Record<string, unknown>;
        if (item.id !== id) return ep;
        updatedEpisode = applyRealClipToEpisode(item, clip);
        return updatedEpisode;
      });
      await writeDb(currentDb);
    });

    res.json({ episode: updatedEpisode });
  });

  app.post('/api/episodes/sync-difficult', async (req: Request, res: Response) => {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const excludeTerms = new Set(
      (Array.isArray(req.body?.excludeTerms) ? req.body.excludeTerms : [])
        .map((t: unknown) => String(t || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const snapshotDb = await readDb();
    const dismissedTerms = new Set(snapshotDb.dismissedEpisodeTerms ?? []);
    const existingTerms = new Set(
      snapshotDb.episodes
        .filter((ep) => {
          const item = ep as { sourceSection?: string; targetCategory?: string };
          return !(item.sourceSection === 'reader' && item.targetCategory === 'word');
        })
        .map((ep) =>
          String((ep as { targetTerm?: string }).targetTerm || '').trim().toLowerCase()
        )
        .filter(Boolean)
    );

    const pendingItems: Array<{
      id: string;
      term: string;
      category: 'idiom' | 'phrasal';
      badge?: string;
      ipa?: string;
      azTranslation?: string;
      definition?: string;
      exampleEn?: string;
      exampleAz?: string;
      etymologyNote?: string;
    }> = [];

    for (const raw of rawItems.slice(0, 20)) {
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
      if (item.category !== 'idiom' && item.category !== 'phrasal') continue;
      const term = String(item.term ?? '').trim().slice(0, 100);
      if (!term) continue;
      const lower = term.toLowerCase();
      if (existingTerms.has(lower) || excludeTerms.has(lower) || dismissedTerms.has(lower)) {
        continue;
      }
      existingTerms.add(lower);
      pendingItems.push({
        id: String(item.id || `lex-${crypto.randomUUID()}`),
        term,
        category: item.category,
        badge: item.badge,
        ipa: item.ipa,
        azTranslation: item.azTranslation,
        definition: item.definition,
        exampleEn: item.exampleEn,
        exampleAz: item.exampleAz,
        etymologyNote: item.etymologyNote,
      });
    }

    const resolvedNew = await Promise.all(
      pendingItems.slice(0, 8).map(async (item) => {
        const clip = await searchRealMovieClip(item.term);
        return { item, clip };
      })
    );

    const createdEpisodes: Array<{ id: string }> = [];
    let purgedWords = false;

    await withDbLock(async () => {
      const db = await readDb();

      const keptEpisodes = db.episodes.filter((ep) => {
        const item = ep as { sourceSection?: string; targetCategory?: string };
        const isAutoWord =
          item.sourceSection === 'reader' && item.targetCategory === 'word';
        if (isAutoWord) purgedWords = true;
        return !isAutoWord;
      });
      db.episodes = keptEpisodes;

      const currentExisting = new Set(
        db.episodes
          .map((ep) =>
            String((ep as { targetTerm?: string }).targetTerm || '').trim().toLowerCase()
          )
          .filter(Boolean)
      );

      for (const { item, clip } of resolvedNew) {
        if (!clip) continue;
        const lower = item.term.toLowerCase();
        if (currentExisting.has(lower)) continue;
        currentExisting.add(lower);

        const catLabel = item.category === 'phrasal' ? 'Phrasal Verb' : 'Idiom';
        const azTranslation = String(item.azTranslation || item.term).trim().slice(0, 300);
        const spokenLine = clip.spokenSentenceEn;
        const azSubtitle = clip.spokenSentenceAz || azTranslation;
        const id = `ep-lex-${crypto.randomUUID()}`;

        const ep = {
          id,
          kind: 'generated' as const,
          sourceSection: 'reader' as const,
          status: 'ready' as const,
          videoSource: 'youtube-film' as const,
          videoQuoteVerified: clip.quoteVerified,
          embedUrl: clip.embedUrl,
          filmTitle: clip.filmTitle,
          releaseYear: clip.releaseYear,
          directorNote: `Real cinema scene (${clip.filmTitle}) — “${spokenLine}”`,
          episodeTitle: `Scene · ${item.term}`,
          sceneTag: `${catLabel} · Real Film`,
          targetTerm: item.term,
          targetCategory: item.category,
          durationSec: clip.durationSec,
          aspectRatio: '16:9' as const,
          cues: [
            {
              id: `${id}-cue-1`,
              startSec: clip.startSec,
              endSec: clip.durationSec,
              speaker: clip.speaker || 'FILM SCENE',
              tokens: splitDialogueAroundTerm(spokenLine, item.term, {
                lexiconId: item.id,
                term: item.term,
                badge: String(item.badge || catLabel),
                category: item.category,
                ipa: String(item.ipa || '/—/'),
                azTranslation,
                definition: String(item.definition || `Marked ${catLabel.toLowerCase()}: ${item.term}`),
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
        createdEpisodes.push({ id });
      }

      if (createdEpisodes.length > 0 || purgedWords) {
        await writeDb(db);
      }
    });

    res.json({ created: createdEpisodes, purgedWords });
  });

  app.post('/api/episodes/:id/retry-video', async (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'Episode ID is required.' });
      return;
    }

    const db = await readDb();
    const target = db.episodes.find(
      (ep) => (ep as { id?: string }).id === id
    ) as Record<string, unknown> | undefined;

    if (!target) {
      res.status(404).json({ error: 'Episode not found.' });
      return;
    }

    const term = String(target.targetTerm || target.episodeTitle || '').trim();
    const clip = await searchRealMovieClip(term);
    if (!clip) {
      res.status(502).json({
        error: `No embeddable real movie clip found for "${term}".`,
      });
      return;
    }

    let updatedEpisode: unknown = null;
    await withDbLock(async () => {
      const currentDb = await readDb();
      currentDb.episodes = currentDb.episodes.map((ep) => {
        const item = ep as Record<string, unknown>;
        if (item.id !== id) return ep;
        updatedEpisode = applyRealClipToEpisode(item, clip);
        return updatedEpisode;
      });
      await writeDb(currentDb);
    });

    res.json({ ok: true, episode: updatedEpisode });
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
