import React from 'react';
import { Bookmark, Crown } from 'lucide-react';
import { SectionId } from '../types/lexicon';

interface HeaderProps {
  activeSection: SectionId;
  onSelectSection: (section: SectionId) => void;
  difficultCount: number;
}

const NAV_ITEMS: { id: SectionId; label: string }[] = [
  { id: 'words', label: '01. Words' },
  { id: 'idioms', label: '02. Idioms' },
  { id: 'phrasal-verbs', label: '03. Phrasal Verbs' },
  { id: 'difficult-words', label: '04. Difficult Words' },
  { id: 'story-reader', label: '05. Story & Article' },
  { id: 'film-episodes', label: '06. Film Episodes' },
  { id: 'documents', label: '07. Documents' },
];

export const Header: React.FC<HeaderProps> = ({
  activeSection,
  onSelectSection,
  difficultCount,
}) => {
  return (
    <header className="sticky top-0 z-50 w-full bg-surface/95 backdrop-blur-md border-b border-outline-variant/40">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2 xl:gap-5">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectSection('words')}
          className="flex items-center gap-2 text-primary hover:text-secondary transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-secondary rounded px-1 py-1"
        >
          <Crown className="w-5 h-5 text-secondary shrink-0" aria-hidden="true" />
          <span className="font-[var(--font-display)] text-lg xl:text-2xl tracking-[0.1em] uppercase font-bold">
            The Crown
          </span>
        </button>

        {/* Zone 2: Single-line Navigation Links */}
        <nav
          aria-label="Primary sections"
          className="hidden lg:flex items-center gap-0.5"
        >
          {NAV_ITEMS.map((item, idx) => {
            const isActive = activeSection === item.id;
            return (
              <React.Fragment key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelectSection(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-1.5 xl:px-2 py-1.5 rounded text-[11px] xl:text-xs uppercase tracking-[0.06em] font-[var(--font-display)] whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-surface-container-high text-primary font-semibold'
                      : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-low'
                  }`}
                >
                  {item.label}
                </button>
                {idx < NAV_ITEMS.length - 1 && (
                  <span
                    className="text-outline-variant text-[10px] select-none"
                    aria-hidden="true"
                  >
                    ·
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action (Difficult Ledger Quick Access) */}
        <button
          type="button"
          onClick={() => onSelectSection('difficult-words')}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded bg-primary text-on-primary hover:bg-primary-container transition-colors whitespace-nowrap shrink-0 text-xs font-[var(--font-display)] uppercase tracking-wider cursor-pointer"
        >
          <Bookmark className="w-3.5 h-3.5 text-secondary-fixed" aria-hidden="true" />
          <span>Ledger</span>
          <span className="tabular-nums font-semibold text-secondary-fixed">
            ({difficultCount})
          </span>
        </button>
      </div>

      {/* Compact Mobile/Tablet Nav Strip */}
      <nav
        aria-label="Mobile sections"
        className="lg:hidden border-t border-outline-variant/30 bg-surface-container-low/80 overflow-x-auto no-scrollbar"
      >
        <div className="flex items-center gap-1 px-4 py-1.5 min-w-max">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`px-2.5 py-1.5 rounded text-[11px] uppercase tracking-wider font-[var(--font-display)] whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? 'bg-primary text-on-primary font-semibold'
                    : 'text-on-surface-variant hover:text-primary'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
};
