import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Languages,
  Network,
  Star,
  Upload,
  Volume2,
} from 'lucide-react';
import {
  DifficultItem,
  ReadingToken,
  ReadingWork,
  WordEntry,
} from '../types/lexicon';
import { speakEnglish } from '../utils/speech';

interface StoryReaderSectionProps {
  works: ReadingWork[];
  allWords: WordEntry[];
  difficultIds: Set<string>;
  onToggleDifficult: (item: Omit<DifficultItem, 'addedAt'>) => void;
}

type ReaderFilter = 'all' | 'story' | 'article';
type PaperTone = 'ivory' | 'parchment' | 'sepia';

export const StoryReaderSection: React.FC<StoryReaderSectionProps> = ({
  works,
  allWords,
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

  // Custom Story / Article paste mode
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customTitle, setCustomTitle] = useState('My Custom Story or Article');
  const [customText, setCustomText] = useState(
    'In an ancient library overlooking the Caspian sea, a curious scholar discovered a luminous manuscript. Although the fragile pages seemed ephemeral, her meticulous notes helped bring about a vivid translation for future readers.'
  );
  const [customAzNote, setCustomAzNote] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleCustomWordClick = (rawWord: string) => {
    const cleaned = rawWord.replace(/[^a-zA-Z'-]/g, '').trim();
    if (!cleaned) return;
    const match = allWords.find(
      (w) => w.term.toLowerCase() === cleaned.toLowerCase()
    );
    if (match) {
      setActiveToken({
        text: rawWord,
        lexiconId: match.id,
        term: match.term,
        badge: `${match.level} · ${match.partOfSpeech}`,
        category: 'word',
        ipa: match.ipa,
        azTranslation: match.azTranslation,
        definition: match.definition,
        exampleEn: match.exampleEn,
        exampleAz: match.exampleAz,
        etymology: match.etymology,
      });
    } else {
      setActiveToken({
        text: rawWord,
        lexiconId: `custom-reader-${cleaned.toLowerCase()}`,
        term: cleaned.charAt(0).toUpperCase() + cleaned.slice(1),
        badge: 'Reader Selection',
        category: 'word',
        ipa: `/${cleaned.toLowerCase()}/`,
        azTranslation:
          customAzNote.trim() || 'Add your Azerbaijani note below & save',
        definition: `Selected directly from “${customTitle}”. Save it to My Difficult Words to practice it in quizzes.`,
        exampleEn: customText.slice(0, 140) + (customText.length > 140 ? '…' : ''),
        etymology: 'Extracted from custom Story/Article reader.',
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomTitle(file.name.replace(/\.[^/.]+$/, ''));
        setCustomText(reader.result);
        setIsCustomMode(true);
      }
    };
    reader.readAsText(file);
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
            <span>{isCustomMode ? 'Back to Library' : 'Paste Text / .txt'}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Upload .txt story or article"
            className="p-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" />
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
                <Languages className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
              </div>
              <p className="font-[var(--font-display)] text-xl text-primary font-semibold">
                {activeToken.azTranslation}
              </p>
              {activeToken.azSubNote && (
                <p className="text-xs text-on-surface-variant italic mt-1">
                  {activeToken.azSubNote}
                </p>
              )}
              {isCustomMode && (
                <input
                  type="text"
                  value={customAzNote}
                  onChange={(e) => {
                    setCustomAzNote(e.target.value);
                    setActiveToken((prev) => ({
                      ...prev,
                      azTranslation:
                        e.target.value.trim() ||
                        'Add your Azerbaijani note below & save',
                    }));
                  }}
                  placeholder="Write custom Azerbaijani translation..."
                  className="mt-2 w-full px-2.5 py-1.5 rounded bg-surface-container-lowest text-xs border border-outline-variant/50 focus:outline-none focus:border-secondary"
                />
              )}
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
              <div className="flex items-center justify-between pb-3 border-b border-outline-variant/40">
                <span className="font-[var(--font-display)] text-xs uppercase tracking-[0.2em] text-secondary font-semibold">
                  Custom Story / Article Reader
                </span>
                <span className="text-xs text-on-surface-variant italic">
                  Click any word below to inspect &amp; save
                </span>
              </div>

              <div className="space-y-2">
                <label className="block font-[var(--font-display)] text-xs uppercase tracking-wider text-on-surface-variant">
                  Title
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-surface-container-low text-primary font-[var(--font-display)] text-xl border border-outline-variant/40 focus:outline-none focus:border-secondary"
                />
              </div>

              <div className="space-y-2">
                <label className="block font-[var(--font-display)] text-xs uppercase tracking-wider text-on-surface-variant">
                  Paste English Story or Article Text
                </label>
                <textarea
                  rows={5}
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  className="w-full p-3 rounded bg-surface-container-low text-sm text-primary border border-outline-variant/40 focus:outline-none focus:border-secondary leading-relaxed"
                />
              </div>

              <div className="pt-3 border-t border-outline-variant/40">
                <span className="font-[var(--font-display)] text-xs uppercase tracking-wider text-secondary font-semibold block mb-3">
                  Interactive Reading View (Click any word)
                </span>
                <div className={`space-y-4 ${fontSizeClasses}`}>
                  {customText.split(/\n+/).map((para, pIdx) => (
                    <p key={pIdx} className="leading-relaxed">
                      {para.split(/(\s+)/).map((part, wIdx) => {
                        if (/^\s+$/.test(part)) return part;
                        const cleaned = part.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
                        const inLexicon = allWords.some(
                          (w) => w.term.toLowerCase() === cleaned
                        );
                        const isSelected =
                          activeToken.term?.toLowerCase() === cleaned;
                        return (
                          <button
                            key={`${pIdx}-${wIdx}`}
                            type="button"
                            onClick={() => handleCustomWordClick(part)}
                            className={`inline rounded px-0.5 transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-secondary-fixed text-on-secondary-fixed font-semibold'
                                : inLexicon
                                  ? 'bg-surface-container-high hover:bg-secondary-fixed font-medium'
                                  : 'hover:bg-surface-container-high'
                            }`}
                          >
                            {part}
                          </button>
                        );
                      })}
                    </p>
                  ))}
                </div>
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
                    {currentWork.subtitle}
                  </p>
                  <div className="w-20 h-px bg-secondary/40 mx-auto mt-4" />
                </div>

                {/* Prose Body */}
                <article className={`space-y-5 text-justify ${fontSizeClasses}`}>
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
                          if (!tok.term) {
                            return <React.Fragment key={tIdx}>{tok.text}</React.Fragment>;
                          }
                          const isCurrent =
                            activeToken.term?.toLowerCase() ===
                            tok.term.toLowerCase();
                          return (
                            <button
                              key={tIdx}
                              type="button"
                              onClick={() => setActiveToken(tok)}
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
