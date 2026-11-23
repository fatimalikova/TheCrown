import { useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { WordsSection } from './components/WordsSection';
import { IdiomsSection } from './components/IdiomsSection';
import { PhrasalVerbsSection } from './components/PhrasalVerbsSection';
import { DifficultWordsSection } from './components/DifficultWordsSection';
import { StoryReaderSection } from './components/StoryReaderSection';
import { FilmEpisodesSection } from './components/FilmEpisodesSection';
import {
  WORDS_DATA,
  IDIOMS_DATA,
  PHRASAL_VERBS_DATA,
  INITIAL_DIFFICULT_ITEMS,
} from './data/lexiconData';
import { READING_WORKS } from './data/storiesData';
import { CLASSIC_FILM_EPISODES } from './data/filmEpisodesData';
import {
  CefrLevel,
  DifficultItem,
  IdiomEntry,
  PhrasalVerbEntry,
  SectionId,
  WordEntry,
} from './types/lexicon';

const STORAGE_DIFFICULT_KEY = 'the_crown_difficult_words_v1';
const STORAGE_CUSTOM_WORDS_KEY = 'the_crown_custom_words_v1';
const STORAGE_CUSTOM_IDIOMS_KEY = 'the_crown_custom_idioms_v1';
const STORAGE_CUSTOM_PHRASALS_KEY = 'the_crown_custom_phrasals_v1';

const VALID_CEFR = new Set<CefrLevel>(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

function parseCefrAndPos(badge: string): { level: CefrLevel; partOfSpeech: string } {
  const parts = badge.split('·').map((s) => s.trim());
  const maybeLevel = parts[0]?.toUpperCase() as CefrLevel;
  const level: CefrLevel = VALID_CEFR.has(maybeLevel) ? maybeLevel : 'B2';
  const partOfSpeech = parts[1] || (VALID_CEFR.has(maybeLevel) ? 'Lexicon' : parts[0] || 'Vocabulary');
  return { level, partOfSpeech };
}

function toWordEntry(item: Omit<DifficultItem, 'addedAt'>): WordEntry {
  const { level, partOfSpeech } = parseCefrAndPos(item.badge);
  return {
    id: item.id,
    category: 'word',
    term: item.term,
    ipa: item.ipa || '/—/',
    level,
    partOfSpeech,
    etymology: item.etymologyNote || 'Marked during reading in Section 05.',
    azTranslation: item.azTranslation,
    definition: item.definition,
    exampleEn: item.exampleEn,
    exampleAz: item.exampleAz || item.azTranslation,
    relationLabel: 'Collocations',
    relatedTerms: [],
    folioRef: 'Section 05 · Reader',
    isCustom: true,
  };
}

function toIdiomEntry(item: Omit<DifficultItem, 'addedAt'>): IdiomEntry {
  return {
    id: item.id,
    category: 'idiom',
    term: item.term,
    ipa: item.ipa || '/—/',
    levelBadge: item.badge || 'Reader Idiom',
    registerGroup: 'Everyday Colloquial',
    azEquivalent: item.azTranslation,
    azNuance: 'Marked from Section 05 Reader',
    semanticValue: item.definition,
    loreTitle: 'Section 05 Discovery',
    loreText: item.etymologyNote || 'Captured during story or document reading.',
    exampleEn: item.exampleEn,
    exampleAz: item.exampleAz || item.azTranslation,
    registerNote: 'Section 05 · Reader',
    tipNote: 'Automatically added from Story & Article Mode',
    folioRef: 'Reader',
  };
}

function toPhrasalEntry(item: Omit<DifficultItem, 'addedAt'>): PhrasalVerbEntry {
  const parts = item.term.trim().split(/\s+/);
  const rawStem = parts[0] || item.term;
  const rootStem = rawStem.charAt(0).toUpperCase() + rawStem.slice(1).toLowerCase();
  const particle = parts.slice(1).join(' ').toLowerCase() || 'out';
  return {
    id: item.id,
    category: 'phrasal',
    term: item.term,
    rootStem,
    particle,
    ipa: item.ipa || '/—/',
    levelBadge: item.badge || 'Reader Phrasal Verb',
    grammarTag: 'Section 05',
    azTranslation: item.azTranslation,
    syntaxNote: item.etymologyNote || 'Captured during story or document reading.',
    definition: item.definition,
    exampleEn: item.exampleEn,
    exampleAz: item.exampleAz || item.azTranslation,
    folioRef: 'Reader',
    lexCode: 'S05',
  };
}

export default function App() {
  const [activeSection, setActiveSection] = useState<SectionId>('words');
  const [focusFilmTerm, setFocusFilmTerm] = useState<string | null>(null);

  const [customWords, setCustomWords] = useState<WordEntry[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CUSTOM_WORDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage errors
    }
    return [];
  });

  const [customIdioms, setCustomIdioms] = useState<IdiomEntry[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CUSTOM_IDIOMS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage errors
    }
    return [];
  });

  const [customPhrasals, setCustomPhrasals] = useState<PhrasalVerbEntry[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_CUSTOM_PHRASALS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage errors
    }
    return [];
  });

  const [difficultItems, setDifficultItems] = useState<DifficultItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_DIFFICULT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage errors
    }
    return INITIAL_DIFFICULT_ITEMS;
  });

  useEffect(() => {
    let active = true;
    fetch('/api/custom-lexicon')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (Array.isArray(data.words) && data.words.length > 0) {
          setCustomWords(data.words as WordEntry[]);
        }
        if (Array.isArray(data.idioms) && data.idioms.length > 0) {
          setCustomIdioms(data.idioms as IdiomEntry[]);
        }
        if (Array.isArray(data.phrasals) && data.phrasals.length > 0) {
          setCustomPhrasals(data.phrasals as PhrasalVerbEntry[]);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CUSTOM_WORDS_KEY, JSON.stringify(customWords));
      localStorage.setItem(STORAGE_CUSTOM_IDIOMS_KEY, JSON.stringify(customIdioms));
      localStorage.setItem(STORAGE_CUSTOM_PHRASALS_KEY, JSON.stringify(customPhrasals));
    } catch {
      // Ignore storage errors
    }
    fetch('/api/custom-lexicon', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        words: customWords,
        idioms: customIdioms,
        phrasals: customPhrasals,
      }),
    }).catch(() => {});
  }, [customWords, customIdioms, customPhrasals]);

  useEffect(() => {
    let active = true;
    fetch('/api/difficult-words')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && Array.isArray(data.items) && data.items.length > 0) {
          setDifficultItems(data.items as DifficultItem[]);
        }
      })
      .catch(() => {
        // Fallback silently to localStorage state
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_DIFFICULT_KEY,
        JSON.stringify(difficultItems)
      );
    } catch {
      // Ignore storage errors
    }
    fetch('/api/difficult-words', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: difficultItems }),
    }).catch(() => {
      // Ignore background sync failure
    });

    const excludeTerms = CLASSIC_FILM_EPISODES.map((ep) => ep.targetTerm).filter(
      Boolean
    );
    const idiomAndPhrasalItems = difficultItems.filter(
      (i) => i.category === 'idiom' || i.category === 'phrasal'
    );
    fetch('/api/episodes/sync-difficult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: idiomAndPhrasalItems,
        excludeTerms,
      }),
    }).catch(() => {});
  }, [difficultItems]);

  const allWords = useMemo(
    () => [...customWords, ...WORDS_DATA],
    [customWords]
  );

  const allIdioms = useMemo(
    () => [...customIdioms, ...IDIOMS_DATA],
    [customIdioms]
  );

  const allPhrasals = useMemo(
    () => [...customPhrasals, ...PHRASAL_VERBS_DATA],
    [customPhrasals]
  );

  const difficultIds = useMemo(
    () => new Set(difficultItems.map((item) => item.id)),
    [difficultItems]
  );

  const distractorPool = useMemo(() => {
    return [
      ...allWords.map((w) => ({
        id: w.id,
        term: w.term,
        azTranslation: w.azTranslation,
        category: 'word' as const,
      })),
      ...allIdioms.map((i) => ({
        id: i.id,
        term: i.term,
        azTranslation: `${i.azEquivalent} (${i.azNuance})`,
        category: 'idiom' as const,
      })),
      ...allPhrasals.map((p) => ({
        id: p.id,
        term: p.term,
        azTranslation: p.azTranslation,
        category: 'phrasal' as const,
      })),
    ];
  }, [allWords, allIdioms, allPhrasals]);

  const handleSelectSection = (section: SectionId) => {
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddWord = (word: WordEntry) => {
    setCustomWords((prev) => [word, ...prev]);
  };

  const handleToggleDifficult = (
    item: Omit<DifficultItem, 'addedAt'>,
    options?: { fromReader?: boolean }
  ) => {
    const alreadySaved = difficultItems.some((d) => d.id === item.id);

    setDifficultItems((prev) => {
      const exists = prev.some((d) => d.id === item.id);
      if (exists) {
        return prev.filter((d) => d.id !== item.id);
      }
      return [{ ...item, addedAt: Date.now(), masteredCount: 0 }, ...prev];
    });

    if (!alreadySaved) {
      const lowerTerm = item.term.trim().toLowerCase();

      // Words marked as difficult go strictly to Section 04 (Difficult Words), not Section 01.
      if (item.category === 'idiom') {
        const existsInIdioms = allIdioms.some(
          (i) => i.id === item.id || i.term.toLowerCase() === lowerTerm
        );
        if (!existsInIdioms) {
          setCustomIdioms((prev) => [toIdiomEntry(item), ...prev]);
        }
      } else if (item.category === 'phrasal') {
        const existsInPhrasals = allPhrasals.some(
          (p) => p.id === item.id || p.term.toLowerCase() === lowerTerm
        );
        if (!existsInPhrasals) {
          setCustomPhrasals((prev) => [toPhrasalEntry(item), ...prev]);
        }
      }

      // Only auto-create cinema episodes in Section 06 for unknown Phrasal Verbs & Idioms
      if (item.category === 'idiom' || item.category === 'phrasal') {
        const inClassicClip = CLASSIC_FILM_EPISODES.some(
          (ep) => ep.targetTerm?.toLowerCase() === lowerTerm
        );
        if (!inClassicClip) {
          fetch('/api/episodes/from-lexicon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: item.id,
              term: item.term,
              category: item.category,
              badge: item.badge,
              ipa: item.ipa,
              azTranslation: item.azTranslation,
              definition: item.definition,
              exampleEn: item.exampleEn,
              exampleAz: item.exampleAz,
              etymology: item.etymologyNote,
            }),
          }).catch(() => {});
        }
      }
    }
  };

  const handleOpenFilmClipForTerm = (term: string) => {
    setFocusFilmTerm(term);
    setActiveSection('film-episodes');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddCustomDifficult = (item: Omit<DifficultItem, 'addedAt'>) => {
    setDifficultItems((prev) => [
      { ...item, addedAt: Date.now(), masteredCount: 0 },
      ...prev,
    ]);
  };

  const handleRemoveDifficult = (id: string) => {
    setDifficultItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleMarkMastered = (id: string) => {
    setDifficultItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, masteredCount: (item.masteredCount ?? 0) + 1 }
          : item
      )
    );
  };

  const handleResetSampleLedger = () => {
    setDifficultItems(INITIAL_DIFFICULT_ITEMS);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-on-surface">
      <Header
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        difficultCount={difficultItems.length}
      />

      <main className="flex-1 w-full">
        {activeSection === 'words' && (
          <WordsSection
            words={allWords}
            onAddWord={handleAddWord}
            difficultIds={difficultIds}
            onToggleDifficult={handleToggleDifficult}
          />
        )}

        {activeSection === 'idioms' && (
          <IdiomsSection
            idioms={allIdioms}
            difficultIds={difficultIds}
            onToggleDifficult={handleToggleDifficult}
            onJumpToQuiz={() => handleSelectSection('difficult-words')}
          />
        )}

        {activeSection === 'phrasal-verbs' && (
          <PhrasalVerbsSection
            phrasalVerbs={allPhrasals}
            difficultIds={difficultIds}
            onToggleDifficult={handleToggleDifficult}
          />
        )}

        {activeSection === 'difficult-words' && (
          <DifficultWordsSection
            items={difficultItems}
            distractorPool={distractorPool}
            onRemoveItem={handleRemoveDifficult}
            onAddCustomItem={handleAddCustomDifficult}
            onMarkMastered={handleMarkMastered}
            onResetSampleLedger={handleResetSampleLedger}
          />
        )}

        {activeSection === 'story-reader' && (
          <StoryReaderSection
            works={READING_WORKS}
            allWords={allWords}
            allIdioms={allIdioms}
            allPhrasals={allPhrasals}
            difficultIds={difficultIds}
            onToggleDifficult={(item) =>
              handleToggleDifficult(item, { fromReader: true })
            }
            onWatchVideoClip={handleOpenFilmClipForTerm}
          />
        )}

        {activeSection === 'film-episodes' && (
          <FilmEpisodesSection
            classicEpisodes={CLASSIC_FILM_EPISODES}
            allWords={allWords}
            allIdioms={allIdioms}
            allPhrasals={allPhrasals}
            difficultIds={difficultIds}
            difficultItems={difficultItems}
            onToggleDifficult={handleToggleDifficult}
            focusTerm={focusFilmTerm}
            onClearFocusTerm={() => setFocusFilmTerm(null)}
          />
        )}
      </main>

      <footer className="w-full bg-surface-container-low py-10 border-t border-outline-variant/40">
        <div className="max-w-[1160px] mx-auto px-4 sm:px-8 flex flex-col items-center justify-center gap-2 text-center">
          <div
            className="flex items-center gap-4 text-secondary/70 text-xs select-none"
            aria-hidden="true"
          >
            <span>❧</span>
            <span>❖</span>
            <span>☙</span>
          </div>
          <p className="font-[var(--font-display)] text-xl text-primary italic">
            The Crown · Folio &amp; Lexicon of English Eloquence
          </p>
          <p className="text-sm text-on-surface-variant max-w-md">
            Compiled for English–Azerbaijani learners across A1–C2 vocabulary, idioms, phrasal verbs, personal review, story &amp; article reading, and film episodes.
          </p>
        </div>
      </footer>
    </div>
  );
}
