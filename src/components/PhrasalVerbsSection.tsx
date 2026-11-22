import React, { useMemo, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Search,
  Volume2,
  X,
} from 'lucide-react';
import { DifficultItem, PhrasalVerbEntry } from '../types/lexicon';
import { speakEnglish } from '../utils/speech';

interface PhrasalVerbsSectionProps {
  phrasalVerbs: PhrasalVerbEntry[];
  difficultIds: Set<string>;
  onToggleDifficult: (item: Omit<DifficultItem, 'addedAt'>) => void;
}

const ROOT_STEMS = [
  'All',
  'Carry',
  'Look',
  'Give',
  'Bring',
  'Turn',
  'Take',
  'Set',
  'Put',
];

const PARTICLES = [
  'any',
  'out',
  'up',
  'forward',
  'off',
  'down',
  'into',
  'about',
  'over',
  'forth',
  'in',
];

const PAGE_SIZE = 6;

export const PhrasalVerbsSection: React.FC<PhrasalVerbsSectionProps> = ({
  phrasalVerbs,
  difficultIds,
  onToggleDifficult,
}) => {
  const [selectedStem, setSelectedStem] = useState('All');
  const [selectedParticle, setSelectedParticle] = useState('any');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [bgError, setBgError] = useState(false);

  const filteredPhrasals = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return phrasalVerbs.filter((pv) => {
      if (selectedStem !== 'All' && pv.rootStem !== selectedStem) return false;
      if (selectedParticle !== 'any' && pv.particle !== selectedParticle)
        return false;
      if (q) {
        const hay =
          `${pv.term} ${pv.azTranslation} ${pv.definition} ${pv.exampleEn} ${pv.exampleAz}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [phrasalVerbs, selectedStem, selectedParticle, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredPhrasals.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedPhrasals = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredPhrasals.slice(start, start + PAGE_SIZE);
  }, [filteredPhrasals, safePage]);

  const handleSpeak = (id: string, term: string) => {
    setSpeakingId(id);
    speakEnglish(term, () => setSpeakingId(null));
    setTimeout(() => setSpeakingId((prev) => (prev === id ? null : prev)), 1200);
  };

  const savedCount = phrasalVerbs.filter((pv) => difficultIds.has(pv.id)).length;
  const retentionRatio = Math.round(
    ((phrasalVerbs.length - savedCount) / Math.max(1, phrasalVerbs.length)) * 100
  );

  return (
    <div className="w-full max-w-[1160px] mx-auto px-4 sm:px-8 pt-6 pb-16">
      {/* Top Treatise Banner */}
      <section className="pb-5 mb-6 border-b border-outline-variant/40 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <div className="flex items-center gap-2 text-secondary font-[var(--font-display)] text-xs uppercase tracking-[0.18em]">
            <span>The Crown · Fascicle III</span>
            <span aria-hidden="true">❖</span>
            <span>En → Az Codices</span>
          </div>
          <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl text-primary tracking-tight font-normal [text-wrap:balance]">
            Part III · Phrasal Verbs —{' '}
            <span className="italic">Treatise on Particle Constructions</span>
          </h1>
          <p className="text-sm sm:text-base text-on-surface-variant italic">
            Curated for bilingual analytical translation, syntactic precision, and everyday English mastery.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto bg-surface-container-low px-4 py-2.5 rounded-lg border border-outline-variant/40">
          <div className="flex flex-col text-right">
            <span className="font-[var(--font-display)] text-[11px] text-on-surface-variant uppercase tracking-widest">
              Compendium Index
            </span>
            <span className="font-[var(--font-display)] text-lg text-primary font-semibold tabular-nums">
              {phrasalVerbs.length} Entries
            </span>
          </div>
          <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-secondary">
            <BookOpen className="w-4 h-4" aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* Filter Ribbon: Root Stems & Particle Matrix */}
      <section className="mb-6 bg-surface-container p-4 rounded-xl border border-outline-variant/40 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2 flex-col sm:flex-row">
            <span className="font-[var(--font-display)] text-xs text-on-surface-variant uppercase tracking-widest min-w-[75px]">
              Root Stem:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {ROOT_STEMS.map((stem) => {
                const active = selectedStem === stem;
                return (
                  <button
                    key={stem}
                    type="button"
                    onClick={() => {
                      setSelectedStem(stem);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 rounded font-[var(--font-display)] text-xs tracking-wider uppercase whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      active
                        ? 'bg-primary text-on-primary font-semibold'
                        : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-high'
                    }`}
                  >
                    {stem === 'All' ? `All (${phrasalVerbs.length})` : stem}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative min-w-[230px]">
            <Search
              className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search phrasal verb or Az tərcümə..."
              aria-label="Search phrasal verbs"
              className="w-full bg-surface-container-lowest pl-9 pr-8 py-2 text-sm text-on-surface rounded-lg border border-outline-variant/50 focus:outline-none focus:border-secondary placeholder:text-outline placeholder:italic"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-primary cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Particle Filter Sub-row */}
        <div className="flex items-start sm:items-center gap-2 pt-2 border-t border-outline-variant/30 flex-col sm:flex-row">
          <span className="font-[var(--font-display)] text-xs uppercase tracking-widest text-on-surface-variant min-w-[75px]">
            Particle:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {PARTICLES.map((p) => {
              const active = selectedParticle === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setSelectedParticle(p);
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-0.5 rounded text-xs font-[var(--font-display)] transition-colors cursor-pointer ${
                    active
                      ? 'bg-secondary text-on-secondary font-semibold'
                      : 'bg-surface-container-lowest text-on-surface-variant hover:text-primary border border-outline-variant/30'
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Top 3 Context Cards */}
      <section className="mb-7 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/40 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-surface-container-highest shrink-0 flex items-center justify-center">
            <svg className="w-9 h-9 text-secondary" viewBox="0 0 36 36">
              <path
                className="text-surface-container-high"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.2"
              />
              <path
                className="text-secondary"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeDasharray={`${retentionRatio}, 100`}
                strokeLinecap="round"
                strokeWidth="3.2"
              />
            </svg>
          </div>
          <div>
            <span className="font-[var(--font-display)] text-[11px] uppercase tracking-widest text-on-surface-variant">
              Phrasal Readiness
            </span>
            <h4 className="font-[var(--font-display)] text-xl text-primary font-semibold tabular-nums">
              {retentionRatio}% Familiar
            </h4>
            <p className="text-xs text-on-surface-variant tabular-nums">
              {savedCount} flagged in Difficult Words
            </p>
          </div>
        </div>

        <div className="relative bg-surface-container-low rounded-xl border border-outline-variant/40 overflow-hidden flex flex-col justify-end p-4 min-h-[112px]">
          {!bgError && (
            <img
              src="/src/assets/images/archival_books_backdrop_1795336049573.jpg"
              alt="Stacked antique leather-bound philological books on dark oak desk"
              referrerPolicy="no-referrer"
              onError={() => setBgError(true)}
              className="absolute inset-0 w-full h-full object-cover opacity-20"
            />
          )}
          <div className="relative z-10">
            <span className="font-[var(--font-display)] text-[11px] uppercase tracking-widest text-secondary font-semibold">
              Morphological Syntax
            </span>
            <p className="text-sm text-primary italic mt-0.5">
              “Particles alter aspect, directionality, and formal register.”
            </p>
          </div>
        </div>

        <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/40 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs">
            <span className="font-[var(--font-display)] uppercase tracking-widest text-on-surface-variant">
              Azerbaijani Cadence
            </span>
            <span className="text-secondary font-[var(--font-display)]">
              § Translators’ Key
            </span>
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed my-1.5">
            English verb + particle constructions map to Azerbaijani compound or derived verbs ending in{' '}
            <span className="text-primary italic">“-mək / -maq”</span>.
          </p>
          <span className="font-[var(--font-display)] text-[11px] text-secondary">
            Bilingual Grammatical Precision
          </span>
        </div>
      </section>

      {/* Phrasal Verb Cards Grid */}
      {paginatedPhrasals.length === 0 ? (
        <div className="bg-surface-container-low rounded-xl p-10 text-center border border-outline-variant/40 mb-8">
          <p className="font-[var(--font-display)] text-2xl text-primary mb-2">
            No phrasal verbs match this filter
          </p>
          <p className="text-sm text-on-surface-variant mb-4">
            Try resetting the Root Stem or Particle selection to explore all entries.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedStem('All');
              setSelectedParticle('any');
              setSearchQuery('');
              setCurrentPage(1);
            }}
            className="px-4 py-2 rounded bg-primary text-on-primary font-[var(--font-display)] text-xs uppercase tracking-wider cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedPhrasals.map((pv) => {
            const isSaved = difficultIds.has(pv.id);
            const isSpeaking = speakingId === pv.id;
            return (
              <article
                key={pv.id}
                className="flex flex-col justify-between bg-surface-container-low rounded-xl p-6 border border-outline-variant/40 transition-shadow hover:shadow-sm"
              >
                <div className="space-y-3">
                  {/* Top metadata */}
                  <div className="flex items-start justify-between gap-2 text-xs">
                    <span className="font-[var(--font-display)] text-on-surface-variant italic tabular-nums">
                      {pv.folioRef}
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <span className="font-[var(--font-display)] text-[11px] uppercase tracking-wider bg-secondary-fixed text-on-secondary-fixed px-2 py-0.5 rounded font-semibold">
                        {pv.levelBadge}
                      </span>
                      <span className="font-[var(--font-display)] text-[11px] uppercase tracking-wider bg-surface-container text-on-surface-variant px-1.5 py-0.5 rounded">
                        {pv.grammarTag}
                      </span>
                    </div>
                  </div>

                  {/* Title + Audio */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-[var(--font-display)] text-2xl text-primary font-semibold tracking-tight leading-snug">
                        {pv.term}
                      </h2>
                      <span className="text-xs text-on-surface-variant italic">
                        {pv.ipa}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSpeak(pv.id, pv.term)}
                      aria-label={`Listen to ${pv.term}`}
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                        isSpeaking
                          ? 'bg-secondary text-on-secondary'
                          : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-primary'
                      }`}
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Azerbaijani Plaque */}
                  <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30">
                    <span className="font-[var(--font-display)] text-[11px] uppercase tracking-wider text-secondary block">
                      Azərbaycan dilinə tərcüməsi:
                    </span>
                    <p className="font-[var(--font-display)] text-lg text-primary font-medium mt-0.5">
                      {pv.azTranslation}
                    </p>
                  </div>

                  {/* Syntax & Definition */}
                  <div className="space-y-1">
                    <p className="font-[var(--font-display)] text-[11px] uppercase tracking-wider text-outline">
                      {pv.syntaxNote}
                    </p>
                    <p className="text-sm text-on-surface leading-relaxed">
                      {pv.definition}
                    </p>
                  </div>

                  <div
                    className="flex items-center justify-center text-outline-variant/70 text-xs select-none py-0.5"
                    aria-hidden="true"
                  >
                    —— ❦ ——
                  </div>

                  {/* Literary Example */}
                  <div className="p-3 bg-surface-container-high/50 rounded-lg space-y-1.5">
                    <p className="text-sm text-primary italic leading-relaxed">
                      “{pv.exampleEn}”
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      <span className="font-[var(--font-display)] text-[10px] text-secondary uppercase tracking-wider block font-semibold">
                        Azəri qarşılığı:
                      </span>
                      “{pv.exampleAz}”
                    </p>
                  </div>
                </div>

                {/* Bottom Action */}
                <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-on-surface-variant tabular-nums">
                    {pv.lexCode}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onToggleDifficult({
                        id: pv.id,
                        term: pv.term,
                        category: 'phrasal',
                        badge: `Phrasal Verb · ${pv.levelBadge}`,
                        ipa: pv.ipa,
                        azTranslation: pv.azTranslation,
                        definition: pv.definition,
                        exampleEn: pv.exampleEn,
                        exampleAz: pv.exampleAz,
                        etymologyNote: pv.syntaxNote,
                      })
                    }
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-[var(--font-display)] uppercase tracking-wider transition-colors cursor-pointer ${
                      isSaved
                        ? 'bg-secondary text-on-secondary font-semibold'
                        : 'text-on-surface-variant bg-surface-container hover:bg-surface-container-high'
                    }`}
                  >
                    <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`} />
                    <span>{isSaved ? 'Saved' : 'Mark Difficult'}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {filteredPhrasals.length > 0 && (
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-container p-4 rounded-xl border border-outline-variant/40">
          <div className="text-sm text-on-surface-variant tabular-nums">
            <span className="font-[var(--font-display)] text-xs uppercase tracking-widest mr-2">
              Showing:
            </span>
            <span className="italic text-primary">
              {(safePage - 1) * PAGE_SIZE + 1} –{' '}
              {Math.min(safePage * PAGE_SIZE, filteredPhrasals.length)} of{' '}
              {filteredPhrasals.length} Phrasal Verbs
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded font-[var(--font-display)] text-xs uppercase tracking-wider text-on-surface-variant hover:text-primary hover:bg-surface-container-high disabled:opacity-40 flex items-center gap-1 cursor-pointer disabled:cursor-default"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                onClick={() => setCurrentPage(pageNum)}
                className={`px-3 py-1 rounded font-[var(--font-display)] text-xs tabular-nums cursor-pointer ${
                  pageNum === safePage
                    ? 'bg-primary text-on-primary font-semibold'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {pageNum}
              </button>
            ))}
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded font-[var(--font-display)] text-xs uppercase tracking-wider text-primary bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-40 flex items-center gap-1 cursor-pointer disabled:cursor-default"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
