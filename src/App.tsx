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
import { DifficultItem, SectionId, WordEntry } from './types/lexicon';

const STORAGE_DIFFICULT_KEY = 'the_crown_difficult_words_v1';
const STORAGE_CUSTOM_WORDS_KEY = 'the_crown_custom_words_v1';

export default function App() {
  const [activeSection, setActiveSection] = useState<SectionId>('words');

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
    try {
      localStorage.setItem(
        STORAGE_CUSTOM_WORDS_KEY,
        JSON.stringify(customWords)
      );
    } catch {
      // Ignore storage errors
    }
  }, [customWords]);

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
  }, [difficultItems]);

  const allWords = useMemo(
    () => [...customWords, ...WORDS_DATA],
    [customWords]
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
      ...IDIOMS_DATA.map((i) => ({
        id: i.id,
        term: i.term,
        azTranslation: `${i.azEquivalent} (${i.azNuance})`,
        category: 'idiom' as const,
      })),
      ...PHRASAL_VERBS_DATA.map((p) => ({
        id: p.id,
        term: p.term,
        azTranslation: p.azTranslation,
        category: 'phrasal' as const,
      })),
    ];
  }, [allWords]);

  const handleSelectSection = (section: SectionId) => {
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddWord = (word: WordEntry) => {
    setCustomWords((prev) => [word, ...prev]);
  };

  const handleToggleDifficult = (item: Omit<DifficultItem, 'addedAt'>) => {
    setDifficultItems((prev) => {
      const exists = prev.some((d) => d.id === item.id);
      if (exists) {
        return prev.filter((d) => d.id !== item.id);
      }
      return [{ ...item, addedAt: Date.now(), masteredCount: 0 }, ...prev];
    });
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
            idioms={IDIOMS_DATA}
            difficultIds={difficultIds}
            onToggleDifficult={handleToggleDifficult}
            onJumpToQuiz={() => handleSelectSection('difficult-words')}
          />
        )}

        {activeSection === 'phrasal-verbs' && (
          <PhrasalVerbsSection
            phrasalVerbs={PHRASAL_VERBS_DATA}
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
            difficultIds={difficultIds}
            onToggleDifficult={handleToggleDifficult}
          />
        )}

        {activeSection === 'film-episodes' && (
          <FilmEpisodesSection
            classicEpisodes={CLASSIC_FILM_EPISODES}
            allWords={allWords}
            allIdioms={IDIOMS_DATA}
            allPhrasals={PHRASAL_VERBS_DATA}
            difficultIds={difficultIds}
            onToggleDifficult={handleToggleDifficult}
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
