import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Plus,
  RotateCcw,
  Search,
  Volume2,
  X,
  XCircle,
} from 'lucide-react';
import {
  DifficultItem,
  LexiconCategory,
} from '../types/lexicon';
import { speakEnglish } from '../utils/speech';

interface DifficultWordsSectionProps {
  items: DifficultItem[];
  distractorPool: Array<{
    id: string;
    term: string;
    azTranslation: string;
    category: LexiconCategory;
  }>;
  onRemoveItem: (id: string) => void;
  onAddCustomItem: (item: Omit<DifficultItem, 'addedAt'>) => void;
  onMarkMastered: (id: string) => void;
  onResetSampleLedger: () => void;
}

type CategoryFilter = 'all' | LexiconCategory;
type QuizDirection = 'en-to-az' | 'az-to-en';

interface QuizQuestion {
  sourceItem: DifficultItem;
  promptLabel: string;
  promptTerm: string;
  correctOption: string;
  options: string[];
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const DifficultWordsSection: React.FC<DifficultWordsSectionProps> = ({
  items,
  distractorPool,
  onRemoveItem,
  onAddCustomItem,
  onMarkMastered,
  onResetSampleLedger,
}) => {
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [newCategory, setNewCategory] = useState<LexiconCategory>('word');
  const [newAz, setNewAz] = useState('');
  const [newExample, setNewExample] = useState('');
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  // Quiz state
  const [quizDirection, setQuizDirection] = useState<QuizDirection>('en-to-az');
  const [quizSeed, setQuizSeed] = useState(1);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  const counts = useMemo(() => {
    return {
      all: items.length,
      word: items.filter((i) => i.category === 'word').length,
      idiom: items.filter((i) => i.category === 'idiom').length,
      phrasal: items.filter((i) => i.category === 'phrasal').length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      if (filter !== 'all' && item.category !== filter) return false;
      if (q) {
        const hay =
          `${item.term} ${item.azTranslation} ${item.definition} ${item.exampleEn}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, filter, searchQuery]);

  // Generate dynamic quiz questions whenever quizSeed, direction, or items change significantly
  const quizQuestions: QuizQuestion[] = useMemo(() => {
    if (items.length === 0) return [];
    const selected = shuffleArray(items).slice(0, Math.min(5, items.length));

    return selected.map((sourceItem) => {
      const isEnToAz = quizDirection === 'en-to-az';
      const correctOption = isEnToAz
        ? sourceItem.azTranslation
        : sourceItem.term;

      const candidatePool = [
        ...items.map((i) => ({
          id: i.id,
          term: i.term,
          azTranslation: i.azTranslation,
        })),
        ...distractorPool,
      ].filter(
        (cand) =>
          cand.id !== sourceItem.id &&
          (isEnToAz
            ? cand.azTranslation !== correctOption
            : cand.term !== correctOption)
      );

      const uniqueValues: string[] = [];
      for (const cand of shuffleArray(candidatePool)) {
        const val = isEnToAz ? cand.azTranslation : cand.term;
        if (!uniqueValues.includes(val) && val !== correctOption) {
          uniqueValues.push(val);
        }
        if (uniqueValues.length === 3) break;
      }

      const options = shuffleArray([correctOption, ...uniqueValues]);
      return {
        sourceItem,
        promptLabel: isEnToAz
          ? 'What is the Azerbaijani translation of'
          : 'Which English expression matches',
        promptTerm: isEnToAz ? sourceItem.term : sourceItem.azTranslation,
        correctOption,
        options,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizSeed, quizDirection, items.length]);

  useEffect(() => {
    setQuestionIndex(0);
    setSelectedOption(null);
    setSubmitted(false);
    setScore(0);
    setQuizFinished(false);
  }, [quizSeed, quizDirection]);

  const currentQuestion = quizQuestions[questionIndex];

  const handleSubmitAnswer = () => {
    if (!selectedOption || !currentQuestion || submitted) return;
    setSubmitted(true);
    if (selectedOption === currentQuestion.correctOption) {
      setScore((s) => s + 1);
      onMarkMastered(currentQuestion.sourceItem.id);
    }
  };

  const handleNextQuestion = () => {
    if (questionIndex + 1 >= quizQuestions.length) {
      setQuizFinished(true);
    } else {
      setQuestionIndex((i) => i + 1);
      setSelectedOption(null);
      setSubmitted(false);
    }
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTerm.trim() || !newAz.trim()) return;
    const badgeMap: Record<LexiconCategory, string> = {
      word: 'Custom · Word',
      idiom: 'Custom · Idiom',
      phrasal: 'Custom · Phrasal Verb',
    };
    onAddCustomItem({
      id: `difficult-custom-${Date.now()}`,
      term: newTerm.trim(),
      category: newCategory,
      badge: badgeMap[newCategory],
      ipa: `/${newTerm.trim().toLowerCase()}/`,
      azTranslation: newAz.trim(),
      definition: 'Personal difficult expression saved for active practice.',
      exampleEn:
        newExample.trim() ||
        `Remember to practice “${newTerm.trim()}” in context today.`,
      etymologyNote: 'Added directly to My Difficult Words ledger.',
      masteredCount: 0,
    });
    setNewTerm('');
    setNewAz('');
    setNewExample('');
    setShowAddForm(false);
  };

  const handleSpeak = (id: string, term: string) => {
    setSpeakingId(id);
    speakEnglish(term, () => setSpeakingId(null));
    setTimeout(() => setSpeakingId((prev) => (prev === id ? null : prev)), 1200);
  };

  const masteredItems = items.filter((i) => (i.masteredCount ?? 0) > 0).length;
  const retentionPct =
    items.length > 0 ? Math.round((masteredItems / items.length) * 100) : 0;
  const activeReviewCount = items.length - masteredItems;

  return (
    <div className="w-full max-w-[1160px] mx-auto px-4 sm:px-8 pt-6 pb-16 flex flex-col gap-8">
      {/* Archival Heading Banner */}
      <section className="bg-surface-container-low p-6 sm:p-8 rounded-xl border border-outline-variant/40">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-[var(--font-display)] uppercase tracking-widest text-secondary font-semibold">
                Part IV · Archive &amp; Examination
              </span>
              <span className="text-outline-variant" aria-hidden="true">
                ·
              </span>
              <span className="font-[var(--font-display)] italic text-on-surface-variant">
                Fol. 84-B
              </span>
            </div>
            <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl text-primary tracking-tight [text-wrap:balance]">
              My Difficult Words &amp; Quizzing Chamber
            </h1>
            <p className="text-sm sm:text-base text-on-surface-variant">
              Collect challenging words, idioms, and phrasal verbs from any section and test your recall with interactive bilingual quizzes.
            </p>
          </div>

          <div className="flex items-center gap-5 bg-surface-container px-4 py-3 rounded-lg border border-outline-variant/30 self-start md:self-auto">
            <div className="flex flex-col">
              <span className="font-[var(--font-display)] text-[11px] text-on-surface-variant uppercase tracking-wider">
                Entries Saved
              </span>
              <span className="font-[var(--font-display)] text-2xl text-primary font-bold tabular-nums">
                {items.length}
              </span>
            </div>
            <div className="w-px h-8 bg-outline-variant/50" />
            <div className="flex flex-col">
              <span className="font-[var(--font-display)] text-[11px] text-secondary uppercase tracking-wider">
                Retention
              </span>
              <span className="font-[var(--font-display)] text-2xl text-primary italic tabular-nums">
                {retentionPct}%
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2-Column Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
        {/* LEFT COLUMN: Saved Ledger (7 cols) */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          {/* Filter Bar */}
          <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/40 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {(
                  [
                    { key: 'all', label: `All Saved (${counts.all})` },
                    { key: 'word', label: `Words (${counts.word})` },
                    { key: 'idiom', label: `Idioms (${counts.idiom})` },
                    { key: 'phrasal', label: `Phrasals (${counts.phrasal})` },
                  ] as const
                ).map((tab) => {
                  const active = filter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setFilter(tab.key)}
                      className={`px-3 py-1.5 rounded font-[var(--font-display)] text-xs uppercase tracking-wider whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        active
                          ? 'bg-primary text-on-primary font-semibold'
                          : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setShowAddForm((s) => !s)}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-secondary text-on-secondary font-[var(--font-display)] text-xs uppercase tracking-wider hover:opacity-90 transition-opacity cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Term</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search
                className="w-4 h-4 text-outline absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter saved words or Azerbaijani translations..."
                aria-label="Filter difficult words"
                className="w-full pl-9 pr-8 py-2 rounded-lg bg-surface-container-lowest text-sm text-on-surface border border-outline-variant/40 focus:outline-none focus:border-secondary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear filter"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-primary cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Add Form */}
            {showAddForm && (
              <form
                onSubmit={handleQuickAdd}
                className="p-4 rounded-lg bg-surface-container-lowest border border-outline-variant/50 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-[var(--font-display)] text-sm font-semibold text-primary">
                    Add New Difficult Word or Expression
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="text-on-surface-variant hover:text-primary cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    required
                    value={newTerm}
                    onChange={(e) => setNewTerm(e.target.value)}
                    placeholder="English word / phrase *"
                    className="sm:col-span-2 px-3 py-2 rounded bg-surface-container-low text-sm border border-outline-variant/40 focus:outline-none focus:border-secondary"
                  />
                  <select
                    value={newCategory}
                    onChange={(e) =>
                      setNewCategory(e.target.value as LexiconCategory)
                    }
                    className="px-2.5 py-2 rounded bg-surface-container-low text-sm border border-outline-variant/40 focus:outline-none focus:border-secondary"
                  >
                    <option value="word">Word</option>
                    <option value="idiom">Idiom</option>
                    <option value="phrasal">Phrasal Verb</option>
                  </select>
                </div>
                <input
                  type="text"
                  required
                  value={newAz}
                  onChange={(e) => setNewAz(e.target.value)}
                  placeholder="Azerbaijani meaning *"
                  className="w-full px-3 py-2 rounded bg-surface-container-low text-sm border border-outline-variant/40 focus:outline-none focus:border-secondary"
                />
                <input
                  type="text"
                  value={newExample}
                  onChange={(e) => setNewExample(e.target.value)}
                  placeholder="Example sentence (optional)"
                  className="w-full px-3 py-2 rounded bg-surface-container-low text-sm border border-outline-variant/40 focus:outline-none focus:border-secondary"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-1.5 rounded text-xs font-[var(--font-display)] uppercase tracking-wider text-on-surface-variant hover:bg-surface-container cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-primary text-on-primary text-xs font-[var(--font-display)] uppercase tracking-wider cursor-pointer"
                  >
                    Save Entry
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Ledger Entries List */}
          {filteredItems.length === 0 ? (
            <div className="bg-surface-container-lowest p-10 rounded-xl border border-outline-variant/40 text-center">
              <p className="font-[var(--font-display)] text-2xl text-primary mb-2">
                {items.length === 0
                  ? 'Your Difficult Words Ledger is empty'
                  : 'No entries match this filter'}
              </p>
              <p className="text-sm text-on-surface-variant mb-4">
                Bookmark any word, idiom, or phrasal verb across The Crown, or add your own custom entry above.
              </p>
              {items.length === 0 && (
                <button
                  type="button"
                  onClick={onResetSampleLedger}
                  className="px-4 py-2 rounded bg-primary text-on-primary font-[var(--font-display)] text-xs uppercase tracking-wider cursor-pointer"
                >
                  Restore Sample Entries
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredItems.map((item) => {
                const isSpeaking = speakingId === item.id;
                const isMastered = (item.masteredCount ?? 0) > 0;
                return (
                  <article
                    key={item.id}
                    className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/40 flex flex-col gap-2.5 transition-shadow hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-baseline gap-2.5 flex-wrap">
                        <h3 className="font-[var(--font-display)] text-2xl text-primary font-semibold">
                          {item.term}
                        </h3>
                        <span className="bg-surface-container px-2 py-0.5 rounded font-[var(--font-display)] text-[11px] uppercase tracking-wider text-secondary font-semibold">
                          {item.badge}
                        </span>
                        <span className="text-xs text-on-surface-variant italic">
                          {item.ipa}
                        </span>
                        {isMastered && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-[var(--font-display)] uppercase tracking-wider text-on-tertiary-fixed-variant bg-tertiary-fixed px-2 py-0.5 rounded">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Reviewed</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSpeak(item.id, item.term)}
                          aria-label={`Listen to ${item.term}`}
                          className={`p-1.5 rounded transition-colors cursor-pointer ${
                            isSpeaking
                              ? 'bg-secondary text-on-secondary'
                              : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
                          }`}
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.id)}
                          aria-label={`Remove ${item.term} from Difficult Words`}
                          title="Remove from Difficult Words"
                          className="p-1.5 rounded text-on-surface-variant hover:text-error hover:bg-surface-container transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="bg-surface-container-low px-3.5 py-2 rounded-lg flex items-baseline gap-2.5">
                      <span className="font-[var(--font-display)] text-[11px] uppercase tracking-widest text-secondary font-semibold shrink-0">
                        AZ:
                      </span>
                      <p className="font-[var(--font-display)] text-lg text-primary italic">
                        {item.azTranslation}
                      </p>
                    </div>

                    <p className="text-sm text-on-surface leading-relaxed">
                      “{item.exampleEn}”
                    </p>
                    {item.exampleAz && (
                      <p className="text-xs text-on-surface-variant italic">
                        «{item.exampleAz}»
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: Memory Indices & Interactive Quizzing Chamber (5 cols) */}
        <aside className="lg:col-span-5 flex flex-col gap-5 lg:sticky lg:top-24">
          {/* Scholar Memory Indices */}
          <div className="bg-surface-container p-5 rounded-xl border border-outline-variant/40 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-[var(--font-display)] text-xs uppercase tracking-widest text-secondary font-semibold">
                Memory Indices
              </span>
              <Award className="w-4 h-4 text-secondary" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30">
                <span className="font-[var(--font-display)] text-2xl text-primary font-bold tabular-nums block">
                  {retentionPct}%
                </span>
                <span className="font-[var(--font-display)] text-[10px] text-on-surface-variant uppercase tracking-wider leading-tight">
                  Reviewed Rate
                </span>
              </div>
              <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30">
                <span className="font-[var(--font-display)] text-2xl text-secondary font-bold tabular-nums block">
                  {activeReviewCount}
                </span>
                <span className="font-[var(--font-display)] text-[10px] text-on-surface-variant uppercase tracking-wider leading-tight">
                  To Review
                </span>
              </div>
              <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30">
                <span className="font-[var(--font-display)] text-2xl text-primary font-bold tabular-nums block">
                  {masteredItems}
                </span>
                <span className="font-[var(--font-display)] text-[10px] text-on-surface-variant uppercase tracking-wider leading-tight">
                  Practiced
                </span>
              </div>
            </div>

            {/* Recall Velocity Sparkline */}
            <div className="bg-surface-container-low p-3 rounded-lg flex items-center justify-between gap-3">
              <div>
                <span className="font-[var(--font-display)] text-xs text-on-surface-variant block">
                  Active Recall Momentum
                </span>
                <span className="text-xs text-primary font-medium tabular-nums">
                  {items.length} saved expressions ready for testing
                </span>
              </div>
              <svg className="w-24 h-7 text-secondary shrink-0" fill="none" viewBox="0 0 120 30">
                <path
                  d="M2 24 C 20 22, 35 28, 50 16 C 65 5, 80 18, 95 10 C 105 5, 112 8, 118 4"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.2"
                />
                <circle cx="118" cy="4" fill="currentColor" r="3" />
              </svg>
            </div>
          </div>

          {/* Interactive Quizzing Chamber */}
          <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/50 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-secondary">
                <span className="text-xs select-none" aria-hidden="true">
                  ❦
                </span>
                <span className="font-[var(--font-display)] text-xs uppercase tracking-widest font-semibold">
                  Quizzing Chamber
                </span>
              </div>
              {/* Quiz Direction Toggle */}
              <div className="flex items-center bg-surface-container p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setQuizDirection('en-to-az')}
                  className={`px-2 py-1 rounded text-[11px] font-[var(--font-display)] uppercase cursor-pointer ${
                    quizDirection === 'en-to-az'
                      ? 'bg-primary text-on-primary font-semibold'
                      : 'text-on-surface-variant hover:text-primary'
                  }`}
                >
                  EN → AZ
                </button>
                <button
                  type="button"
                  onClick={() => setQuizDirection('az-to-en')}
                  className={`px-2 py-1 rounded text-[11px] font-[var(--font-display)] uppercase cursor-pointer ${
                    quizDirection === 'az-to-en'
                      ? 'bg-primary text-on-primary font-semibold'
                      : 'text-on-surface-variant hover:text-primary'
                  }`}
                >
                  AZ → EN
                </button>
              </div>
            </div>

            {quizQuestions.length === 0 ? (
              <div className="py-8 text-center">
                <p className="font-[var(--font-display)] text-xl text-primary mb-2">
                  No terms available to quiz
                </p>
                <p className="text-xs text-on-surface-variant mb-4">
                  Save at least one word, idiom, or phrasal verb to start an interactive recall test.
                </p>
                <button
                  type="button"
                  onClick={onResetSampleLedger}
                  className="px-4 py-2 rounded bg-primary text-on-primary font-[var(--font-display)] text-xs uppercase tracking-wider cursor-pointer"
                >
                  Load Starter Terms
                </button>
              </div>
            ) : quizFinished ? (
              <div className="py-5 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-tertiary-fixed flex items-center justify-center text-tertiary-container">
                  <Award className="w-7 h-7" />
                </div>
                <div>
                  <span className="font-[var(--font-display)] text-xs uppercase tracking-widest text-secondary font-semibold">
                    Examination Complete
                  </span>
                  <h3 className="font-[var(--font-display)] text-3xl text-primary font-bold mt-1 tabular-nums">
                    {score} / {quizQuestions.length} Correct
                  </h3>
                  <p className="text-sm text-on-surface-variant mt-1">
                    {score === quizQuestions.length
                      ? 'Flawless recall across every tested expression!'
                      : 'Strong progress—review missed terms and test yourself again.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setQuizSeed((s) => s + 1)}
                  className="w-full py-2.5 px-4 rounded bg-primary hover:bg-primary-container text-on-primary font-[var(--font-display)] text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Start New Quiz</span>
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-on-surface-variant">
                  <span className="font-[var(--font-display)] uppercase tracking-wider">
                    Archival Query
                  </span>
                  <span className="bg-surface-container px-2 py-0.5 rounded font-[var(--font-display)] tabular-nums">
                    Question {questionIndex + 1} of {quizQuestions.length}
                  </span>
                </div>

                {/* Question Prompt */}
                <p className="font-[var(--font-display)] text-xl sm:text-2xl text-primary leading-snug">
                  {currentQuestion.promptLabel}{' '}
                  <span className="font-bold underline decoration-secondary-fixed decoration-2 underline-offset-4">
                    “{currentQuestion.promptTerm}”
                  </span>
                  ?
                </p>

                {/* Options */}
                <div className="flex flex-col gap-2.5">
                  {currentQuestion.options.map((opt, idx) => {
                    const letter = ['A', 'B', 'C', 'D'][idx];
                    const isSelected = selectedOption === opt;
                    const isCorrectOpt = opt === currentQuestion.correctOption;

                    let cardClasses =
                      'bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/30';
                    let badgeClasses = 'bg-surface-container-high text-primary';

                    if (!submitted && isSelected) {
                      cardClasses =
                        'bg-secondary-fixed/50 text-primary border border-secondary';
                      badgeClasses = 'bg-secondary text-on-secondary';
                    } else if (submitted && isCorrectOpt) {
                      cardClasses =
                        'bg-tertiary-fixed/40 text-primary border border-tertiary-container/40';
                      badgeClasses = 'bg-tertiary-container text-on-tertiary';
                    } else if (submitted && isSelected && !isCorrectOpt) {
                      cardClasses =
                        'bg-error-container/50 text-on-error-container border border-error/40';
                      badgeClasses = 'bg-error text-on-error';
                    }

                    return (
                      <button
                        key={opt}
                        type="button"
                        disabled={submitted}
                        onClick={() => setSelectedOption(opt)}
                        className={`text-left p-3.5 rounded-lg transition-colors flex items-center justify-between gap-3 cursor-pointer disabled:cursor-default ${cardClasses}`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`w-6 h-6 rounded flex items-center justify-center font-[var(--font-display)] text-xs font-bold shrink-0 ${badgeClasses}`}
                          >
                            {letter}
                          </span>
                          <span className="text-sm font-medium">{opt}</span>
                        </div>
                        {submitted && isCorrectOpt && (
                          <CheckCircle2 className="w-4 h-4 text-tertiary-container shrink-0" />
                        )}
                        {submitted && isSelected && !isCorrectOpt && (
                          <XCircle className="w-4 h-4 text-error shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Feedback Banner */}
                {submitted && (
                  <div
                    className={`px-3.5 py-3 rounded-lg flex items-start gap-2.5 ${
                      selectedOption === currentQuestion.correctOption
                        ? 'bg-tertiary-fixed/40 text-on-tertiary-fixed'
                        : 'bg-error-container/40 text-on-error-container'
                    }`}
                  >
                    {selectedOption === currentQuestion.correctOption ? (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    )}
                    <div className="text-xs">
                      <span className="font-[var(--font-display)] font-bold uppercase tracking-wider block">
                        {selectedOption === currentQuestion.correctOption
                          ? 'Correct Answer'
                          : `Correct Answer: ${currentQuestion.correctOption}`}
                      </span>
                      <p className="mt-0.5 opacity-90">
                        {currentQuestion.sourceItem.etymologyNote ||
                          currentQuestion.sourceItem.definition}
                      </p>
                    </div>
                  </div>
                )}

                {/* Quiz Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={!selectedOption || submitted}
                    onClick={handleSubmitAnswer}
                    className="w-full sm:w-auto px-5 py-2.5 rounded bg-primary text-on-primary font-[var(--font-display)] text-xs uppercase tracking-wider disabled:opacity-40 cursor-pointer disabled:cursor-default hover:bg-primary-container transition-colors"
                  >
                    Check Answer
                  </button>
                  <button
                    type="button"
                    disabled={!submitted}
                    onClick={handleNextQuestion}
                    className="w-full sm:w-auto px-4 py-2.5 rounded bg-surface-container text-primary font-[var(--font-display)] text-xs uppercase tracking-wider hover:bg-surface-container-high disabled:opacity-40 cursor-pointer disabled:cursor-default flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>
                      {questionIndex + 1 >= quizQuestions.length
                        ? 'Finish Quiz'
                        : 'Next Question'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}

            {/* Reset Ledger Footer */}
            <div className="flex items-center justify-between pt-3 mt-1 border-t border-outline-variant/30 text-xs">
              <button
                type="button"
                onClick={() => setQuizSeed((s) => s + 1)}
                className="font-[var(--font-display)] uppercase tracking-wider text-on-surface-variant hover:text-primary cursor-pointer"
              >
                Shuffle Quiz
              </button>
              <button
                type="button"
                onClick={onResetSampleLedger}
                className="font-[var(--font-display)] uppercase tracking-wider text-secondary hover:underline underline-offset-4 cursor-pointer"
              >
                Reset Sample Ledger
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
