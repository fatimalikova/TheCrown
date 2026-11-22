import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  PenLine,
  Search,
  Volume2,
  X,
} from 'lucide-react';
import {
  CefrGroup,
  CefrLevel,
  DifficultItem,
  WordEntry,
} from '../types/lexicon';
import { speakEnglish } from '../utils/speech';

interface WordsSectionProps {
  words: WordEntry[];
  onAddWord: (word: WordEntry) => void;
  difficultIds: Set<string>;
  onToggleDifficult: (item: Omit<DifficultItem, 'addedAt'>) => void;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const PAGE_SIZE = 6;

export const WordsSection: React.FC<WordsSectionProps> = ({
  words,
  onAddWord,
  difficultIds,
  onToggleDifficult,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [levelGroup, setLevelGroup] = useState<CefrGroup>('all');
  const [exactLevel, setExactLevel] = useState<CefrLevel | 'all'>('all');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  // Personal Ledger form state
  const [lemmaInput, setLemmaInput] = useState('');
  const [ipaInput, setIpaInput] = useState('');
  const [cefrInput, setCefrInput] = useState<CefrLevel>('B2');
  const [posInput, setPosInput] = useState('Adjective');
  const [originInput, setOriginInput] = useState('');
  const [azeriInput, setAzeriInput] = useState('');
  const [definitionInput, setDefinitionInput] = useState('');
  const [exampleInput, setExampleInput] = useState('');
  const [exampleAzInput, setExampleAzInput] = useState('');
  const [ledgerSavedMsg, setLedgerSavedMsg] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const groupCounts = useMemo(() => {
    const a1a2 = words.filter((w) => w.level === 'A1' || w.level === 'A2').length;
    const b1b2 = words.filter((w) => w.level === 'B1' || w.level === 'B2').length;
    const c1c2 = words.filter((w) => w.level === 'C1' || w.level === 'C2').length;
    return { all: words.length, a1a2, b1b2, c1c2 };
  }, [words]);

  const availableLetters = useMemo(() => {
    const set = new Set<string>();
    words.forEach((w) => {
      const first = w.term.trim().charAt(0).toUpperCase();
      if (first) set.add(first);
    });
    return set;
  }, [words]);

  const filteredWords = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return words.filter((word) => {
      if (levelGroup === 'A1-A2' && word.level !== 'A1' && word.level !== 'A2') {
        return false;
      }
      if (levelGroup === 'B1-B2' && word.level !== 'B1' && word.level !== 'B2') {
        return false;
      }
      if (levelGroup === 'C1-C2' && word.level !== 'C1' && word.level !== 'C2') {
        return false;
      }
      if (exactLevel !== 'all' && word.level !== exactLevel) {
        return false;
      }
      if (
        selectedLetter &&
        word.term.trim().charAt(0).toUpperCase() !== selectedLetter
      ) {
        return false;
      }
      if (q) {
        const hay =
          `${word.term} ${word.azTranslation} ${word.definition} ${word.etymology} ${word.exampleEn} ${word.exampleAz}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [words, levelGroup, exactLevel, selectedLetter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredWords.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedWords = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredWords.slice(start, start + PAGE_SIZE);
  }, [filteredWords, safePage]);

  const handleGroupChange = (group: CefrGroup) => {
    setLevelGroup(group);
    setExactLevel('all');
    setCurrentPage(1);
  };

  const handleSpeak = (id: string, term: string) => {
    setSpeakingId(id);
    speakEnglish(term, () => setSpeakingId(null));
    setTimeout(() => setSpeakingId((prev) => (prev === id ? null : prev)), 1200);
  };

  const handleLedgerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTerm = lemmaInput.trim();
    const cleanAz = azeriInput.trim();
    if (!cleanTerm || !cleanAz) return;

    const newWord: WordEntry = {
      id: `custom-word-${Date.now()}`,
      category: 'word',
      term: cleanTerm,
      ipa: ipaInput.trim() || `/${cleanTerm.toLowerCase()}/`,
      level: cefrInput,
      partOfSpeech: posInput,
      etymology: originInput.trim() || 'Personal archival entry',
      azTranslation: cleanAz,
      definition:
        definitionInput.trim() ||
        `Custom vocabulary entry recorded for ${cefrInput} mastery.`,
      exampleEn:
        exampleInput.trim() ||
        `The scholar carefully noted “${cleanTerm}” in her personal notebook.`,
      exampleAz:
        exampleAzInput.trim() ||
        `Tələbə “${cleanTerm}” sözünü şəxsi dəftərinə qeyd etdi.`,
      relationLabel: 'Collocations',
      relatedTerms: [cefrInput, posInput.toLowerCase()],
      folioRef: `Personal · #${words.length + 1}`,
      isCustom: true,
    };

    onAddWord(newWord);
    setLemmaInput('');
    setIpaInput('');
    setOriginInput('');
    setAzeriInput('');
    setDefinitionInput('');
    setExampleInput('');
    setExampleAzInput('');
    setSelectedLetter(null);
    setLevelGroup('all');
    setExactLevel('all');
    setSearchQuery('');
    setCurrentPage(1);
    setLedgerSavedMsg(true);
    setTimeout(() => setLedgerSavedMsg(false), 3000);
  };

  const pctA = Math.round((groupCounts.a1a2 / Math.max(1, groupCounts.all)) * 100);
  const pctB = Math.round((groupCounts.b1b2 / Math.max(1, groupCounts.all)) * 100);
  const pctC = Math.max(0, 100 - pctA - pctB);

  const getLevelBadgeClasses = (level: CefrLevel) => {
    if (level === 'A1' || level === 'A2') {
      return 'bg-surface-container-highest text-primary';
    }
    if (level === 'B1' || level === 'B2') {
      return 'bg-secondary-fixed text-on-secondary-fixed';
    }
    return 'bg-tertiary-container text-tertiary-fixed';
  };

  return (
    <div className="w-full max-w-[1160px] mx-auto px-4 sm:px-8 pt-6 pb-16">
      {/* Editorial Title Banner */}
      <section className="relative w-full text-center pb-6 mb-6 border-b border-outline-variant/40">
        <p className="font-[var(--font-display)] text-xs uppercase tracking-[0.22em] text-on-surface-variant mb-1">
          The Crown · Archival Codex · Tome I
        </p>
        <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl text-primary tracking-tight font-normal [text-wrap:balance]">
          Part I · The Classical Lexicon (A1–C2)
        </h1>
        <p className="font-[var(--font-body)] text-base sm:text-lg text-on-surface-variant max-w-2xl mx-auto italic mt-2">
          Curated English vocabulary from A1 foundations to C2 literary mastery, annotated with etymological roots, example sentences, and Azerbaijani translations.
        </p>
        <div
          className="flex items-center justify-center gap-4 mt-4 text-secondary/70 text-xs select-none"
          aria-hidden="true"
        >
          <span>❧</span>
          <span className="w-14 h-px bg-outline-variant/60" />
          <span>❦</span>
          <span className="w-14 h-px bg-outline-variant/60" />
          <span>☙</span>
        </div>
      </section>

      {/* Search & CEFR Filter Controls */}
      <section className="bg-surface-container-low rounded-xl p-4 sm:p-5 border border-outline-variant/40 mb-7">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-outline absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search word, etymon, or Azerbaijani translation (e.g. bəlağətli, calm)..."
              aria-label="Search words"
              className="w-full pl-10 pr-16 py-2.5 rounded-lg bg-surface-container-lowest text-on-surface placeholder:text-outline/70 text-sm border border-outline-variant/50 focus:outline-none focus:border-secondary transition-colors"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-primary p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <span className="hidden sm:inline-block absolute right-3 top-1/2 -translate-y-1/2 font-[var(--font-display)] text-[11px] bg-surface-container-high px-1.5 py-0.5 rounded text-on-surface-variant/70 pointer-events-none">
                ⌘K
              </span>
            )}
          </div>

          {/* CEFR Register Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { key: 'all', label: 'All Levels', count: groupCounts.all },
                { key: 'A1-A2', label: 'A1–A2 Primer', count: groupCounts.a1a2 },
                { key: 'B1-B2', label: 'B1–B2 Scholar', count: groupCounts.b1b2 },
                { key: 'C1-C2', label: 'C1–C2 Master', count: groupCounts.c1c2 },
              ] as const
            ).map((tab) => {
              const active = levelGroup === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleGroupChange(tab.key)}
                  className={`px-3 py-2 rounded-lg font-[var(--font-display)] text-xs uppercase tracking-wider whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-primary text-on-primary font-semibold'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-primary hover:bg-surface-container-highest'
                  }`}
                >
                  {tab.label}{' '}
                  <span className="ml-1 opacity-75 tabular-nums">({tab.count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Fine CEFR Level Sub-Selector + Alphabetical Index */}
        <div className="mt-4 pt-3 border-t border-outline-variant/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-[var(--font-display)] text-[11px] text-secondary font-semibold uppercase tracking-wider pr-1">
              CEFR:
            </span>
            {(['all', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => {
                  setExactLevel(lvl);
                  if (lvl !== 'all') setLevelGroup('all');
                  setCurrentPage(1);
                }}
                className={`px-2 py-0.5 rounded font-[var(--font-display)] text-xs uppercase transition-colors cursor-pointer ${
                  exactLevel === lvl
                    ? 'bg-secondary text-on-secondary font-semibold'
                    : 'bg-surface-container text-on-surface-variant hover:text-primary'
                }`}
              >
                {lvl === 'all' ? 'All' : lvl}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
            <span className="font-[var(--font-display)] text-[11px] text-secondary font-semibold uppercase pr-2 shrink-0">
              Folio:
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedLetter(null);
                setCurrentPage(1);
              }}
              className={`px-2 py-0.5 rounded font-[var(--font-display)] text-xs uppercase shrink-0 cursor-pointer transition-colors ${
                selectedLetter === null
                  ? 'bg-primary text-on-primary font-semibold'
                  : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
              }`}
            >
              All
            </button>
            {ALPHABET.map((letter) => {
              const hasEntries = availableLetters.has(letter);
              const isSelected = selectedLetter === letter;
              return (
                <button
                  key={letter}
                  type="button"
                  disabled={!hasEntries}
                  onClick={() => {
                    setSelectedLetter(isSelected ? null : letter);
                    setCurrentPage(1);
                  }}
                  className={`px-1.5 py-0.5 rounded font-[var(--font-display)] text-xs shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-secondary text-on-secondary font-bold cursor-pointer'
                      : hasEntries
                        ? 'text-primary font-semibold bg-secondary-fixed/40 hover:bg-secondary-fixed cursor-pointer'
                        : 'text-outline/40 cursor-default'
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Main Compendium Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
        {/* Left Column: Word Entries (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {paginatedWords.length === 0 ? (
            <div className="bg-surface-container-low rounded-xl p-10 text-center border border-outline-variant/40">
              <p className="font-[var(--font-display)] text-2xl text-primary mb-2">
                No matching lexicon entries found
              </p>
              <p className="text-sm text-on-surface-variant mb-4">
                Try clearing your search query or selecting another CEFR level or letter folio.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setLevelGroup('all');
                  setExactLevel('all');
                  setSelectedLetter(null);
                }}
                className="px-4 py-2 rounded bg-primary text-on-primary font-[var(--font-display)] text-xs uppercase tracking-wider cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            paginatedWords.map((word) => {
              const isSaved = difficultIds.has(word.id);
              const isSpeaking = speakingId === word.id;
              return (
                <article
                  key={word.id}
                  className="bg-surface-container-low rounded-xl p-6 sm:p-7 border border-outline-variant/40 transition-shadow hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                        <h2 className="font-[var(--font-display)] text-2xl sm:text-[28px] text-primary tracking-tight font-semibold leading-tight">
                          {word.term}
                        </h2>
                        <span className="text-sm text-on-surface-variant italic">
                          {word.ipa}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSpeak(word.id, word.term)}
                          aria-label={`Listen to pronunciation of ${word.term}`}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                            isSpeaking
                              ? 'bg-secondary text-on-secondary'
                              : 'bg-surface-container-high hover:bg-surface-container-highest text-secondary'
                          }`}
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Clean metadata line */}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                        <span
                          className={`px-2 py-0.5 rounded font-[var(--font-display)] uppercase font-semibold tracking-wider ${getLevelBadgeClasses(
                            word.level
                          )}`}
                        >
                          {word.level} · {word.partOfSpeech}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="italic text-on-tertiary-fixed-variant">
                          {word.etymology}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onToggleDifficult({
                          id: word.id,
                          term: word.term,
                          category: 'word',
                          badge: `${word.level} · ${word.partOfSpeech}`,
                          ipa: word.ipa,
                          azTranslation: word.azTranslation,
                          definition: word.definition,
                          exampleEn: word.exampleEn,
                          exampleAz: word.exampleAz,
                          etymologyNote: word.etymology,
                        })
                      }
                      aria-label={
                        isSaved
                          ? `Remove ${word.term} from Difficult Words`
                          : `Save ${word.term} to Difficult Words`
                      }
                      title={
                        isSaved
                          ? 'Saved in Difficult Words'
                          : 'Save to My Difficult Words'
                      }
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-[var(--font-display)] uppercase tracking-wider shrink-0 transition-colors cursor-pointer ${
                        isSaved
                          ? 'bg-secondary text-on-secondary font-semibold'
                          : 'bg-surface-container-high text-on-surface-variant hover:text-secondary hover:bg-surface-container-highest'
                      }`}
                    >
                      <Bookmark
                        className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`}
                      />
                      <span className="hidden sm:inline">
                        {isSaved ? 'Saved' : 'Mark Difficult'}
                      </span>
                    </button>
                  </div>

                  {/* Azerbaijani Translation Plaque */}
                  <div className="mt-4 p-3 bg-surface-container-highest/65 rounded-lg flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
                    <span className="font-[var(--font-display)] text-[11px] uppercase tracking-wider text-secondary font-bold shrink-0">
                      Azərbaycan Dili:
                    </span>
                    <span className="font-[var(--font-display)] text-lg sm:text-xl text-primary italic">
                      “{word.azTranslation}”
                    </span>
                  </div>

                  {/* English Definition */}
                  <p className="mt-4 text-[15px] text-on-surface leading-relaxed">
                    {word.definition}
                  </p>

                  {/* Literary Example Citation (clean surface container, no thick left stripe) */}
                  <div className="mt-4 p-4 rounded-lg bg-surface-container border border-outline-variant/30">
                    <blockquote className="text-[15px] italic text-primary leading-relaxed">
                      “{word.exampleEn}”
                    </blockquote>
                    <p className="text-sm text-on-surface-variant mt-2">
                      <span className="font-[var(--font-display)] text-xs uppercase tracking-wider text-secondary font-semibold mr-1.5">
                        Tərcümə:
                      </span>
                      «{word.exampleAz}»
                    </p>
                  </div>

                  {/* Footer metadata */}
                  <div className="mt-4 pt-3 border-t border-outline-variant/30 flex flex-wrap items-center justify-between gap-2 text-xs text-on-surface-variant">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-[var(--font-display)] text-secondary font-semibold">
                        {word.relationLabel}:
                      </span>
                      {word.relatedTerms.map((rel, i) => (
                        <span key={rel} className="text-primary">
                          {rel}
                          {i < word.relatedTerms.length - 1 ? ' ·' : ''}
                        </span>
                      ))}
                    </div>
                    <span className="italic text-on-surface-variant/80 tabular-nums">
                      {word.folioRef}
                    </span>
                  </div>
                </article>
              );
            })
          )}

          {/* Pagination Bar */}
          {filteredWords.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 py-3 px-2">
              <div className="font-[var(--font-display)] text-xs uppercase tracking-wider text-on-surface-variant tabular-nums">
                Showing{' '}
                <span className="font-bold text-primary">
                  {(safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, filteredWords.length)}
                </span>{' '}
                of <span className="font-bold text-primary">{filteredWords.length}</span>{' '}
                Entries
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-surface-container-high text-primary font-[var(--font-display)] text-xs uppercase tracking-wider disabled:opacity-40 cursor-pointer disabled:cursor-default hover:bg-surface-container-highest transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <span className="px-2 font-[var(--font-display)] italic text-secondary text-sm tabular-nums">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-surface-container-high text-primary font-[var(--font-display)] text-xs uppercase tracking-wider disabled:opacity-40 cursor-pointer disabled:cursor-default hover:bg-surface-container-highest transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Sidebar Folio Widgets (4 cols) */}
        <aside className="lg:col-span-4 flex flex-col gap-6">
          {/* Visual Accent Card */}
          <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/40">
            <div className="relative w-full h-44 rounded-lg overflow-hidden mb-3 bg-surface-container-high flex items-center justify-center">
              {!imgError ? (
                <img
                  src="/src/assets/images/scholar_desk_lexicon_1795336049106.jpg"
                  alt="An antique leather-bound literary dictionary open upon a mahogany scholar desk beside a brass magnifying glass and dried fern leaves"
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-on-surface-variant p-4 text-center">
                  <BookOpen className="w-8 h-8 text-secondary mb-2" />
                  <span className="font-[var(--font-display)] text-sm">
                    The Crown Archive
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/20 to-transparent flex items-end p-3">
                <span className="font-[var(--font-display)] text-[11px] uppercase tracking-widest text-primary-fixed">
                  Scriptorium Archive
                </span>
              </div>
            </div>
            <h3 className="font-[var(--font-display)] text-xl text-primary font-semibold">
              Philologist’s Vade Mecum
            </h3>
            <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
              Graded A1–C2 vocabulary curated for bilingual mastery, combining etymological roots with natural Azerbaijani equivalents.
            </p>
          </div>

          {/* Lexicon Registry Stats */}
          <div className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/40">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-[var(--font-display)] text-xl text-primary font-semibold">
                Lexicon Registry
              </h3>
              <span className="font-[var(--font-display)] text-xs text-secondary uppercase tracking-widest">
                CEFR A1–C2
              </span>
            </div>

            {/* Dynamic SVG Donut Chart */}
            <div className="flex items-center gap-4 bg-surface-container-lowest p-4 rounded-lg border border-outline-variant/30 mb-4">
              <svg
                className="w-20 h-20 shrink-0 -rotate-90"
                viewBox="0 0 36 36"
                aria-label="Vocabulary distribution across CEFR levels"
              >
                <path
                  className="text-surface-container-highest stroke-current"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  strokeWidth="4.5"
                />
                <path
                  className="text-secondary stroke-current"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  strokeDasharray={`${pctA}, 100`}
                  strokeDashoffset="0"
                  strokeWidth="4.5"
                />
                <path
                  className="text-primary stroke-current"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  strokeDasharray={`${pctB}, 100`}
                  strokeDashoffset={`-${pctA}`}
                  strokeWidth="4.5"
                />
                <path
                  className="text-tertiary-container stroke-current"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  strokeDasharray={`${pctC}, 100`}
                  strokeDashoffset={`-${pctA + pctB}`}
                  strokeWidth="4.5"
                />
              </svg>
              <div className="flex flex-col gap-1.5 w-full text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
                    A1–A2 Primer
                  </span>
                  <span className="font-bold tabular-nums">{groupCounts.a1a2}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                    B1–B2 Scholar
                  </span>
                  <span className="font-bold tabular-nums">{groupCounts.b1b2}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-tertiary-container" />
                    C1–C2 Master
                  </span>
                  <span className="font-bold tabular-nums">{groupCounts.c1c2}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between py-1 text-on-surface-variant">
                <span>Total Catalogued Words:</span>
                <span className="font-[var(--font-display)] font-bold text-primary tabular-nums">
                  {groupCounts.all} entries
                </span>
              </div>
              <div className="flex justify-between py-1 text-on-surface-variant">
                <span>Azerbaijani Translations:</span>
                <span className="font-[var(--font-display)] font-bold text-secondary tabular-nums">
                  100% Bilingual
                </span>
              </div>
              <div className="flex justify-between py-1 text-on-surface-variant">
                <span>Saved in Difficult Ledger:</span>
                <span className="font-[var(--font-display)] font-bold text-primary tabular-nums">
                  {difficultIds.size} items
                </span>
              </div>
            </div>
          </div>

          {/* Personal Ledger: Add Custom Word */}
          <div className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/40">
            <div className="flex items-center gap-2 mb-1 text-primary">
              <PenLine className="w-4 h-4 text-secondary" aria-hidden="true" />
              <h3 className="font-[var(--font-display)] text-xl font-semibold">
                Add New Word
              </h3>
            </div>
            <p className="text-xs text-on-surface-variant mb-4">
              Record a new English word, CEFR level, and Azerbaijani translation directly into your folio.
            </p>

            <form onSubmit={handleLedgerSubmit} className="space-y-3">
              <div>
                <label className="block font-[var(--font-display)] text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">
                  English Word *
                </label>
                <input
                  type="text"
                  required
                  value={lemmaInput}
                  onChange={(e) => setLemmaInput(e.target.value)}
                  placeholder="e.g. Ubiquitous"
                  className="w-full px-3 py-2 rounded bg-surface-container-lowest text-on-surface text-sm border border-outline-variant/50 focus:outline-none focus:border-secondary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-[var(--font-display)] text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">
                    CEFR Level
                  </label>
                  <select
                    value={cefrInput}
                    onChange={(e) => setCefrInput(e.target.value as CefrLevel)}
                    className="w-full px-2.5 py-2 rounded bg-surface-container-lowest text-on-surface text-sm border border-outline-variant/50 focus:outline-none focus:border-secondary"
                  >
                    <option value="A1">A1 Beginner</option>
                    <option value="A2">A2 Elementary</option>
                    <option value="B1">B1 Intermediate</option>
                    <option value="B2">B2 Upper-Int.</option>
                    <option value="C1">C1 Advanced</option>
                    <option value="C2">C2 Mastery</option>
                  </select>
                </div>
                <div>
                  <label className="block font-[var(--font-display)] text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">
                    Part of Speech
                  </label>
                  <select
                    value={posInput}
                    onChange={(e) => setPosInput(e.target.value)}
                    className="w-full px-2.5 py-2 rounded bg-surface-container-lowest text-on-surface text-sm border border-outline-variant/50 focus:outline-none focus:border-secondary"
                  >
                    <option value="Noun">Noun</option>
                    <option value="Verb">Verb</option>
                    <option value="Adjective">Adjective</option>
                    <option value="Adverb">Adverb</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-[var(--font-display)] text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">
                    IPA (Optional)
                  </label>
                  <input
                    type="text"
                    value={ipaInput}
                    onChange={(e) => setIpaInput(e.target.value)}
                    placeholder="/juːˈbɪk.wɪ.təs/"
                    className="w-full px-2.5 py-2 rounded bg-surface-container-lowest text-on-surface text-sm border border-outline-variant/50 focus:outline-none focus:border-secondary"
                  />
                </div>
                <div>
                  <label className="block font-[var(--font-display)] text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">
                    Origin
                  </label>
                  <input
                    type="text"
                    value={originInput}
                    onChange={(e) => setOriginInput(e.target.value)}
                    placeholder="Latin: ubique"
                    className="w-full px-2.5 py-2 rounded bg-surface-container-lowest text-on-surface text-sm border border-outline-variant/50 focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>

              <div>
                <label className="block font-[var(--font-display)] text-[11px] uppercase tracking-wider text-secondary font-semibold mb-1">
                  Azerbaijani Translation *
                </label>
                <input
                  type="text"
                  required
                  value={azeriInput}
                  onChange={(e) => setAzeriInput(e.target.value)}
                  placeholder="e.g. Hər yerdə mövcud olan"
                  className="w-full px-3 py-2 rounded bg-surface-container-lowest text-on-surface text-sm border border-outline-variant/50 focus:outline-none focus:border-secondary"
                />
              </div>

              <div>
                <label className="block font-[var(--font-display)] text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">
                  Example Sentence (Optional)
                </label>
                <textarea
                  rows={2}
                  value={exampleInput}
                  onChange={(e) => setExampleInput(e.target.value)}
                  placeholder="Write an example sentence..."
                  className="w-full px-3 py-2 rounded bg-surface-container-lowest text-on-surface text-sm border border-outline-variant/50 focus:outline-none focus:border-secondary resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded bg-primary hover:bg-primary-container text-on-primary font-[var(--font-display)] text-sm tracking-wider uppercase transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <PenLine className="w-4 h-4" />
                <span>Save to Words</span>
              </button>
            </form>

            {ledgerSavedMsg && (
              <div className="mt-3 p-2.5 rounded bg-tertiary-fixed text-on-tertiary-fixed text-xs flex items-center justify-center gap-1.5 font-medium">
                <Check className="w-4 h-4" />
                <span>Word added to your lexicon.</span>
              </div>
            )}
          </div>

          {/* Literary Quote */}
          <div className="bg-surface-container p-5 rounded-xl text-center border border-outline-variant/30">
            <span className="text-secondary text-sm select-none">❦</span>
            <p className="text-sm text-on-surface italic mt-1 leading-relaxed">
              “Words are things, and a small drop of ink, falling like dew upon a thought, produces that which makes thousands think.”
            </p>
            <span className="block font-[var(--font-display)] text-[11px] uppercase tracking-widest text-on-surface-variant mt-2">
              — Lord Byron · Don Juan
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
};
