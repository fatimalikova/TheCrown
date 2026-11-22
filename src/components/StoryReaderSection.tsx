import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit3,
  FileText,
  FileUp,
  Languages,
  Loader2,
  Network,
  Star,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import {
  DifficultItem,
  IdiomEntry,
  LexiconCategory,
  PhrasalVerbEntry,
  ReadingToken,
  ReadingWork,
  WordEntry,
} from '../types/lexicon';
import { speakEnglish } from '../utils/speech';
import { lookupLocalStoryWord } from '../data/storyDictionary';

interface StoryReaderSectionProps {
  works: ReadingWork[];
  allWords: WordEntry[];
  allIdioms: IdiomEntry[];
  allPhrasals: PhrasalVerbEntry[];
  difficultIds: Set<string>;
  onToggleDifficult: (item: Omit<DifficultItem, 'addedAt'>) => void;
}

type ReaderFilter = 'all' | 'story' | 'article';
type PaperTone = 'ivory' | 'parchment' | 'sepia';

interface UploadedDocument {
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

export const StoryReaderSection: React.FC<StoryReaderSectionProps> = ({
  works,
  allWords,
  allIdioms,
  allPhrasals,
  difficultIds,
  onToggleDifficult,
}) => {
  const [modeFilter, setModeFilter] = useState<ReaderFilter>('all');
  const [selectedWorkId, setSelectedWorkId] = useState<string>(works[0]?.id ?? '');
  const [fontSizeStep, setFontSizeStep] = useState<number>(1); // 0=sm, 1=md, 2=lg
  const [paperTone, setPaperTone] = useState<PaperTone>('ivory');
  const [showAzSummary, setShowAzSummary] = useState<boolean>(false);
  const [showGlossaryDrawer, setShowGlossaryDrawer] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState(false);
  const [speakingTerm, setSpeakingTerm] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [isTranslatingWord, setIsTranslatingWord] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const remoteWordCacheRef = useRef<Map<string, ReadingToken>>(new Map());

  // Custom Story / Article & Document Upload mode
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customTitle, setCustomTitle] = useState('My Custom Story or Article');
  const [customText, setCustomText] = useState(
    'In an ancient library overlooking the Caspian sea, a curious scholar discovered a luminous manuscript. Although the fragile pages seemed ephemeral, her meticulous notes helped bring about a vivid translation for future readers.'
  );
  const [customAzNote, setCustomAzNote] = useState('');
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDocument[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [isExtractingDoc, setIsExtractingDoc] = useState(false);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const [isDraggingDoc, setIsDraggingDoc] = useState(false);
  const [showRawEditor, setShowRawEditor] = useState(false);
  const [docPageIndex, setDocPageIndex] = useState(0);
  const [showAllDocPages, setShowAllDocPages] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const lexiconWordMap = useMemo(() => {
    const map = new Map<string, WordEntry>();
    for (const w of allWords) {
      map.set(w.term.toLowerCase(), w);
    }
    return map;
  }, [allWords]);

  const docParagraphs = useMemo(() => {
    return customText
      .split(/\n{2,}/)
      .flatMap((block) => {
        const trimmed = block.trim();
        if (!trimmed) return [];
        // Keep single newlines inside short blocks intact only if needed; split overly dense newline-only lists
        if (trimmed.includes('\n')) {
          return trimmed
            .split(/\n+/)
            .map((s) => s.trim())
            .filter(Boolean);
        }
        return [trimmed];
      });
  }, [customText]);

  const docPages = useMemo(() => {
    const pages: string[][] = [];
    let currentBatch: string[] = [];
    let currentWords = 0;

    for (const para of docParagraphs) {
      const wordsInPara = para.split(/\s+/).filter(Boolean).length;
      if (
        currentBatch.length > 0 &&
        (currentWords + wordsInPara > 1100 || currentBatch.length >= 18)
      ) {
        pages.push(currentBatch);
        currentBatch = [para];
        currentWords = wordsInPara;
      } else {
        currentBatch.push(para);
        currentWords += wordsInPara;
      }
    }
    if (currentBatch.length > 0) {
      pages.push(currentBatch);
    }
    return pages.length > 0 ? pages : [['']];
  }, [docParagraphs]);

  const safeDocPageIndex = Math.min(docPageIndex, Math.max(0, docPages.length - 1));
  const visibleDocParagraphs = showAllDocPages
    ? docParagraphs
    : docPages[safeDocPageIndex] ?? [];

  useEffect(() => {
    let active = true;
    fetch('/api/documents')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && Array.isArray(data?.documents)) {
          setUploadedDocs(data.documents);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const visibleWorks = useMemo(() => {
    if (modeFilter === 'all') return works;
    return works.filter((w) => w.mode === modeFilter);
  }, [works, modeFilter]);

  const currentWork = useMemo(() => {
    return (
      visibleWorks.find((w) => w.id === selectedWorkId) ??
      visibleWorks[0] ??
      works[0]
    );
  }, [visibleWorks, selectedWorkId, works]);

  const currentWorkIndex = visibleWorks.findIndex(
    (w) => w.id === currentWork?.id
  );

  // Extract all interactive tokens from currentWork
  const workGlossary = useMemo(() => {
    if (!currentWork) return [];
    const seen = new Set<string>();
    const list: ReadingToken[] = [];
    currentWork.paragraphs.forEach((p) => {
      p.tokens.forEach((tok) => {
        if (tok.term && !seen.has(tok.term.toLowerCase())) {
          seen.add(tok.term.toLowerCase());
          list.push(tok);
        }
      });
    });
    return list;
  }, [currentWork]);

  const [activeToken, setActiveToken] = useState<ReadingToken>(() => {
    const first = works[0]?.paragraphs[1]?.tokens.find(
      (t) => t.term === 'Ephemeral'
    );
    return (
      first ??
      works[0]?.paragraphs[0]?.tokens.find((t) => Boolean(t.term)) ?? {
        text: 'Ephemeral',
        lexiconId: 'word-ephemeral',
        term: 'Ephemeral',
        badge: 'C1 · Adjective',
        category: 'word',
        ipa: '/ɪˈfem.ər.əl/',
        azTranslation: 'Müvəqqəti, qısaömürlü, tez keçən',
        azSubNote: 'Təbiətdə və ya duyğularda bir göz qırpımında yox olan təravət.',
        definition:
          'Lasting for only a very short period of time; fleeting, transitory, or of brief, evanescent duration.',
        exampleEn:
          'The ephemeral beauty of fallen autumn leaves adrift upon moist garden flagstones.',
        exampleAz:
          'Payız yarpaqlarının nəm daşlar üzərində uçuşan müvəqqəti gözəlliyi.',
        etymology:
          'Ancient Greek ἐφήμερος (ephēmeros), from epi + hēmera — “lasting only a single day.”',
      }
    );
  });

  const handleSelectWork = (work: ReadingWork) => {
    setIsCustomMode(false);
    setSelectedWorkId(work.id);
    const firstAnnotated = work.paragraphs
      .flatMap((p) => p.tokens)
      .find((t) => Boolean(t.term));
    if (firstAnnotated) {
      setActiveToken(firstAnnotated);
    }
  };

  const handleAnyWordClick = async (
    rawWord: string,
    contextSentence?: string
  ) => {
    const cleaned = rawWord
      .replace(/’/g, "'")
      .replace(/[^\p{L}\s'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return;
    const lower = cleaned.toLowerCase();
    setTranslateError(null);
    setCustomAzNote('');

    // 1. Check main Words / Idioms / Phrasal Verbs lexicons
    const wordMatch = allWords.find((w) => w.term.toLowerCase() === lower);
    if (wordMatch) {
      setIsTranslatingWord(false);
      setActiveToken({
        text: rawWord,
        lexiconId: wordMatch.id,
        term: wordMatch.term,
        badge: `${wordMatch.level} · ${wordMatch.partOfSpeech}`,
        category: 'word',
        ipa: wordMatch.ipa,
        azTranslation: wordMatch.azTranslation,
        definition: wordMatch.definition,
        exampleEn: wordMatch.exampleEn,
        exampleAz: wordMatch.exampleAz,
        etymology: wordMatch.etymology,
      });
      return;
    }

    const idiomMatch = allIdioms.find((i) => i.term.toLowerCase() === lower);
    if (idiomMatch) {
      setIsTranslatingWord(false);
      setActiveToken({
        text: rawWord,
        lexiconId: idiomMatch.id,
        term: idiomMatch.term,
        badge: idiomMatch.levelBadge,
        category: 'idiom',
        ipa: idiomMatch.ipa,
        azTranslation: idiomMatch.azEquivalent,
        azSubNote: idiomMatch.azNuance,
        definition: idiomMatch.semanticValue,
        exampleEn: idiomMatch.exampleEn,
        exampleAz: idiomMatch.exampleAz,
        etymology: idiomMatch.loreText,
      });
      return;
    }

    const pvMatch = allPhrasals.find((p) => p.term.toLowerCase() === lower);
    if (pvMatch) {
      setIsTranslatingWord(false);
      setActiveToken({
        text: rawWord,
        lexiconId: pvMatch.id,
        term: pvMatch.term,
        badge: pvMatch.levelBadge,
        category: 'phrasal',
        ipa: pvMatch.ipa,
        azTranslation: pvMatch.azTranslation,
        definition: pvMatch.definition,
        exampleEn: pvMatch.exampleEn,
        exampleAz: pvMatch.exampleAz,
        etymology: pvMatch.syntaxNote,
      });
      return;
    }

    // 2. Check instant local Story & Article bilingual dictionary
    const localHit = lookupLocalStoryWord(cleaned);
    if (localHit) {
      setIsTranslatingWord(false);
      setActiveToken({
        text: rawWord,
        lexiconId: `story-word-${lower.replace(/\s+/g, '-')}`,
        term:
          localHit.term.charAt(0).toUpperCase() + localHit.term.slice(1),
        badge: localHit.badge,
        category: 'word',
        ipa: localHit.ipa,
        azTranslation: localHit.azTranslation,
        definition: localHit.definition,
        exampleEn:
          contextSentence ||
          `Encountered in “${isCustomMode ? customTitle : currentWork?.title ?? 'Reading'}”.`,
        etymology: localHit.etymology,
      });
      return;
    }

    // 3. Check in-session remote cache
    const cached = remoteWordCacheRef.current.get(lower);
    if (cached) {
      setIsTranslatingWord(false);
      setActiveToken(cached);
      return;
    }

    // 4. Fallback to server-side translation & classification
    const displayTerm = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    const pendingToken: ReadingToken = {
      text: rawWord,
      lexiconId: `story-word-${lower.replace(/\s+/g, '-')}`,
      term: displayTerm,
      badge: 'Looking up...',
      category: 'word',
      ipa: `/${lower}/`,
      azTranslation: 'Tərcümə yüklənir...',
      definition: `Looking up “${displayTerm}” in Azerbaijani...`,
      exampleEn:
        contextSentence ||
        `Encountered in “${isCustomMode ? customTitle : currentWork?.title ?? 'Reading'}”.`,
    };
    setActiveToken(pendingToken);
    setIsTranslatingWord(true);

    try {
      const res = await fetch('/api/translate-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: cleaned,
          context: (contextSentence || '').slice(0, 300),
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.entry) {
        throw new Error(payload?.error || 'Could not translate word.');
      }
      const entry = payload.entry as {
        term: string;
        category?: LexiconCategory;
        ipa: string;
        badge: string;
        azTranslation: string;
        definition: string;
        etymology?: string;
      };
      const resolvedCat: LexiconCategory =
        entry.category === 'idiom' || entry.category === 'phrasal'
          ? entry.category
          : 'word';
      const resolvedToken: ReadingToken = {
        text: rawWord,
        lexiconId: `story-${resolvedCat}-${lower.replace(/\s+/g, '-')}`,
        term: entry.term || displayTerm,
        badge: entry.badge || 'Lexicon Lookup',
        category: resolvedCat,
        ipa: entry.ipa || `/${lower}/`,
        azTranslation: entry.azTranslation,
        definition: entry.definition,
        exampleEn:
          contextSentence ||
          `Encountered in “${isCustomMode ? customTitle : currentWork?.title ?? 'Reading'}”.`,
        etymology: entry.etymology,
      };
      remoteWordCacheRef.current.set(lower, resolvedToken);
      setActiveToken(resolvedToken);
    } catch (err) {
      setTranslateError(
        err instanceof Error ? err.message : 'Automatic lookup unavailable.'
      );
      setActiveToken({
        ...pendingToken,
        badge: 'Reader Selection',
        azTranslation:
          customAzNote.trim() || 'Add your Azerbaijani note below & save',
        definition: `Selected from “${isCustomMode ? customTitle : currentWork?.title ?? 'Reading'}”. Enter an Azerbaijani translation below and save to Difficult Words.`,
      });
    } finally {
      setIsTranslatingWord(false);
    }
  };

  const handleTextSelectionPhrase = () => {
    const sel = window.getSelection();
    const raw = sel?.toString().trim() ?? '';
    if (!raw || !/\s/.test(raw) || raw.length > 75) return;
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 7) return;
    const anchorText = sel?.anchorNode?.textContent ?? '';
    void handleAnyWordClick(raw, anchorText.slice(0, 260));
  };

  const activeUploadedDoc = useMemo(
    () => uploadedDocs.find((d) => d.id === activeDocId) ?? null,
    [uploadedDocs, activeDocId]
  );

  const handleSelectUploadedDoc = (doc: UploadedDocument) => {
    setActiveDocId(doc.id);
    setCustomTitle(doc.title);
    setCustomText(doc.text);
    setDocPageIndex(0);
    setShowAllDocPages(false);
    setDocUploadError(null);
    setShowRawEditor(false);
    setIsCustomMode(true);
  };

  const handleDeleteUploadedDoc = async (docId: string) => {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(docId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) return;
      setUploadedDocs((prev) => prev.filter((d) => d.id !== docId));
      if (activeDocId === docId) {
        setActiveDocId(null);
      }
    } catch {
      // ignore network error
    }
  };

  const processUploadedFile = async (file: File) => {
    setDocUploadError(null);
    if (file.size > 20 * 1024 * 1024) {
      setDocUploadError(
        'File exceeds the 20 MB limit. Please choose a smaller PDF, DOCX, or text document.'
      );
      setIsCustomMode(true);
      return;
    }

    setIsExtractingDoc(true);
    setIsCustomMode(true);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('Could not read the selected file.'));
          }
        };
        reader.onerror = () => reject(new Error('Could not read the selected file.'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/documents/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          dataBase64: dataUrl,
        }),
      });

      const payload = await res.json();
      if (!res.ok || !payload?.document) {
        throw new Error(
          payload?.error || 'Could not extract text from this document.'
        );
      }

      const doc = payload.document as UploadedDocument;
      setUploadedDocs((prev) => [doc, ...prev.filter((d) => d.id !== doc.id)].slice(0, 20));
      setActiveDocId(doc.id);
      setCustomTitle(doc.title);
      setCustomText(doc.text);
      setDocPageIndex(0);
      setShowAllDocPages(false);
      setShowRawEditor(false);
    } catch (err) {
      setDocUploadError(
        err instanceof Error ? err.message : 'Document upload failed.'
      );
    } finally {
      setIsExtractingDoc(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void processUploadedFile(file);
  };

  const activeId =
    activeToken.lexiconId ??
    `reader-${(activeToken.term ?? 'word').toLowerCase().replace(/\s+/g, '-')}`;
  const isSaved = difficultIds.has(activeId);

  const handleSpeak = (term: string) => {
    setSpeakingTerm(term);
    speakEnglish(term, () => setSpeakingTerm(null));
    setTimeout(() => setSpeakingTerm((prev) => (prev === term ? null : prev)), 1200);
  };

  const handleCopyGloss = () => {
    if (!activeToken.term) return;
    const summary = `${activeToken.term} (${activeToken.ipa ?? ''}) — ${activeToken.azTranslation ?? ''}\n${activeToken.definition ?? ''}`;
    navigator.clipboard?.writeText(summary).catch(() => {});
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1800);
  };

  const paperClasses: Record<PaperTone, string> = {
    ivory: 'bg-surface-container-lowest text-primary',
    parchment: 'bg-surface-container-low text-primary',
    sepia: 'bg-[#f1e7d5] text-[#241c15]',
  };

  const fontSizeClasses = [
    'text-base leading-relaxed',
    'text-lg leading-[1.85]',
    'text-xl leading-[1.9]',
  ][fontSizeStep];

  return (
    <div className="w-full max-w-[1240px] mx-auto px-4 sm:px-8 pt-6 pb-16">
      {/* Top Reader Utility Ribbon */}
      <section className="w-full flex flex-wrap items-center justify-between gap-3 bg-surface-container-low px-4 py-3 rounded-xl border border-outline-variant/40 mb-6">
        {/* Mode Switch + Work Selector */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center bg-surface-container p-1 rounded-lg">
            {(
              [
                { key: 'all', label: 'All Works' },
                { key: 'story', label: 'Story (Hekayə)' },
                { key: 'article', label: 'Article (Məqalə)' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setModeFilter(tab.key);
                  setIsCustomMode(false);
                }}
                className={`px-2.5 py-1 rounded text-xs font-[var(--font-display)] uppercase tracking-wider whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  !isCustomMode && modeFilter === tab.key
                    ? 'bg-primary text-on-primary font-semibold'
                    : 'text-on-surface-variant hover:text-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {!isCustomMode && currentWork && (
            <select
              aria-label="Select story or article"
              value={currentWork.id}
              onChange={(e) => {
                const found = visibleWorks.find((w) => w.id === e.target.value);
                if (found) handleSelectWork(found);
              }}
              className="bg-surface-container-lowest border border-outline-variant/50 rounded-lg px-3 py-1.5 font-[var(--font-display)] text-sm text-primary focus:outline-none focus:border-secondary cursor-pointer max-w-[260px] truncate"
            >
              {visibleWorks.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.mode === 'story' ? 'Hekayə: ' : 'Məqalə: '}
                  {w.title}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Reader Calibration Tools */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-surface-container rounded-lg px-1.5 py-1 gap-1 border border-outline-variant/30">
            <button
              type="button"
              onClick={() => setFontSizeStep((s) => Math.max(0, s - 1))}
              disabled={fontSizeStep === 0}
              title="Decrease text size"
              className="px-2 py-0.5 rounded hover:bg-surface text-on-surface-variant disabled:opacity-40 font-[var(--font-display)] text-xs cursor-pointer"
            >
              A-
            </button>
            <div className="w-px h-3.5 bg-outline-variant/50" />
            <button
              type="button"
              onClick={() => setFontSizeStep((s) => Math.min(2, s + 1))}
              disabled={fontSizeStep === 2}
              title="Increase text size"
              className="px-2 py-0.5 rounded hover:bg-surface text-primary disabled:opacity-40 font-[var(--font-display)] text-sm font-semibold cursor-pointer"
            >
              A+
            </button>
            <div className="w-px h-3.5 bg-outline-variant/50" />
            <button
              type="button"
              onClick={() =>
                setPaperTone((t) =>
                  t === 'ivory' ? 'parchment' : t === 'parchment' ? 'sepia' : 'ivory'
                )
              }
              title={`Paper tone: ${paperTone}`}
              className="px-2 py-0.5 rounded hover:bg-surface text-secondary flex items-center gap-1 text-xs font-[var(--font-display)] cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="capitalize hidden sm:inline">{paperTone}</span>
            </button>
          </div>

          {!isCustomMode && (
            <button
              type="button"
              onClick={() => setShowAzSummary((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-[var(--font-display)] uppercase tracking-wider transition-colors cursor-pointer ${
                showAzSummary
                  ? 'bg-secondary text-on-secondary font-semibold'
                  : 'bg-surface-container-high text-primary hover:bg-surface-container-highest'
              }`}
            >
              <Languages className="w-3.5 h-3.5" />
              <span>Az Summary</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsCustomMode((m) => !m)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-[var(--font-display)] uppercase tracking-wider transition-colors cursor-pointer ${
              isCustomMode
                ? 'bg-primary text-on-primary font-semibold'
                : 'bg-surface-container-high hover:bg-secondary-fixed text-primary'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-secondary" />
            <span>{isCustomMode ? 'Back to Library' : 'My Documents / Paste'}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.rtf,.csv,.html,.htm,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,application/rtf,text/html"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            disabled={isExtractingDoc}
            onClick={() => fileInputRef.current?.click()}
            title="Upload PDF, DOCX, TXT, MD, RTF, or HTML document"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary transition-colors cursor-pointer disabled:opacity-60 text-xs font-[var(--font-display)] uppercase tracking-wider"
          >
            {isExtractingDoc ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-secondary" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-secondary" />
            )}
            <span className="hidden sm:inline">
              {isExtractingDoc ? 'Reading...' : 'Upload Doc'}
            </span>
          </button>
        </div>
      </section>

      {/* Dual-Page Reading Desk */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Active Lexicon Flashcard Desk (5 cols) */}
        <aside className="lg:col-span-5 flex flex-col gap-4 lg:sticky lg:top-24">
          <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/50 shadow-sm">
            {/* Top Label + Level */}
            <div className="flex items-start justify-between gap-2 pb-2">
              <div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-[var(--font-display)] uppercase tracking-widest text-on-surface-variant">
                    Selected Term
                  </span>
                  <span className="text-secondary" aria-hidden="true">
                    ❦
                  </span>
                  <span className="bg-secondary-fixed text-on-secondary-fixed px-2 py-0.5 rounded font-[var(--font-display)] text-[11px] uppercase font-semibold">
                    {activeToken.badge || 'Lexicon Entry'}
                  </span>
                </div>
                <h2 className="font-[var(--font-display)] text-4xl sm:text-[42px] text-primary tracking-tight mt-1 leading-none">
                  {activeToken.term}
                </h2>
                <div className="flex items-center gap-2.5 mt-2">
                  <span className="text-sm text-on-surface-variant italic">
                    {activeToken.ipa || '/—/'}
                  </span>
                  {activeToken.term && (
                    <button
                      type="button"
                      onClick={() => handleSpeak(activeToken.term!)}
                      aria-label={`Pronounce ${activeToken.term}`}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                        speakingTerm === activeToken.term
                          ? 'bg-secondary text-on-secondary'
                          : 'bg-surface-container hover:bg-secondary-fixed text-secondary'
                      }`}
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <span className="font-[var(--font-display)] text-xs italic text-secondary shrink-0">
                The Crown
              </span>
            </div>

            {/* Azerbaijani Translation Plaque */}
            <div className="bg-surface-container-low p-4 rounded-lg border border-outline-variant/30 my-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-[var(--font-display)] text-[11px] uppercase tracking-widest text-secondary font-bold">
                  ❖ Azərbaycan Dili Tərcüməsi
                </span>
                {isTranslatingWord ? (
                  <Loader2 className="w-3.5 h-3.5 text-secondary animate-spin" />
                ) : (
                  <Languages className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
                )}
              </div>
              <p className="font-[var(--font-display)] text-xl text-primary font-semibold">
                {activeToken.azTranslation}
              </p>
              {activeToken.azSubNote && (
                <p className="text-xs text-on-surface-variant italic mt-1">
                  {activeToken.azSubNote}
                </p>
              )}
              {translateError && (
                <p className="text-[11px] text-secondary mt-1.5">
                  {translateError}
                </p>
              )}
              <input
                type="text"
                value={customAzNote}
                onChange={(e) => {
                  setCustomAzNote(e.target.value);
                  if (e.target.value.trim()) {
                    setActiveToken((prev) => ({
                      ...prev,
                      azTranslation: e.target.value.trim(),
                    }));
                  }
                }}
                placeholder="Öz tərcümə qeydini əlavə et və ya dəyiş..."
                className="mt-2.5 w-full px-2.5 py-1.5 rounded bg-surface-container-lowest text-xs border border-outline-variant/50 focus:outline-none focus:border-secondary"
              />
            </div>

            {/* Definition */}
            {activeToken.definition && (
              <div className="mb-4">
                <span className="font-[var(--font-display)] text-[11px] uppercase tracking-wider text-on-surface-variant block mb-1">
                  Explication:
                </span>
                <p className="text-sm text-on-surface leading-relaxed">
                  {activeToken.definition}
                </p>
              </div>
            )}

            {/* Literary Example */}
            {activeToken.exampleEn && (
              <div className="bg-surface-container p-3.5 rounded-lg mb-4 space-y-1.5 border border-outline-variant/30">
                <span className="font-[var(--font-display)] text-[11px] uppercase tracking-wider text-secondary font-semibold block">
                  Exemplum in Context
                </span>
                <blockquote className="text-sm italic text-primary leading-relaxed">
                  “{activeToken.exampleEn}”
                </blockquote>
                {activeToken.exampleAz && (
                  <p className="text-xs text-on-surface-variant">
                    <span className="text-secondary font-semibold mr-1">
                      Tərcümə:
                    </span>
                    {activeToken.exampleAz}
                  </p>
                )}
              </div>
            )}

            {/* Etymology */}
            {activeToken.etymology && (
              <div className="bg-surface-container-high/60 p-3 rounded-lg mb-5 flex items-start gap-2.5">
                <Network
                  className="w-4 h-4 text-on-surface-variant mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div className="text-xs">
                  <span className="font-[var(--font-display)] uppercase tracking-wider text-on-surface-variant font-bold block">
                    Origin &amp; Grammar Note
                  </span>
                  <p className="text-on-surface mt-0.5">{activeToken.etymology}</p>
                </div>
              </div>
            )}

            {/* Category Selector (Words / Idioms / Phrasal Verbs) */}
            <div className="mb-4 flex items-center justify-between gap-2 bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant/30">
              <span className="font-[var(--font-display)] text-[10px] uppercase tracking-wider text-on-surface-variant">
                Auto-Route Section:
              </span>
              <div className="flex items-center gap-1">
                {(
                  [
                    { key: 'word', label: '01. Words' },
                    { key: 'idiom', label: '02. Idioms' },
                    { key: 'phrasal', label: '03. Phrasal' },
                  ] as const
                ).map((cat) => {
                  const selected = (activeToken.category || 'word') === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() =>
                        setActiveToken((prev) => ({
                          ...prev,
                          category: cat.key,
                        }))
                      }
                      className={`px-2 py-0.5 rounded text-[11px] font-[var(--font-display)] cursor-pointer transition-colors ${
                        selected
                          ? 'bg-secondary text-on-secondary font-semibold'
                          : 'bg-surface-container text-on-surface-variant hover:text-primary'
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onToggleDifficult({
                    id: activeId,
                    term: activeToken.term || activeToken.text,
                    category: activeToken.category || 'word',
                    badge: activeToken.badge || 'Story Vocabulary',
                    ipa: activeToken.ipa || '/—/',
                    azTranslation:
                      activeToken.azTranslation || 'Saved from Reader',
                    definition:
                      activeToken.definition || 'Saved from Story & Article Mode.',
                    exampleEn:
                      activeToken.exampleEn ||
                      `Encountered in “${currentWork?.title ?? customTitle}”.`,
                    exampleAz: activeToken.exampleAz,
                    etymologyNote: activeToken.etymology,
                  })
                }
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded font-[var(--font-display)] text-sm tracking-wider transition-colors cursor-pointer ${
                  isSaved
                    ? 'bg-secondary text-on-secondary font-semibold'
                    : 'bg-primary hover:bg-primary-container text-on-primary'
                }`}
              >
                <Star className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
                <span>
                  {isSaved ? 'Saved in Difficult Words' : '+ Mark as Difficult Word'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleCopyGloss}
                title="Copy word and Azerbaijani translation"
                className="w-10 h-10 flex items-center justify-center rounded bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors cursor-pointer shrink-0"
              >
                {copiedId ? (
                  <Check className="w-4 h-4 text-tertiary-container" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>

            {isSaved && (
              <p className="mt-2.5 text-[11px] text-secondary font-[var(--font-display)] text-center">
                Synced to{' '}
                {(activeToken.category || 'word') === 'idiom'
                  ? '02. Idioms'
                  : (activeToken.category || 'word') === 'phrasal'
                    ? '03. Phrasal Verbs'
                    : '01. Words'}
                , 04. Difficult Words &amp; 06. Film Episodes
              </p>
            )}
          </div>

          {/* Collapsible Chapter Vocabulary Index */}
          {!isCustomMode && workGlossary.length > 0 && (
            <div className="bg-surface-container-low rounded-xl border border-outline-variant/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowGlossaryDrawer((o) => !o)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-surface-container transition-colors cursor-pointer"
              >
                <div>
                  <span className="font-[var(--font-display)] text-xs uppercase tracking-wider font-semibold text-primary block">
                    Annotated Words in This Text
                  </span>
                  <span className="text-xs text-on-surface-variant tabular-nums">
                    {workGlossary.length} interactive terms highlighted
                  </span>
                </div>
                {showGlossaryDrawer ? (
                  <ChevronUp className="w-4 h-4 text-on-surface-variant" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-on-surface-variant" />
                )}
              </button>

              {showGlossaryDrawer && (
                <div className="px-4 pb-4 pt-1 flex flex-wrap gap-1.5 border-t border-outline-variant/30">
                  {workGlossary.map((tok) => {
                    const isActive =
                      activeToken.term?.toLowerCase() === tok.term?.toLowerCase();
                    return (
                      <button
                        key={tok.term}
                        type="button"
                        onClick={() => setActiveToken(tok)}
                        className={`px-2.5 py-1 rounded text-xs font-[var(--font-display)] transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-secondary text-on-secondary font-semibold'
                            : 'bg-surface-container text-primary hover:bg-secondary-fixed'
                        }`}
                      >
                        {tok.term}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* RIGHT COLUMN: Story / Article Reading Sheet (7 cols) */}
        <section
          className={`lg:col-span-7 rounded-xl p-6 sm:p-10 border border-outline-variant/50 shadow-sm transition-colors ${paperClasses[paperTone]}`}
        >
          {isCustomMode ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-outline-variant/40">
                <div>
                  <span className="font-[var(--font-display)] text-xs uppercase tracking-[0.2em] text-secondary font-semibold block">
                    Personal Document &amp; Article Reader
                  </span>
                  <span className="text-xs text-on-surface-variant italic">
                    Upload PDF, DOCX, TXT, MD, RTF, HTML or paste any text — click any word to translate
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRawEditor((v) => !v)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-primary text-xs font-[var(--font-display)] uppercase tracking-wider cursor-pointer transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5 text-secondary" />
                  <span>{showRawEditor ? 'Hide Text Editor' : 'Edit / Paste Text'}</span>
                </button>
              </div>

              {/* Document Upload Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingDoc(true);
                }}
                onDragLeave={() => setIsDraggingDoc(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingDoc(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) void processUploadedFile(dropped);
                }}
                className={`rounded-xl border border-dashed p-4 transition-colors ${
                  isDraggingDoc
                    ? 'border-secondary bg-secondary-fixed/30'
                    : 'border-outline-variant/60 bg-surface-container-low/70'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                      {isExtractingDoc ? (
                        <Loader2 className="w-4 h-4 text-secondary animate-spin" />
                      ) : (
                        <FileUp className="w-4 h-4 text-secondary" />
                      )}
                    </div>
                    <div>
                      <p className="font-[var(--font-display)] text-sm font-semibold text-primary">
                        {isExtractingDoc
                          ? 'Extracting readable text from document...'
                          : 'Add a document to read word-by-word'}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        Supports PDF, DOCX, TXT, MD, RTF, CSV, HTML (up to 20 MB)
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isExtractingDoc}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-[var(--font-display)] uppercase tracking-wider font-semibold cursor-pointer disabled:opacity-60 shrink-0"
                  >
                    {isExtractingDoc ? 'Processing...' : 'Choose File'}
                  </button>
                </div>

                {docUploadError && (
                  <p className="mt-3 text-xs text-secondary bg-secondary-fixed/40 px-3 py-2 rounded border border-secondary/30">
                    {docUploadError}
                  </p>
                )}

                {/* Saved Uploaded Documents Shelf */}
                {uploadedDocs.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-outline-variant/30">
                    <span className="font-[var(--font-display)] text-[11px] uppercase tracking-wider text-on-surface-variant block mb-2">
                      Uploaded Documents ({uploadedDocs.length})
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {uploadedDocs.map((doc) => {
                        const isActive = doc.id === activeDocId;
                        return (
                          <div
                            key={doc.id}
                            className={`flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg border text-xs transition-colors ${
                              isActive
                                ? 'bg-secondary text-on-secondary border-secondary'
                                : 'bg-surface-container-lowest text-primary border-outline-variant/50 hover:border-secondary/60'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectUploadedDoc(doc)}
                              className="flex items-center gap-1.5 text-left cursor-pointer"
                            >
                              <span
                                className={`font-[var(--font-display)] text-[10px] uppercase px-1.5 py-0.5 rounded font-semibold ${
                                  isActive
                                    ? 'bg-on-secondary/20 text-on-secondary'
                                    : 'bg-surface-container text-secondary'
                                }`}
                              >
                                {doc.format}
                              </span>
                              <span className="font-[var(--font-display)] font-medium max-w-[160px] truncate">
                                {doc.title}
                              </span>
                              <span
                                className={`text-[11px] tabular-nums ${
                                  isActive
                                    ? 'text-on-secondary/80'
                                    : 'text-on-surface-variant'
                                }`}
                              >
                                ({doc.wordCount.toLocaleString()}w
                                {doc.pageCount ? ` · ${doc.pageCount}p` : ''})
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteUploadedDoc(doc.id)}
                              title={`Delete ${doc.title}`}
                              aria-label={`Delete ${doc.title}`}
                              className={`p-1 rounded transition-colors cursor-pointer ${
                                isActive
                                  ? 'hover:bg-on-secondary/20 text-on-secondary'
                                  : 'hover:bg-surface-container text-on-surface-variant hover:text-secondary'
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {showRawEditor && (
                <div className="space-y-3 bg-surface-container-low/60 p-4 rounded-xl border border-outline-variant/40">
                  <div className="space-y-1.5">
                    <label className="block font-[var(--font-display)] text-xs uppercase tracking-wider text-on-surface-variant">
                      Document Title
                    </label>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => {
                        setActiveDocId(null);
                        setCustomTitle(e.target.value);
                      }}
                      className="w-full px-3 py-2 rounded bg-surface-container-lowest text-primary font-[var(--font-display)] text-lg border border-outline-variant/40 focus:outline-none focus:border-secondary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-[var(--font-display)] text-xs uppercase tracking-wider text-on-surface-variant">
                      Paste or Edit English Text
                    </label>
                    <textarea
                      rows={5}
                      value={customText}
                      onChange={(e) => {
                        setActiveDocId(null);
                        setCustomText(e.target.value);
                      }}
                      className="w-full p-3 rounded bg-surface-container-lowest text-sm text-primary border border-outline-variant/40 focus:outline-none focus:border-secondary leading-relaxed"
                    />
                  </div>
                </div>
              )}

              <div className="pt-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 mb-4 border-b border-outline-variant/30">
                  <div>
                    <h2 className="font-[var(--font-display)] text-2xl sm:text-3xl text-primary tracking-tight">
                      {customTitle || 'Untitled Document'}
                    </h2>
                    <p className="text-xs text-on-surface-variant italic mt-0.5">
                      {activeUploadedDoc
                        ? `${activeUploadedDoc.format} · ${activeUploadedDoc.wordCount.toLocaleString()} words${activeUploadedDoc.pageCount ? ` · ${activeUploadedDoc.pageCount} pages` : ''}`
                        : 'Interactive reading view'}{' '}
                      — Click any word to view Azerbaijani translation &amp; save
                    </p>
                  </div>
                  {activeUploadedDoc?.truncated && (
                    <span className="text-[11px] text-secondary font-[var(--font-display)] uppercase tracking-wider">
                      Excerpt (first 2,500,000 chars)
                    </span>
                  )}
                </div>

                {docPages.length > 1 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-outline-variant/25 text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={showAllDocPages || safeDocPageIndex <= 0}
                        onClick={() =>
                          setDocPageIndex((p) => Math.max(0, p - 1))
                        }
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-primary disabled:opacity-40 cursor-pointer font-[var(--font-display)] uppercase tracking-wider"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Prev</span>
                      </button>
                      <span className="font-[var(--font-display)] text-primary tabular-nums px-1">
                        {showAllDocPages
                          ? `Showing all ${docParagraphs.length} paragraphs`
                          : `Section ${safeDocPageIndex + 1} of ${docPages.length}`}
                      </span>
                      <button
                        type="button"
                        disabled={
                          showAllDocPages || safeDocPageIndex >= docPages.length - 1
                        }
                        onClick={() =>
                          setDocPageIndex((p) =>
                            Math.min(docPages.length - 1, p + 1)
                          )
                        }
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-primary disabled:opacity-40 cursor-pointer font-[var(--font-display)] uppercase tracking-wider"
                      >
                        <span>Next</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAllDocPages((v) => !v)}
                      className="px-2.5 py-1 rounded bg-surface-container-low hover:bg-surface-container border border-outline-variant/40 text-secondary font-[var(--font-display)] uppercase tracking-wider cursor-pointer"
                    >
                      {showAllDocPages ? 'Paginate View' : 'Show Full Text'}
                    </button>
                  </div>
                )}

                <div
                  onMouseUp={handleTextSelectionPhrase}
                  className={`space-y-4 ${fontSizeClasses}`}
                >
                  {visibleDocParagraphs.map((para, pIdx) => (
                    <p key={`${safeDocPageIndex}-${pIdx}`} className="leading-relaxed">
                      {para
                        .split(/([\p{L}]+(?:['’-][\p{L}]+)*)/gu)
                        .map((part, wIdx) => {
                          if (!/^[\p{L}]+(?:['’-][\p{L}]+)*$/u.test(part)) {
                            return (
                              <React.Fragment key={`${pIdx}-${wIdx}`}>
                                {part}
                              </React.Fragment>
                            );
                          }
                          const cleaned = part
                            .replace(/[^\p{L}'’-]/gu, '')
                            .toLowerCase();
                          const matchedWord = lexiconWordMap.get(cleaned);
                          const isSelected =
                            activeToken.term?.toLowerCase() === cleaned;
                          const isMarkedDifficult =
                            difficultIds.has(`story-word-${cleaned}`) ||
                            difficultIds.has(`story-idiom-${cleaned}`) ||
                            difficultIds.has(`story-phrasal-${cleaned}`) ||
                            (matchedWord
                              ? difficultIds.has(matchedWord.id)
                              : false);
                          return (
                            <button
                              key={`${pIdx}-${wIdx}`}
                              type="button"
                              onClick={() => handleAnyWordClick(part, para)}
                              className={`inline rounded transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-secondary-fixed text-on-secondary-fixed font-semibold px-0.5'
                                  : isMarkedDifficult
                                    ? 'underline decoration-secondary/70 decoration-dotted underline-offset-4 hover:bg-secondary-fixed/60'
                                    : matchedWord
                                      ? 'bg-surface-container-high hover:bg-secondary-fixed font-medium px-0.5'
                                      : 'hover:bg-secondary-fixed/50'
                              }`}
                            >
                              {part}
                            </button>
                          );
                        })}
                    </p>
                  ))}
                </div>

                {docPages.length > 1 && !showAllDocPages && (
                  <div className="flex items-center justify-between pt-5 mt-6 border-t border-outline-variant/30 text-xs">
                    <button
                      type="button"
                      disabled={safeDocPageIndex <= 0}
                      onClick={() => setDocPageIndex((p) => Math.max(0, p - 1))}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-primary disabled:opacity-40 cursor-pointer font-[var(--font-display)] uppercase tracking-wider"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Previous Section</span>
                    </button>
                    <span className="font-[var(--font-display)] italic text-on-surface-variant tabular-nums">
                      Section {safeDocPageIndex + 1} of {docPages.length}
                    </span>
                    <button
                      type="button"
                      disabled={safeDocPageIndex >= docPages.length - 1}
                      onClick={() =>
                        setDocPageIndex((p) =>
                          Math.min(docPages.length - 1, p + 1)
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-primary disabled:opacity-40 cursor-pointer font-[var(--font-display)] uppercase tracking-wider"
                    >
                      <span>Next Section</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            currentWork && (
              <>
                {/* Top Folio Line */}
                <div className="flex items-center justify-between pb-4 mb-5 border-b border-outline-variant/30 text-xs text-on-surface-variant">
                  <span className="font-[var(--font-display)] tracking-[0.16em] uppercase">
                    {currentWork.tomeLabel} · {currentWork.levelBadge}
                  </span>
                  <span className="text-secondary select-none" aria-hidden="true">
                    ❧ ❦ ☙
                  </span>
                  <span className="font-[var(--font-display)] italic">
                    {currentWork.folioLabel} · {currentWork.readingTime}
                  </span>
                </div>

                {/* Title Headpiece */}
                <div className="text-center py-2 mb-6">
                  <span className="font-[var(--font-display)] text-xs uppercase tracking-[0.22em] text-secondary font-semibold block mb-1">
                    {currentWork.chapterLabel}
                  </span>
                  <h1 className="font-[var(--font-display)] text-3xl sm:text-[42px] text-primary tracking-tight leading-tight [text-wrap:balance]">
                    {currentWork.title}
                  </h1>
                  <p className="text-xs text-on-surface-variant italic mt-1">
                    {currentWork.subtitle} · Click any word in the text to translate &amp; save
                  </p>
                  <div className="w-20 h-px bg-secondary/40 mx-auto mt-4" />
                </div>

                {/* Prose Body */}
                <article
                  onMouseUp={handleTextSelectionPhrase}
                  className={`space-y-5 text-justify ${fontSizeClasses}`}
                >
                  {currentWork.paragraphs.map((para, pIdx) => (
                    <div key={pIdx} className="space-y-2">
                      <p
                        className={
                          pIdx === 0
                            ? 'first-letter:float-left first-letter:text-5xl sm:first-letter:text-6xl first-letter:leading-[0.85] first-letter:pr-3 first-letter:pt-1 first-letter:font-[var(--font-display)] first-letter:text-secondary'
                            : ''
                        }
                      >
                        {para.tokens.map((tok, tIdx) => {
                          const paragraphContext = para.tokens
                            .map((t) => t.text)
                            .join('')
                            .slice(0, 220);

                          if (!tok.term) {
                            return tok.text
                              .split(/([a-zA-Z]+(?:['’-][a-zA-Z]+)*)/g)
                              .map((part, wIdx) => {
                                if (
                                  !/^[a-zA-Z]+(?:['’-][a-zA-Z]+)*$/.test(part)
                                ) {
                                  return (
                                    <React.Fragment key={`${tIdx}-${wIdx}`}>
                                      {part}
                                    </React.Fragment>
                                  );
                                }
                                const cleaned = part
                                  .replace(/[^a-zA-Z'-]/g, '')
                                  .toLowerCase();
                                const isCurrent =
                                  activeToken.term?.toLowerCase() === cleaned;
                                const matchedWord = allWords.find(
                                  (w) => w.term.toLowerCase() === cleaned
                                );
                                const isMarkedDifficult =
                                  difficultIds.has(`story-word-${cleaned}`) ||
                                  (matchedWord
                                    ? difficultIds.has(matchedWord.id)
                                    : false);
                                return (
                                  <button
                                    key={`${tIdx}-${wIdx}`}
                                    type="button"
                                    onClick={() =>
                                      handleAnyWordClick(part, paragraphContext)
                                    }
                                    className={`inline rounded transition-colors cursor-pointer ${
                                      isCurrent
                                        ? 'bg-secondary-fixed text-on-secondary-fixed font-semibold px-0.5'
                                        : isMarkedDifficult
                                          ? 'underline decoration-secondary/70 decoration-dotted underline-offset-4 hover:bg-secondary-fixed/60'
                                          : 'hover:bg-secondary-fixed/45'
                                    }`}
                                  >
                                    {part}
                                  </button>
                                );
                              });
                          }
                          const isCurrent =
                            activeToken.term?.toLowerCase() ===
                            tok.term.toLowerCase();
                          return (
                            <button
                              key={tIdx}
                              type="button"
                              onClick={() => {
                                setTranslateError(null);
                                setCustomAzNote('');
                                setActiveToken(tok);
                              }}
                              title={`Az: ${tok.azTranslation}`}
                              className={`inline px-1.5 py-0.5 rounded transition-colors cursor-pointer font-medium ${
                                isCurrent
                                  ? 'bg-secondary-fixed text-on-secondary-fixed font-semibold'
                                  : 'bg-surface-container-high hover:bg-secondary-fixed/70 text-primary'
                              }`}
                            >
                              {tok.text}
                            </button>
                          );
                        })}
                      </p>

                      {showAzSummary && para.azSummary && (
                        <p className="text-sm text-on-surface-variant bg-surface-container-low/80 p-3 rounded-lg italic border border-outline-variant/30 text-left">
                          <span className="font-[var(--font-display)] not-italic text-[11px] uppercase tracking-wider text-secondary font-semibold mr-2">
                            Az Xülasə:
                          </span>
                          {para.azSummary}
                        </p>
                      )}

                      {/* Optional Copperplate Engraving after paragraph 2 */}
                      {pIdx === 1 &&
                        currentWork.illustrationUrl &&
                        !brokenImages.has(currentWork.id) && (
                          <figure className="my-7 mx-auto max-w-md bg-surface-container-low p-3 rounded-lg border border-outline-variant/40 text-left">
                            <div className="relative w-full h-52 bg-surface-container rounded overflow-hidden">
                              <img
                                src={currentWork.illustrationUrl}
                                alt={
                                  currentWork.illustrationAlt || currentWork.title
                                }
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setBrokenImages((prev) =>
                                    new Set(prev).add(currentWork.id)
                                  )
                                }
                                className="w-full h-full object-cover grayscale contrast-115"
                              />
                            </div>
                            <figcaption className="mt-2.5 text-center">
                              <span className="font-[var(--font-display)] text-sm italic text-primary block">
                                {currentWork.illustrationCaption}
                              </span>
                              <span className="font-[var(--font-display)] text-[10px] text-on-surface-variant uppercase tracking-widest">
                                {currentWork.illustrationSubcaption}
                              </span>
                            </figcaption>
                          </figure>
                        )}
                    </div>
                  ))}
                </article>

                {/* Fleuron Tailpiece */}
                <div
                  className="w-full flex items-center justify-center my-7 text-secondary select-none"
                  aria-hidden="true"
                >
                  <span className="font-[var(--font-display)] text-base tracking-[0.8em]">
                    ❖ ❦ ❖
                  </span>
                </div>

                {/* Bottom Work Navigation */}
                <div className="pt-4 border-t border-outline-variant/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-on-surface-variant">
                  <button
                    type="button"
                    disabled={currentWorkIndex <= 0}
                    onClick={() => {
                      if (currentWorkIndex > 0) {
                        handleSelectWork(visibleWorks[currentWorkIndex - 1]);
                      }
                    }}
                    className="flex items-center gap-1.5 hover:text-primary disabled:opacity-40 cursor-pointer disabled:cursor-default text-xs font-[var(--font-display)] uppercase tracking-wider"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>
                      {currentWorkIndex > 0
                        ? visibleWorks[currentWorkIndex - 1].title
                        : 'First Work'}
                    </span>
                  </button>

                  <div className="flex items-center gap-2 bg-surface-container px-3 py-1 rounded text-xs">
                    <BookOpen className="w-3.5 h-3.5 text-secondary" />
                    <span className="font-[var(--font-display)] italic text-primary tabular-nums">
                      Work {currentWorkIndex + 1} of {visibleWorks.length}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={currentWorkIndex >= visibleWorks.length - 1}
                    onClick={() => {
                      if (currentWorkIndex < visibleWorks.length - 1) {
                        handleSelectWork(visibleWorks[currentWorkIndex + 1]);
                      }
                    }}
                    className="flex items-center gap-1.5 hover:text-primary disabled:opacity-40 cursor-pointer disabled:cursor-default text-xs font-[var(--font-display)] uppercase tracking-wider"
                  >
                    <span>
                      {currentWorkIndex < visibleWorks.length - 1
                        ? visibleWorks[currentWorkIndex + 1].title
                        : 'Final Work'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )
          )}
        </section>
      </div>
    </div>
  );
};
