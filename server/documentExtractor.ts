import mammoth from 'mammoth';
import { getDocumentProxy, getResolvedPDFJS } from 'unpdf';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

export interface BoldExtractedEntry {
  term: string;
  partOfSpeechHint?: string;
  definitionHint?: string;
  exampleHint?: string;
  lineText?: string;
}

export interface ExtractionResult {
  text: string;
  pageCount?: number;
  boldEntries?: BoldExtractedEntry[];
}

interface PositionedItem {
  text: string;
  hasLeadingSpace: boolean;
  hasTrailingSpace: boolean;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  isBold?: boolean;
}

interface VisualLine {
  y: number;
  fontSize: number;
  xStart: number;
  xEnd: number;
  text: string;
  boldRuns?: Array<{ boldText: string; afterText: string }>;
}

export function normalizeUnicodeText(raw: string): string {
  return raw
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/\uFB05/g, 'st')
    .replace(/\uFB06/g, 'st')
    .replace(/[\u00AD\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .normalize('NFKC');
}

export function normalizeFinalDocumentText(raw: string): string {
  return normalizeUnicodeText(raw)
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function median(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Finds the cleanest vertical gutter that divides a block of PDF text items
 * into Left and Right columns, returning null when the block is single-column
 * or spans across the middle (such as titles, single-column prose, or wide tables).
 */
function findColumnSplitX(
  items: PositionedItem[],
  pageWidth: number
): number | null {
  if (items.length < 8 || pageWidth <= 0) return null;

  const minX = Math.min(...items.map((it) => it.x));
  const maxX = Math.max(...items.map((it) => it.x + it.width));
  const regionWidth = maxX - minX;
  if (regionWidth < pageWidth * 0.42) return null;

  // Search candidate split positions across the middle 28%..72% of the region
  const startX = minX + regionWidth * 0.28;
  const endX = minX + regionWidth * 0.72;

  let bestGapWidth = 0;
  let bestSplitX: number | null = null;

  const step = 4;
  let runStart: number | null = null;

  for (let cx = startX; cx <= endX; cx += step) {
    let crossingCount = 0;
    let leftCount = 0;
    let rightCount = 0;

    for (const it of items) {
      const x0 = it.x;
      const x1 = it.x + Math.max(it.width, it.fontSize * 0.4);
      if (x0 < cx - 2 && x1 > cx + 2) {
        crossingCount++;
      } else if (x1 <= cx) {
        leftCount++;
      } else if (x0 >= cx) {
        rightCount++;
      }
    }

    const validGutter =
      crossingCount === 0 && leftCount >= 3 && rightCount >= 3;

    if (validGutter) {
      if (runStart === null) runStart = cx;
      const gapWidth = cx - runStart + step;
      if (gapWidth > bestGapWidth) {
        bestGapWidth = gapWidth;
        bestSplitX = (runStart + cx) / 2;
      }
    } else {
      runStart = null;
    }
  }

  // Require at least a 12pt wide clean vertical gutter
  if (bestSplitX === null || bestGapWidth < 12) {
    return null;
  }

  // Verify both sides have at least 3 distinct vertical lines
  const leftYs = new Set(
    items
      .filter((it) => it.x + it.width <= bestSplitX!)
      .map((it) => Math.round(it.y / 6))
  );
  const rightYs = new Set(
    items
      .filter((it) => it.x >= bestSplitX!)
      .map((it) => Math.round(it.y / 6))
  );

  if (leftYs.size < 3 || rightYs.size < 3) {
    return null;
  }

  return bestSplitX;
}

/**
 * Recursively partitions a page into reading-order zones:
 * Splits at full-width spanning bands first (e.g. title, full-width abstract, footer),
 * and inside purely columned bands splits Left column then Right column.
 */
function orderItemsIntoZones(
  items: PositionedItem[],
  pageWidth: number,
  depth = 0
): PositionedItem[][] {
  if (items.length === 0) return [];
  if (depth >= 2) return [items];

  const splitX = findColumnSplitX(items, pageWidth);
  if (splitX !== null) {
    const leftItems = items.filter((it) => it.x + it.width / 2 < splitX);
    const rightItems = items.filter((it) => it.x + it.width / 2 >= splitX);
    return [
      ...orderItemsIntoZones(leftItems, pageWidth, depth + 1),
      ...orderItemsIntoZones(rightItems, pageWidth, depth + 1),
    ];
  }

  // Check if the top or bottom has full-width items while the middle is 2-column:
  // Group preliminary horizontal bands by finding items that cross the center 40%-60% band.
  const minX = Math.min(...items.map((it) => it.x));
  const maxX = Math.max(...items.map((it) => it.x + it.width));
  const midX = (minX + maxX) / 2;

  const sortedByY = [...items].sort((a, b) => a.y - b.y);
  const wideLineYs: Array<{ yMin: number; yMax: number }> = [];

  for (const it of sortedByY) {
    const x0 = it.x;
    const x1 = it.x + it.width;
    if (x0 < midX - 18 && x1 > midX + 18) {
      const tol = Math.max(4, it.fontSize * 0.5);
      const last = wideLineYs[wideLineYs.length - 1];
      if (last && it.y <= last.yMax + tol) {
        last.yMax = Math.max(last.yMax, it.y);
      } else {
        wideLineYs.push({ yMin: it.y, yMax: it.y });
      }
    }
  }

  if (wideLineYs.length === 0 || wideLineYs.length === sortedByY.length) {
    return [items];
  }

  // Segment vertical strips around full-width spanning bands
  const strips: PositionedItem[][] = [];
  let cursor = 0;

  for (const band of wideLineYs) {
    const above: PositionedItem[] = [];
    const inside: PositionedItem[] = [];

    while (cursor < sortedByY.length) {
      const it = sortedByY[cursor];
      if (it.y < band.yMin - 3) {
        above.push(it);
        cursor++;
      } else if (it.y <= band.yMax + 3) {
        inside.push(it);
        cursor++;
      } else {
        break;
      }
    }

    if (above.length > 0) {
      const subSplit = findColumnSplitX(above, pageWidth);
      if (subSplit !== null) {
        const left = above.filter((it) => it.x + it.width / 2 < subSplit);
        const right = above.filter((it) => it.x + it.width / 2 >= subSplit);
        strips.push(
          ...orderItemsIntoZones(left, pageWidth, depth + 1),
          ...orderItemsIntoZones(right, pageWidth, depth + 1)
        );
      } else {
        strips.push(above);
      }
    }
    if (inside.length > 0) {
      strips.push(inside);
    }
  }

  if (cursor < sortedByY.length) {
    const below = sortedByY.slice(cursor);
    const subSplit = findColumnSplitX(below, pageWidth);
    if (subSplit !== null) {
      const left = below.filter((it) => it.x + it.width / 2 < subSplit);
      const right = below.filter((it) => it.x + it.width / 2 >= subSplit);
      strips.push(
        ...orderItemsIntoZones(left, pageWidth, depth + 1),
        ...orderItemsIntoZones(right, pageWidth, depth + 1)
      );
    } else {
      strips.push(below);
    }
  }

  return strips;
}

const POS_NORMALIZE_MAP: Record<string, string> = {
  noun: 'Noun',
  'n.': 'Noun',
  n: 'Noun',
  verb: 'Verb',
  'v.': 'Verb',
  v: 'Verb',
  adjective: 'Adjective',
  'adj.': 'Adjective',
  adj: 'Adjective',
  adverb: 'Adverb',
  'adv.': 'Adverb',
  adv: 'Adverb',
  preposition: 'Preposition',
  'prep.': 'Preposition',
  prep: 'Preposition',
  conjunction: 'Conjunction',
  'conj.': 'Conjunction',
  pronoun: 'Pronoun',
  'pron.': 'Pronoun',
  idiom: 'Phrase',
  phrase: 'Phrase',
  'phrasal verb': 'Verb',
};

export function parseBoldSpanToEntry(
  rawBold: string,
  afterText = '',
  nextLineText = '',
  fullLineText = ''
): BoldExtractedEntry | null {
  let cleaned = rawBold
    .replace(/^[\s•●▪◦▸►*\-–—:;,.!?()[\]"'“”‘’]+/, '')
    .replace(/[\s:;,.!?—–-]+$/, '')
    .trim();
  if (!cleaned) return null;

  let partOfSpeechHint: string | undefined;
  const posMatch = cleaned.match(
    /^(.+?)\s*\(\s*(noun|verb|adjective|adj\.?|adverb|adv\.?|preposition|prep\.?|conjunction|conj\.?|pronoun|pron\.?|idiom|phrase|phrasal\s+verb|n\.?|v\.?)\s*\)\s*$/i
  );
  if (posMatch) {
    cleaned = posMatch[1].trim();
    const rawPos = posMatch[2].toLowerCase().replace(/\s+/g, ' ');
    partOfSpeechHint = POS_NORMALIZE_MAP[rawPos] ?? rawPos;
  }

  cleaned = cleaned
    .replace(/[\s:;,.!?—–-]+$/, '')
    .replace(/^(?:\d+[.)]\s*)/, '')
    .trim();

  if (!cleaned || cleaned.length < 2 || cleaned.length > 60) return null;
  if (!/[a-zA-Z]{2,}/.test(cleaned)) return null;
  if (/^\d+$/.test(cleaned)) return null;

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length > 4) return null;

  // Skip structural headings like "Unit 9", "Chapter 2", "Page 1", "Vocabulary List"
  if (
    /^(?:unit|chapter|lesson|module|part|section|page|vocabulary|glossary|contents|table|figure|exercise)\b/i.test(
      cleaned
    ) &&
    words.length >= 2
  ) {
    return null;
  }

  let definitionHint: string | undefined;
  let exampleHint: string | undefined;

  const trimmedAfter = afterText.trim();
  if (trimmedAfter) {
    const defClean = trimmedAfter.replace(/^[:\-–—\s]+/, '').trim();
    if (defClean.length >= 4) {
      definitionHint = defClean.slice(0, 300);
    }
  }

  const trimmedNext = nextLineText.trim();
  if (/^(?:[•●▪◦▸►*-]|ex(?:ample)?:)/i.test(trimmedNext)) {
    const exClean = trimmedNext
      .replace(/^(?:[•●▪◦▸►*-]|ex(?:ample)?:)\s*/i, '')
      .trim();
    if (exClean.length >= 8) {
      exampleHint = exClean.slice(0, 300);
    }
  } else if (fullLineText && fullLineText.length > cleaned.length + 12 && !definitionHint) {
    exampleHint = fullLineText.slice(0, 300);
  }

  return {
    term: cleaned.charAt(0).toUpperCase() + cleaned.slice(1),
    ...(partOfSpeechHint ? { partOfSpeechHint } : {}),
    ...(definitionHint ? { definitionHint } : {}),
    ...(exampleHint ? { exampleHint } : {}),
    ...(fullLineText ? { lineText: fullLineText.slice(0, 300) } : {}),
  };
}

function reconstructZoneText(zoneItems: PositionedItem[]): {
  text: string;
  lines: VisualLine[];
} {
  if (zoneItems.length === 0) return { text: '', lines: [] };

  // Sort strictly top-to-bottom (y ascending in viewport coords) then left-to-right
  const sorted = [...zoneItems].sort((a, b) => a.y - b.y || a.x - b.x);

  // Cluster items into visual horizontal lines
  const rawLines: PositionedItem[][] = [];
  for (const item of sorted) {
    const lastLine = rawLines[rawLines.length - 1];
    if (!lastLine) {
      rawLines.push([item]);
      continue;
    }
    const anchorY =
      lastLine.reduce((sum, x) => sum + x.y, 0) / lastLine.length;
    const avgFontSize =
      lastLine.reduce((sum, x) => sum + x.fontSize, 0) / lastLine.length;
    const yTolerance = Math.max(2.5, Math.min(avgFontSize, item.fontSize) * 0.45);

    if (Math.abs(item.y - anchorY) <= yTolerance) {
      lastLine.push(item);
    } else {
      rawLines.push([item]);
    }
  }

  // Sort each line left-to-right and join fragments with geometric space awareness
  const lines: VisualLine[] = [];
  for (const lineItems of rawLines) {
    lineItems.sort((a, b) => a.x - b.x);

    let lineText = '';
    let prevEnd = -Infinity;
    let prevX = -Infinity;
    let prevText = '';
    let prevTrailingSpace = false;
    let prevFontSize = lineItems[0].fontSize || 11;

    // Also track contiguous bold fragments for exact bold term extraction
    const lineSegments: Array<{ text: string; isBold: boolean }> = [];

    for (const it of lineItems) {
      // Deduplicate fake-bold repeated glyph renders at almost the exact same spot
      if (
        lineText.length > 0 &&
        it.text === prevText &&
        Math.abs(it.x - prevX) < Math.max(1.5, it.fontSize * 0.15)
      ) {
        if (lineSegments.length > 0) {
          lineSegments[lineSegments.length - 1].isBold = true;
        }
        continue;
      }

      const gap = it.x - prevEnd;
      const spaceThresh = Math.max(
        1.2,
        Math.min(it.fontSize, prevFontSize) * 0.16
      );
      const needsSpace =
        lineText.length > 0 &&
        (prevTrailingSpace || it.hasLeadingSpace || gap > spaceThresh);

      let spacePrefix = '';
      if (needsSpace) {
        const startsPunct = /^[,.;:!?)\]}'"”’%°]/.test(it.text);
        if (!startsPunct || gap > spaceThresh * 2.2) {
          spacePrefix = ' ';
          lineText += ' ';
        }
      }

      lineText += it.text;

      const isBold = Boolean(it.isBold);
      const lastSeg = lineSegments[lineSegments.length - 1];
      if (lastSeg && lastSeg.isBold === isBold) {
        lastSeg.text += spacePrefix + it.text;
      } else {
        lineSegments.push({ text: it.text, isBold });
      }

      prevEnd = Math.max(prevEnd, it.x + it.width);
      prevX = it.x;
      prevText = it.text;
      prevTrailingSpace = it.hasTrailingSpace;
      prevFontSize = it.fontSize || prevFontSize;
    }

    const trimmed = lineText.trim();
    if (!trimmed) continue;

    const boldRuns: Array<{ boldText: string; afterText: string }> = [];
    for (let sIdx = 0; sIdx < lineSegments.length; sIdx++) {
      const seg = lineSegments[sIdx];
      if (!seg.isBold) continue;
      const afterText = lineSegments
        .slice(sIdx + 1)
        .map((s) => s.text)
        .join(' ')
        .trim();
      boldRuns.push({ boldText: seg.text.trim(), afterText });
    }

    const y = lineItems.reduce((s, it) => s + it.y, 0) / lineItems.length;
    const fontSize =
      lineItems.reduce((s, it) => s + it.fontSize, 0) / lineItems.length;
    const xStart = lineItems[0].x;
    const xEnd = Math.max(...lineItems.map((it) => it.x + it.width));

    lines.push({ y, fontSize, xStart, xEnd, text: trimmed, boldRuns });
  }

  if (lines.length === 0) return { text: '', lines: [] };

  // Determine median line spacing & zone horizontal bounds for smart paragraph detection
  const lineGaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const dy = lines[i].y - lines[i - 1].y;
    const fs = lines[i].fontSize || 11;
    if (dy > fs * 0.5 && dy < fs * 2.5) {
      lineGaps.push(dy);
    }
  }
  const avgFont = median(
    lines.map((l) => l.fontSize),
    11
  );
  const medianStep = median(lineGaps, avgFont * 1.25);
  const blockLeftEdge = Math.min(...lines.map((l) => l.xStart));
  const blockRightEdge = Math.max(...lines.map((l) => l.xEnd));
  const blockWidth = Math.max(100, blockRightEdge - blockLeftEdge);

  const paragraphs: string[] = [];
  let currentPara = lines[0].text;

  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const curr = lines[i];
    const dy = curr.y - prev.y;

    const isHyphenWrap =
      /\p{L}-$/u.test(prev.text) &&
      /^\p{Ll}/u.test(curr.text) &&
      dy <= medianStep * 1.45;

    const isLargeVerticalGap = dy > Math.max(medianStep * 1.38, avgFont * 1.65);
    const isFontChange = Math.abs(curr.fontSize - prev.fontSize) > 1.8;
    const isListItem = /^(?:[•●▪◦▸►*-]|\d{1,3}[.)]|[a-zA-Z][.)])\s/.test(
      curr.text
    );
    const prevEndedShort =
      /[.!?…"”’)]$/.test(prev.text) &&
      prev.xEnd < blockRightEdge - blockWidth * 0.16;
    const currIndented =
      curr.xStart > blockLeftEdge + curr.fontSize * 0.9 &&
      /[.!?…"”’):]$/.test(prev.text);

    if (isHyphenWrap) {
      currentPara = currentPara.slice(0, -1) + curr.text;
    } else if (
      isLargeVerticalGap ||
      isFontChange ||
      isListItem ||
      prevEndedShort ||
      currIndented
    ) {
      paragraphs.push(currentPara);
      currentPara = curr.text;
    } else {
      currentPara += ' ' + curr.text;
    }
  }

  if (currentPara.trim()) {
    paragraphs.push(currentPara);
  }

  return { text: paragraphs.join('\n\n'), lines };
}

function isPdfFontBold(
  fontKey: string,
  page: { commonObjs?: { has: (k: string) => boolean; get: (k: string) => unknown } },
  styles?: Record<string, { fontFamily?: string }>
): boolean {
  if (!fontKey) return false;
  let descriptor = '';
  try {
    if (page.commonObjs?.has(fontKey)) {
      const obj = page.commonObjs.get(fontKey) as {
        name?: string;
        bold?: boolean;
        black?: boolean;
      } | null;
      if (obj?.bold || obj?.black) return true;
      if (obj?.name) descriptor += ` ${obj.name}`;
    }
  } catch {
    // Ignore missing font object
  }
  const styleFamily = styles?.[fontKey]?.fontFamily;
  if (styleFamily) descriptor += ` ${styleFamily}`;
  return /bold|black|heavy|semibold|demibold|extrabold|ultrabold|[-_,]bd\b|[-_,]b\b|\b(?:700|800|900)\b/i.test(
    descriptor
  );
}

export async function extractPdfTextInReadingOrder(
  buffer: Buffer
): Promise<ExtractionResult> {
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const pdfjs = await getResolvedPDFJS();
  const loadingTask = pdfjs.getDocument({
    data,
    fontExtraProperties: true,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;

  try {
    const pageTexts: string[] = [];
    const allBoldEntries: BoldExtractedEntry[] = [];
    const seenBoldKeys = new Set<string>();

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      try {
        // Trigger operator list so page.commonObjs resolves real font names (e.g. Arial-BoldMT)
        try {
          await page.getOperatorList();
        } catch {
          // Proceed even if operator list fails on an exotic PDF
        }
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent({ includeMarkedContent: false });
        const fontBoldCache = new Map<string, boolean>();
        const positioned: PositionedItem[] = [];

        for (const rawItem of content.items) {
          if (!('str' in rawItem) || typeof rawItem.str !== 'string') continue;
          const norm = normalizeUnicodeText(rawItem.str);
          const trimmed = norm.trim();
          if (!trimmed) continue;

          const fontKey = 'fontName' in rawItem && typeof rawItem.fontName === 'string'
            ? rawItem.fontName
            : '';
          let isBold = fontBoldCache.get(fontKey);
          if (isBold === undefined) {
            isBold = isPdfFontBold(
              fontKey,
              page as unknown as { commonObjs?: { has: (k: string) => boolean; get: (k: string) => unknown } },
              content.styles as Record<string, { fontFamily?: string }> | undefined
            );
            fontBoldCache.set(fontKey, isBold);
          }

          const tx = pdfjs.Util.transform(viewport.transform, rawItem.transform);
          const fontSize =
            Math.hypot(tx[0], tx[1]) ||
            Math.hypot(tx[2], tx[3]) ||
            rawItem.height ||
            11;
          const x = tx[4];
          const y = tx[5];
          const width = Math.max(0, Number(rawItem.width) || 0);

          positioned.push({
            text: trimmed,
            hasLeadingSpace: /^\s/.test(norm),
            hasTrailingSpace: /\s$/.test(norm),
            x,
            y,
            width,
            fontSize,
            isBold,
          });
        }

        const zones = orderItemsIntoZones(positioned, viewport.width);
        const zoneStrings: string[] = [];
        const pageLines: VisualLine[] = [];
        for (const zone of zones) {
          const rebuilt = reconstructZoneText(zone);
          if (rebuilt.text) zoneStrings.push(rebuilt.text);
          if (rebuilt.lines.length > 0) pageLines.push(...rebuilt.lines);
        }

        for (let i = 0; i < pageLines.length; i++) {
          const curr = pageLines[i];
          const next = pageLines[i + 1];
          for (const run of curr.boldRuns ?? []) {
            const parsed = parseBoldSpanToEntry(
              run.boldText,
              run.afterText,
              next?.text ?? '',
              curr.text
            );
            if (parsed) {
              const key = parsed.term.toLowerCase();
              if (!seenBoldKeys.has(key)) {
                seenBoldKeys.add(key);
                allBoldEntries.push(parsed);
              }
            }
          }
        }

        if (zoneStrings.length > 0) {
          pageTexts.push(zoneStrings.join('\n\n'));
        }
      } finally {
        page.cleanup();
      }
    }

    return {
      text: normalizeFinalDocumentText(pageTexts.join('\n\n')),
      pageCount: pdf.numPages,
      ...(allBoldEntries.length > 0 ? { boldEntries: allBoldEntries } : {}),
    };
  } finally {
    await loadingTask.destroy();
  }
}

interface XmlNodeLike {
  localName?: string | null;
  nodeName: string;
  textContent?: string | null;
  firstChild: XmlNodeLike | null;
  nextSibling: XmlNodeLike | null;
}

function extractParagraphsFromWordXml(xmlString: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const paragraphs: string[] = [];

  const getLocalName = (node: XmlNodeLike): string =>
    node.localName || node.nodeName.replace(/^.*:/, '');

  const collectDirectRunText = (node: XmlNodeLike): string => {
    const localName = getLocalName(node);
    if (localName === 'Fallback' || localName === 'instrText') return '';
    if (localName === 'txbxContent') {
      walkForParagraphs(node);
      return '';
    }
    if (localName === 't' || localName === 'delText') {
      return node.textContent || '';
    }
    if (localName === 'tab') return ' ';
    if (localName === 'br' || localName === 'cr') return '\n';

    let out = '';
    for (let child = node.firstChild; child; child = child.nextSibling) {
      out += collectDirectRunText(child);
    }
    return out;
  };

  const walkForParagraphs = (node: XmlNodeLike) => {
    const localName = getLocalName(node);
    if (localName === 'Fallback') return;

    if (localName === 'p') {
      let directText = '';
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const childLocal = getLocalName(child);
        if (childLocal === 'txbxContent') continue;
        directText += collectDirectRunText(child);
      }
      const cleaned = directText.replace(/[ \t]+/g, ' ').trim();
      if (cleaned) {
        paragraphs.push(cleaned);
      }
      return;
    }

    for (let child = node.firstChild; child; child = child.nextSibling) {
      walkForParagraphs(child);
    }
  };

  if (doc?.documentElement) {
    walkForParagraphs(doc.documentElement as unknown as XmlNodeLike);
  }
  return paragraphs;
}

export function extractBoldEntriesFromHtml(html: string): BoldExtractedEntry[] {
  const entries: BoldExtractedEntry[] = [];
  const seen = new Set<string>();

  const stripTags = (s: string) =>
    normalizeUnicodeText(
      s
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
    )
      .replace(/\s+/g, ' ')
      .trim();

  const blockMatches = html.match(/<(?:p|li|td|th|h[1-6]|div)[^>]*>[\s\S]*?<\/(?:p|li|td|th|h[1-6]|div)>/gi) ?? [html];
  for (let i = 0; i < blockMatches.length; i++) {
    const block = blockMatches[i];
    const nextBlockText = i + 1 < blockMatches.length ? stripTags(blockMatches[i + 1]) : '';
    const fullLineText = stripTags(block);
    const boldRe = /<(?:strong|b)(?:\s+[^>]*)?>([\s\S]*?)<\/(?:strong|b)>/gi;
    let m: RegExpExecArray | null;
    while ((m = boldRe.exec(block)) !== null) {
      const boldText = stripTags(m[1]);
      const afterText = stripTags(block.slice(m.index + m[0].length));
      const parsed = parseBoldSpanToEntry(boldText, afterText, nextBlockText, fullLineText);
      if (parsed) {
        const key = parsed.term.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          entries.push(parsed);
        }
      }
    }
  }
  return entries;
}

export function extractBoldEntriesFromMarkdown(text: string): BoldExtractedEntry[] {
  const entries: BoldExtractedEntry[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] ?? '';
    const re = /(?:\*\*|__)([^\n*_]{2,60})(?:\*\*|__)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const afterText = line
        .slice(m.index + m[0].length)
        .replace(/(?:\*\*|__)/g, '')
        .trim();
      const parsed = parseBoldSpanToEntry(
        m[1],
        afterText,
        nextLine,
        line.replace(/(?:\*\*|__)/g, '')
      );
      if (parsed) {
        const key = parsed.term.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          entries.push(parsed);
        }
      }
    }
  }
  return entries;
}

export async function extractDocxTextComplete(
  buffer: Buffer
): Promise<ExtractionResult> {
  // 1. Primary extraction via mammoth (text + HTML bold spans)
  const [mammothRes, htmlRes] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    mammoth.convertToHtml({ buffer }).catch(() => ({ value: '' })),
  ]);
  const mammothText = normalizeFinalDocumentText(String(mammothRes.value ?? ''));
  const boldEntries = extractBoldEntriesFromHtml(String(htmlRes.value ?? ''));

  // 2. Also inspect OOXML directly to capture textboxes, headers/footers/footnotes,
  // or complex structures that mammoth skips
  try {
    const zip = await JSZip.loadAsync(buffer);
    const bodyFile = zip.file('word/document.xml');
    if (bodyFile) {
      const xml = await bodyFile.async('string');
      const hasTextBoxes = xml.includes('txbxContent');

      // Also check footnotes/endnotes
      const extraParts: string[] = [];
      for (const name of Object.keys(zip.files)) {
        if (/^word\/(?:footnotes|endnotes)\.xml$/i.test(name)) {
          const noteXml = await zip.file(name)!.async('string');
          const noteParas = extractParagraphsFromWordXml(noteXml);
          if (noteParas.length > 0) {
            extraParts.push(...noteParas);
          }
        }
      }

      if (hasTextBoxes || !mammothText) {
        const xmlParas = extractParagraphsFromWordXml(xml);
        const combined = normalizeFinalDocumentText(
          [...xmlParas, ...extraParts].join('\n\n')
        );
        if (combined.length >= mammothText.length) {
          return {
            text: combined,
            ...(boldEntries.length > 0 ? { boldEntries } : {}),
          };
        }
      }

      if (extraParts.length > 0 && mammothText) {
        return {
          text: normalizeFinalDocumentText(
            `${mammothText}\n\n${extraParts.join('\n\n')}`
          ),
          ...(boldEntries.length > 0 ? { boldEntries } : {}),
        };
      }
    }
  } catch {
    // Fallback cleanly to mammoth output if custom XML pass fails
  }

  return {
    text: mammothText,
    ...(boldEntries.length > 0 ? { boldEntries } : {}),
  };
}
