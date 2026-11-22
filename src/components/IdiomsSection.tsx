import React, { useMemo, useState } from 'react';
import {
  ArrowDownAZ,
  Bookmark,
  Flag,
  GraduationCap,
  Languages,
  Search,
  Volume2,
  X,
} from 'lucide-react';
import {
  DifficultItem,
  IdiomEntry,
  IdiomRegister,
} from '../types/lexicon';
import { speakEnglish } from '../utils/speech';

interface IdiomsSectionProps {
  idioms: IdiomEntry[];
  difficultIds: Set<string>;
  onToggleDifficult: (item: Omit<DifficultItem, 'addedAt'>) => void;
  onJumpToQuiz: () => void;
}

type IdiomFilter = 'all' | IdiomRegister;

export const IdiomsSection: React.FC<IdiomsSectionProps> = ({
  idioms,
  difficultIds,
  onToggleDifficult,
  onJumpToQuiz,
}) => {
  const [filter, setFilter] = useState<IdiomFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortAlpha, setSortAlpha] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());

  const filteredIdioms = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const list = idioms.filter((item) => {
      if (filter !== 'all' && item.registerGroup !== filter) return false;
      if (savedOnly && !difficultIds.has(item.id)) return false;
      if (q) {
        const hay =
          `${item.term} ${item.azEquivalent} ${item.azNuance} ${item.semanticValue} ${item.exampleEn} ${item.exampleAz}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortAlpha) {
      return [...list].sort((a, b) => a.term.localeCompare(b.term));
    }
    return list;
  }, [idioms, filter, searchQuery, sortAlpha, savedOnly, difficultIds]);

  const handleSpeak = (id: string, term: string) => {
    setSpeakingId(id);
    speakEnglish(term, () => setSpeakingId(null));
    setTimeout(() => setSpeakingId((prev) => (prev === id ? null : prev)), 1200);
  };

  const savedIdiomCount = idioms.filter((i) => difficultIds.has(i.id)).length;
  const academicCount = idioms.filter(
    (i) => i.registerGroup === 'Academic Register'
  ).length;
  const ieltsCount = idioms.filter(
    (i) => i.registerGroup === 'IELTS Band 7.5+'
  ).length;
  const colloquialCount = idioms.filter(
    (i) => i.registerGroup === 'Everyday Colloquial'
  ).length;

  return (
    <div className="w-full max-w-[1160px] mx-auto px-4 sm:px-8 pt-6 pb-16">
      {/* Scholarly Header */}
      <section className="pt-2 pb-6 flex flex-col items-center text-center border-b border-outline-variant/40 mb-6">
        <p className="font-[var(--font-display)] text-xs uppercase tracking-[0.22em] text-on-surface-variant mb-2">
          ❧ The Crown · Fascicle II ☙
        </p>
        <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl text-primary tracking-tight font-normal [text-wrap:balance]">
          Part II · Idiomatic Phrases — Figures of Speech
        </h1>
        <p className="font-[var(--font-body)] text-base sm:text-lg text-on-surface-variant italic mt-2 max-w-2xl">
          Timeless English expressions &amp; scholarly idioms, catalogued with semantic nuances, historical origins, and Azerbaijani equivalents.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-4 text-xs font-[var(--font-display)] uppercase tracking-wider text-on-surface-variant">
          <span className="tabular-nums">{idioms.length} Expressions Curated</span>
          <span aria-hidden="true">·</span>
          <span>IELTS 7.5+ Calibrated</span>
          <span aria-hidden="true">·</span>
          <span>Historical Etymologies</span>
        </div>
      </section>

      {/* Filter & Search Bar */}
      <section className="mb-7 bg-surface-container-low p-4 rounded-xl border border-outline-variant/40">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { key: 'all', label: `All Idioms (${idioms.length})` },
                { key: 'IELTS Band 7.5+', label: 'IELTS Band 7.5+' },
                { key: 'Academic Register', label: 'Academic Register' },
                { key: 'Everyday Colloquial', label: 'Everyday Colloquial' },
              ] as const
            ).map((btn) => {
              const active = filter === btn.key;
              return (
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => setFilter(btn.key)}
                  className={`px-3.5 py-2 rounded-lg font-[var(--font-display)] text-xs uppercase tracking-wider whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-primary text-on-primary font-semibold'
                      : 'bg-surface-container text-on-surface-variant hover:text-primary hover:bg-surface-container-high'
                  }`}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-64">
              <Search
                className="w-4 h-4 text-on-surface-variant/60 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search idiom or Azerbaijani term..."
                aria-label="Search idioms"
                className="w-full bg-surface-container-lowest pl-9 pr-8 py-2 text-sm text-primary placeholder:text-on-surface-variant/60 placeholder:italic rounded-lg border border-outline-variant/50 focus:outline-none focus:border-secondary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-primary cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSortAlpha((s) => !s)}
              title="Sort A–Z"
              aria-pressed={sortAlpha}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                sortAlpha
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant border-outline-variant/40'
              }`}
            >
              <ArrowDownAZ className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setSavedOnly((s) => !s)}
              title="Show Saved Difficult Idioms Only"
              aria-pressed={savedOnly}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                savedOnly
                  ? 'bg-secondary text-on-secondary border-secondary'
                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant border-outline-variant/40'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${savedOnly ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      {/* Idioms 2-Column Folio Grid */}
      {filteredIdioms.length === 0 ? (
        <div className="bg-surface-container-low rounded-xl p-10 text-center border border-outline-variant/40 mb-10">
          <p className="font-[var(--font-display)] text-2xl text-primary mb-2">
            No matching idioms found
          </p>
          <p className="text-sm text-on-surface-variant mb-4">
            Adjust your register filter or clear the search field to inspect all curated expressions.
          </p>
          <button
            type="button"
            onClick={() => {
              setFilter('all');
              setSearchQuery('');
              setSavedOnly(false);
            }}
            className="px-4 py-2 rounded bg-primary text-on-primary font-[var(--font-display)] text-xs uppercase tracking-wider cursor-pointer"
          >
            Show All Idioms
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          {filteredIdioms.map((item) => {
            const isSaved = difficultIds.has(item.id);
            const isSpeaking = speakingId === item.id;
            const showImg = item.imageUrl && !brokenImages.has(item.id);

            return (
              <article
                key={item.id}
                className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/40 flex flex-col justify-between transition-shadow hover:shadow-sm"
              >
                <div>
                  {/* Top metadata row */}
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-[var(--font-display)] uppercase tracking-widest text-secondary font-semibold tabular-nums">
                        {item.folioRef}
                      </span>
                      <span className="text-on-surface-variant/40" aria-hidden="true">
                        ·
                      </span>
                      <span className="bg-tertiary-fixed text-on-tertiary-fixed-variant font-[var(--font-display)] px-2 py-0.5 rounded uppercase text-[11px] font-semibold">
                        {item.levelBadge}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSpeak(item.id, item.term)}
                        aria-label={`Listen to ${item.term}`}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          isSpeaking
                            ? 'bg-secondary text-on-secondary'
                            : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
                        }`}
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onToggleDifficult({
                            id: item.id,
                            term: item.term,
                            category: 'idiom',
                            badge: `Idiom · ${item.levelBadge}`,
                            ipa: item.ipa,
                            azTranslation: `${item.azEquivalent} (${item.azNuance})`,
                            definition: item.semanticValue,
                            exampleEn: item.exampleEn,
                            exampleAz: item.exampleAz,
                            etymologyNote: item.loreText,
                          })
                        }
                        aria-label={
                          isSaved
                            ? `Remove ${item.term} from Difficult Words`
                            : `Mark ${item.term} as Difficult`
                        }
                        title={
                          isSaved ? 'Saved in Difficult Words' : 'Mark as Difficult'
                        }
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-[var(--font-display)] uppercase tracking-wider transition-colors cursor-pointer ${
                          isSaved
                            ? 'bg-secondary text-on-secondary font-semibold'
                            : 'text-on-surface-variant hover:text-secondary hover:bg-surface-container'
                        }`}
                      >
                        <Flag className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`} />
                        <span>{isSaved ? 'Marked' : 'Difficult'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Main Idiom Title */}
                  <div className="mt-1">
                    <h2 className="font-[var(--font-display)] text-2xl sm:text-[28px] text-primary font-semibold leading-tight">
                      {item.term}
                    </h2>
                    <p className="text-sm text-secondary italic mt-0.5">{item.ipa}</p>
                  </div>

                  {/* Azerbaijani Translation & Meaning */}
                  <div className="mt-3 bg-surface-container p-3.5 rounded-lg border border-outline-variant/30">
                    <div className="font-[var(--font-display)] text-[11px] text-on-surface-variant uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <Languages className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
                      <span>Azərbaycan dilində ekvivalenti:</span>
                    </div>
                    <p className="text-[15px] text-primary font-semibold">
                      {item.azEquivalent}{' '}
                      <span className="text-on-surface-variant font-normal">
                        ({item.azNuance})
                      </span>
                    </p>
                    <p className="text-xs text-on-surface-variant mt-2 pt-2 border-t border-outline-variant/30 leading-relaxed">
                      <strong className="font-[var(--font-display)] text-primary uppercase mr-1">
                        Meaning:
                      </strong>
                      {item.semanticValue}
                    </p>
                  </div>

                  {/* Historical Origin Box (with woodcut image when available) */}
                  {showImg ? (
                    <div className="mt-4 grid grid-cols-3 gap-3 items-center bg-surface-container-high/70 p-3 rounded-lg">
                      <div className="col-span-1 h-20 rounded overflow-hidden bg-surface-container">
                        <img
                          src={item.imageUrl}
                          alt={item.imageAlt || item.loreTitle}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenImages((prev) => new Set(prev).add(item.id))
                          }
                          className="w-full h-full object-cover grayscale contrast-110"
                        />
                      </div>
                      <div className="col-span-2">
                        <span className="font-[var(--font-display)] text-[11px] text-on-tertiary-fixed-variant uppercase tracking-wider block font-semibold">
                          {item.loreTitle}
                        </span>
                        <p className="text-xs text-on-surface-variant leading-snug mt-1">
                          {item.loreText}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 p-3 bg-surface-container-high/60 rounded-lg">
                      <span className="font-[var(--font-display)] text-[11px] text-on-primary-fixed-variant uppercase tracking-wider block font-semibold mb-1">
                        {item.loreTitle}
                      </span>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        {item.loreText}
                      </p>
                    </div>
                  )}

                  {/* Example Sentence */}
                  <div className="mt-4 p-3.5 bg-surface-container-lowest rounded-lg border border-outline-variant/30">
                    <p className="text-[15px] text-primary italic leading-relaxed">
                      “{item.exampleEn}”
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1.5">
                      <em className="font-semibold text-secondary not-italic mr-1">
                        Az:
                      </em>
                      {item.exampleAz}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-outline-variant/30 flex flex-wrap items-center justify-between gap-2 text-on-surface-variant/80 font-[var(--font-display)] text-[11px] uppercase tracking-wider">
                  <span>Register: {item.registerNote}</span>
                  <span>{item.tipNote}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Fleuron Divider */}
      <div
        className="flex items-center justify-center gap-4 my-8 text-secondary/70 select-none"
        aria-hidden="true"
      >
        <span className="text-sm">❧</span>
        <span className="text-xs">❖</span>
        <span className="font-[var(--font-display)] text-lg italic text-primary/80">
          Ars Rhetorica
        </span>
        <span className="text-xs">❖</span>
        <span className="text-sm">☙</span>
      </div>

      {/* Scholarly Panel: Examiner Advice & Mastery Index */}
      <section className="bg-surface-container p-6 sm:p-8 rounded-xl border border-outline-variant/40">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
          <div className="lg:col-span-7 flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 text-secondary font-[var(--font-display)] text-xs uppercase tracking-widest font-semibold mb-1.5">
                <GraduationCap className="w-4 h-4" aria-hidden="true" />
                <span>IELTS &amp; Stylistic Usage Guide</span>
              </div>
              <h3 className="font-[var(--font-display)] text-2xl text-primary font-semibold">
                Rhetorical Practice &amp; Examiner Advice
              </h3>
              <p className="text-sm text-on-surface-variant leading-relaxed mt-2">
                In IELTS Speaking and Academic Writing, idiomatic control contributes directly to{' '}
                <strong className="text-primary">Lexical Resource</strong>. Choose the right register for the context:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                <div className="bg-surface-container-lowest p-4 rounded-lg border border-outline-variant/30">
                  <span className="font-[var(--font-display)] text-xs text-secondary uppercase font-semibold block mb-1">
                    1. Speaking vs. Writing
                  </span>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Phrases such as <em>“piece of cake”</em> enrich natural fluency in Speaking Part 1, whereas formal essays prefer concise academic phrasing.
                  </p>
                </div>
                <div className="bg-surface-container-lowest p-4 rounded-lg border border-outline-variant/30">
                  <span className="font-[var(--font-display)] text-xs text-on-tertiary-fixed-variant uppercase font-semibold block mb-1">
                    2. Restraint &amp; Precision
                  </span>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Deploy idioms only where the nuance clarifies your thought naturally—never force multiple idioms into a single sentence.
                  </p>
                </div>
              </div>

              <div className="mt-4 bg-surface-container-high p-3.5 rounded-lg">
                <p className="text-xs text-primary leading-relaxed">
                  <span className="font-[var(--font-display)] uppercase font-semibold text-secondary block mb-0.5">
                    Qeyd (Azərbaycanlı tələbələr üçün):
                  </span>
                  İngilis idiomlarını sözbəsöz tərcümə etmək deyil, onların semantik kontekstini və üslubiyyatını (rəsmi və ya danışıq qatı) qavramaq mütləqdir.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onJumpToQuiz}
                className="bg-primary hover:bg-primary-container text-on-primary font-[var(--font-display)] text-xs px-5 py-2.5 rounded uppercase tracking-widest transition-colors cursor-pointer"
              >
                Practice Saved Idioms in Quiz
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3">
                <span className="font-[var(--font-display)] text-xl text-primary font-semibold">
                  Idiomatic Archive Summary
                </span>
                <span className="font-[var(--font-display)] text-xs text-secondary font-semibold uppercase">
                  Curated
                </span>
              </div>

              <div className="space-y-2.5 mt-2">
                <div className="flex items-center justify-between p-2.5 rounded bg-surface-container-low text-sm">
                  <span className="text-primary">IELTS Band 7.5+ Idioms</span>
                  <span className="font-[var(--font-display)] text-xs font-semibold text-secondary tabular-nums">
                    {ieltsCount} items
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded bg-surface-container-low text-sm">
                  <span className="text-primary">Academic Register</span>
                  <span className="font-[var(--font-display)] text-xs font-semibold text-on-tertiary-fixed-variant tabular-nums">
                    {academicCount} items
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded bg-surface-container-low text-sm">
                  <span className="text-primary">Colloquial &amp; Conversational</span>
                  <span className="font-[var(--font-display)] text-xs font-semibold text-on-surface-variant tabular-nums">
                    {colloquialCount} items
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 p-3 rounded bg-surface-container-low flex items-center justify-between">
              <span className="font-[var(--font-display)] text-xs text-on-surface-variant uppercase tracking-wider">
                Flagged for Review
              </span>
              <span className="text-sm font-semibold text-primary tabular-nums">
                {savedIdiomCount} / {idioms.length} Marked
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
