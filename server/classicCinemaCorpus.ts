import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface SrtCue {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

interface CachedFilmMeta {
  id: string;
  title: string;
  year?: string;
  mp4: string;
  srt: string;
}

interface LoadedFilmScript {
  key: string;
  archiveId: string;
  title: string;
  year: string;
  mp4Path: string;
  srtName: string;
  isAsr: boolean;
  cues: SrtCue[];
}

export interface ClassicCinemaMatch {
  archiveId: string;
  title: string;
  year: string;
  mp4Path: string;
  startSec: number;
  endSec: number;
  sentence: string;
  score: number;
}

const CACHE_DIR = path.resolve(process.cwd(), 'data', 'subtitles-cache');
const MAX_CLIP_DURATION_SEC = 40;

let cachedScripts: LoadedFilmScript[] | null = null;

function parseSrtTimestampToSec(raw: string): number {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!m) return -1;
  const hrs = Number(m[1]);
  const mins = Number(m[2]);
  const secs = Number(m[3]);
  const ms = Number(m[4].padEnd(3, '0'));
  return hrs * 3600 + mins * 60 + secs + ms / 1000;
}

function cleanCueText(raw: string): string {
  const base = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\\[^}]+\}/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Fix common DVD-sub OCR confusion (e.g. teII -> tell, jeweIs -> jewels, Iike -> like)
  return base
    .replace(/\bIike\b/g, 'like')
    .replace(/([a-z])I/g, '$1l')
    .replace(/([a-z])I/g, '$1l');
}

export function parseSrtCues(srtContent: string): SrtCue[] {
  const normalized = srtContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const cues: SrtCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) continue;

    const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIdx === -1) continue;

    const [startRaw, endRawPart] = lines[timeLineIdx].split('-->');
    const endRaw = (endRawPart ?? '').trim().split(/\s+/)[0] ?? '';
    const startSec = parseSrtTimestampToSec(startRaw ?? '');
    const endSec = parseSrtTimestampToSec(endRaw);
    if (startSec < 0 || endSec <= startSec) continue;

    const text = cleanCueText(lines.slice(timeLineIdx + 1).join(' '));
    if (!text) continue;

    cues.push({
      index: cues.length + 1,
      startSec,
      endSec,
      text,
    });
  }

  return cues;
}

function loadClassicCinemaCorpus(): LoadedFilmScript[] {
  if (cachedScripts !== null) {
    return cachedScripts;
  }

  const list: LoadedFilmScript[] = [];
  if (!fs.existsSync(CACHE_DIR)) {
    cachedScripts = list;
    return list;
  }

  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
  for (const jsonFile of files) {
    const key = jsonFile.replace(/\.json$/, '');
    const metaPath = path.join(CACHE_DIR, jsonFile);
    const srtPath = path.join(CACHE_DIR, `${key}.srt`);
    if (!fs.existsSync(srtPath)) continue;

    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as CachedFilmMeta;
      if (!meta?.id || !meta?.mp4 || !meta?.srt) continue;

      const srtRaw = fs.readFileSync(srtPath, 'utf-8');
      const cues = parseSrtCues(srtRaw);
      if (cues.length < 20) continue;

      const isAsr = /\.asr\.srt$/i.test(meta.srt);
      list.push({
        key,
        archiveId: meta.id,
        title: String(meta.title || meta.id).trim(),
        year: String(meta.year || '').trim(),
        mp4Path: meta.mp4,
        srtName: meta.srt,
        isAsr,
        cues,
      });
    } catch {
      // Skip malformed cache entries
    }
  }

  // Prefer human-authored subtitles first
  list.sort((a, b) => Number(a.isAsr) - Number(b.isAsr));
  cachedScripts = list;
  return list;
}

const MUSICAL_OR_BAD_CUE_RE =
  /(\[music|♪|\(singing\)|\[singing|captioning sponsored|subtitles by|legenda|translated by)/i;

export function findBestClassicCinemaMatch(
  term: string,
  opts: {
    isUnsafeText: (text: string) => boolean;
    lineContainsTerm: (line: string, target: string) => boolean;
  }
): ClassicCinemaMatch | null {
  const cleanTerm = term.trim();
  if (!cleanTerm) return null;

  const corpus = loadClassicCinemaCorpus();
  if (corpus.length === 0) return null;

  const exactWordRe = new RegExp(
    `\\b${cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
    'i'
  );

  let best: ClassicCinemaMatch | null = null;

  for (const film of corpus) {
    if (opts.isUnsafeText(film.title)) continue;

    const cues = film.cues;
    for (let i = 0; i < cues.length; i++) {
      const cur = cues[i];
      if (!cur.text || cur.startSec < 12) continue; // skip opening credits

      const curWords = cur.text.split(/\s+/).filter(Boolean).length;
      const candidates: Array<{
        text: string;
        startSec: number;
        endSec: number;
      }> = [{ text: cur.text, startSec: cur.startSec, endSec: cur.endSec }];

      if (
        i + 1 < cues.length &&
        cues[i + 1].startSec - cur.endSec <= 1.8 &&
        (!/[.!?]$/.test(cur.text) || curWords <= 4)
      ) {
        candidates.push({
          text: `${cur.text} ${cues[i + 1].text}`.replace(/\s+/g, ' ').trim(),
          startSec: cur.startSec,
          endSec: cues[i + 1].endSec,
        });
      }

      for (const cand of candidates) {
        if (!opts.lineContainsTerm(cand.text, cleanTerm)) continue;
        if (MUSICAL_OR_BAD_CUE_RE.test(cand.text)) continue;

        const cleanSentence = cand.text
          .replace(/^[-–—>\s]+/, '')
          .replace(/\s+/g, ' ')
          .trim();

        // Reject ASR stutter/repetition like "no no no"
        if (/\b(\w+)\s+\1\s+\1\b/i.test(cleanSentence)) continue;

        const words = cleanSentence.split(/\s+/).filter(Boolean);
        if (words.length < 4 || words.length > 30 || cleanSentence.length < 16) {
          continue;
        }

        // Safety check across candidate AND neighboring context cues
        const neighborContext = [
          cues[i - 1]?.text ?? '',
          cleanSentence,
          cues[i + 1]?.text ?? '',
          cues[i + 2]?.text ?? '',
        ].join(' ');
        if (opts.isUnsafeText(neighborContext)) continue;

        const hasStartCap = /^[A-Z"'“‘]/.test(cleanSentence);
        const hasEndPunct = /[.!?]["'”’]?$/.test(cleanSentence);
        if (film.isAsr && (!hasStartCap || !hasEndPunct || words.length < 5)) {
          continue;
        }

        let score = 0;
        if (!film.isAsr) score += 200;
        if (
          /twilight zone|sherlock holmes|his girl friday|meet john doe|royal wedding|pride and prejudice|importance of being earnest/i.test(
            film.title
          )
        ) {
          score += 35;
        }
        if (hasStartCap) score += 20;
        if (hasEndPunct) score += 25;
        if (words.length >= 5 && words.length <= 18) score += 25;
        if (exactWordRe.test(cleanSentence)) score += 20;
        if (cleanSentence.length <= 130) score += 10;

        if (/^[A-Z]{2,}(?:\s+[A-Z]{2,})?:/.test(cleanSentence)) {
          score -= 8;
        }

        if (!best || score > best.score) {
          best = {
            archiveId: film.archiveId,
            title: film.title,
            year: film.year,
            mp4Path: film.mp4Path,
            startSec: cand.startSec,
            endSec: cand.endSec,
            sentence: cleanSentence,
            score,
          };
        }
      }
    }
  }

  return best;
}

export async function sliceArchiveClipToMp4(
  match: ClassicCinemaMatch,
  videosDir: string
): Promise<{
  videoUrl: string;
  filename: string;
  durationSec: number;
} | null> {
  const clipStartSec = Math.max(0, Math.floor(match.startSec) - 3);
  const dialogueSpan = Math.max(3, Math.ceil(match.endSec - match.startSec));
  const clipDurationSec = Math.min(
    MAX_CLIP_DURATION_SEC,
    Math.max(10, Math.min(18, dialogueSpan + 8))
  );

  const encodedPath = match.mp4Path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const mp4Url = `https://archive.org/download/${encodeURIComponent(match.archiveId)}/${encodedPath}`;

  const filename = `ep-film-${crypto.randomUUID()}.mp4`;
  const targetPath = path.resolve(videosDir, filename);
  if (!targetPath.startsWith(videosDir + path.sep)) {
    return null;
  }

  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-ss',
        String(clipStartSec),
        '-i',
        mp4Url,
        '-t',
        String(clipDurationSec),
        '-vf',
        "scale='min(854,iw)':-2",
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '24',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        targetPath,
      ],
      { timeout: 28000 }
    );

    const stat = await fsp.stat(targetPath);
    if (!stat.isFile() || stat.size < 20_000) {
      await fsp.unlink(targetPath).catch(() => undefined);
      return null;
    }

    return {
      videoUrl: `/api/videos/file/${filename}`,
      filename,
      durationSec: clipDurationSec,
    };
  } catch (err) {
    console.error('ffmpeg archive clip slice failed:', err instanceof Error ? err.message : err);
    await fsp.unlink(targetPath).catch(() => undefined);
    return null;
  }
}
