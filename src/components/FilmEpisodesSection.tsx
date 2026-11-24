import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clapperboard,
  Film,
  ImagePlus,
  Languages,
  Loader2,
  Network,
  Repeat,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Trash2,
  Volume2,
} from 'lucide-react';
import {
  DifficultItem,
  FilmEpisode,
  IdiomEntry,
  PhrasalVerbEntry,
  ReadingToken,
  VideoAspectRatio,
  WordEntry,
} from '../types/lexicon';
import { speakEnglish, stopSpeaking } from '../utils/speech';

interface FilmEpisodesSectionProps {
  classicEpisodes: FilmEpisode[];
  allWords: WordEntry[];
  allIdioms: IdiomEntry[];
  allPhrasals: PhrasalVerbEntry[];
  difficultIds: Set<string>;
  difficultItems: DifficultItem[];
  onToggleDifficult: (item: Omit<DifficultItem, 'addedAt'>) => void;
  focusTerm?: string | null;
  onClearFocusTerm?: () => void;
}

type EpisodeFilter =
  | 'all'
  | 'marked'
  | 'phrasal'
  | 'idiom'
  | 'word'
  | 'generated';
type StudioTab = 'text-to-video' | 'image-to-video';

const DELETED_CLASSIC_STORAGE_KEY = 'crown_deleted_classic_episodes_v1';

export const FilmEpisodesSection: React.FC<FilmEpisodesSectionProps> = ({
  classicEpisodes,
  allWords,
  allIdioms,
  allPhrasals,
  difficultIds,
  difficultItems,
  onToggleDifficult,
  focusTerm,
  onClearFocusTerm,
}) => {
  const [generatedEpisodes, setGeneratedEpisodes] = useState<FilmEpisode[]>([]);
  const [deletedClassicIds, setDeletedClassicIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(DELETED_CLASSIC_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage error
    }
    return [];
  });
  const [filter, setFilter] = useState<EpisodeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(
    classicEpisodes[0]?.id ?? ''
  );

  // Real <video> & YouTube real cinema embed player state
  const [loopClip, setLoopClip] = useState(false);
  const [showAzSubtitles, setShowAzSubtitles] = useState(true);
  const [speakingTerm, setSpeakingTerm] = useState<string | null>(null);
  const [customAzNote, setCustomAzNote] = useState('');
  const [resolvingClipId, setResolvingClipId] = useState<string | null>(null);
  const [resolveClipError, setResolveClipError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoStageRef = useRef<HTMLDivElement>(null);

  // Cinema Scene Studio state
  const [studioTab, setStudioTab] = useState<StudioTab>('text-to-video');
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('16:9');
  const [filmTitleInput, setFilmTitleInput] = useState(
    'The Quiet Observatory'
  );
  const [promptInput, setPromptInput] = useState(
    '35mm cinema scene in a candlelit British study at dusk, two characters speaking intensely across a mahogany desk, warm tungsten shadows'
  );
  const [scriptInput, setScriptInput] = useState(
    'Tonight we burn the midnight oil.\nDo not give up before we carry out the final search.'
  );

  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState<string>('');
  const [uploadedImageMime, setUploadedImageMime] = useState<string>('');
  const [uploadedImageName, setUploadedImageName] = useState<string>('');
  const [motionPromptInput, setMotionPromptInput] = useState(
    'Subtle cinematic dolly-in with natural atmospheric movement, 35mm film grain'
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [studioSuccess, setStudioSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEpisodesFromServer = () => {
    return fetch('/api/episodes')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (Array.isArray(data.episodes)) {
          setGeneratedEpisodes(data.episodes as FilmEpisode[]);
        }
        if (Array.isArray(data.deletedClassicIds)) {
          const serverDeleted = data.deletedClassicIds as string[];
          setDeletedClassicIds(serverDeleted);
          try {
            localStorage.setItem(
              DELETED_CLASSIC_STORAGE_KEY,
              JSON.stringify(serverDeleted)
            );
          } catch {
            // Ignore storage errors
          }
        }
      })
      .catch(() => {
        // Ignore silent fetch issue
      });
  };

  useEffect(() => {
    let active = true;
    const load = () => {
      if (!active) return;
      void fetchEpisodesFromServer();
    };
    load();
    const timer = window.setTimeout(load, 900);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [difficultItems.length]);

  const hasGeneratingEpisodes = useMemo(
    () => generatedEpisodes.some((ep) => ep.status === 'generating'),
    [generatedEpisodes]
  );

  useEffect(() => {
    if (!hasGeneratingEpisodes) return;
    const timer = window.setInterval(() => {
      void fetchEpisodesFromServer();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [hasGeneratingEpisodes]);

  const visibleClassicEpisodes = useMemo(() => {
    const deletedSet = new Set(deletedClassicIds);
    return classicEpisodes.filter((ep) => !deletedSet.has(ep.id));
  }, [classicEpisodes, deletedClassicIds]);

  const allEpisodes = useMemo(
    () => [...generatedEpisodes, ...visibleClassicEpisodes],
    [generatedEpisodes, visibleClassicEpisodes]
  );

  const matchedTermsByEpisodeId = useMemo(() => {
    const map = new Map<string, string[]>();
    const markedLower = difficultItems
      .map((d) => ({ id: d.id, term: d.term.trim(), lower: d.term.trim().toLowerCase() }))
      .filter((d) => d.lower.length > 0);

    for (const ep of allEpisodes) {
      const matched: string[] = [];
      const targetLower = ep.targetTerm?.toLowerCase() ?? '';
      const dialogueText = ep.cues
        .map((c) => c.tokens.map((t) => t.text).join(''))
        .join(' ')
        .toLowerCase();

      for (const m of markedLower) {
        const tokenMatched = ep.cues.some((c) =>
          c.tokens.some(
            (t) =>
              t.lexiconId === m.id ||
              t.term?.toLowerCase() === m.lower
          )
        );
        const wordRe = new RegExp(
          `\\b${m.lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          'i'
        );
        if (
          tokenMatched ||
          targetLower === m.lower ||
          wordRe.test(dialogueText)
        ) {
          matched.push(m.term);
        }
      }

      if (
        (ep.sourceSection === 'reader' || ep.sourceSection === 'difficult-manual') &&
        matched.length === 0 &&
        ep.targetTerm
      ) {
        matched.push(ep.targetTerm);
      }

      if (matched.length > 0) {
        map.set(ep.id, Array.from(new Set(matched)));
      }
    }
    return map;
  }, [allEpisodes, difficultItems]);

  const filteredEpisodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allEpisodes.filter((ep) => {
      if (filter === 'marked' && !matchedTermsByEpisodeId.has(ep.id)) return false;
      if (filter === 'generated' && ep.kind !== 'generated') return false;
      if (
        (filter === 'phrasal' || filter === 'idiom' || filter === 'word') &&
        ep.targetCategory !== filter
      ) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        ep.filmTitle,
        ep.episodeTitle,
        ep.targetTerm ?? '',
        ep.directorNote,
        ...ep.cues.map((c) => c.tokens.map((t) => t.text).join('')),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allEpisodes, filter, searchQuery, matchedTermsByEpisodeId]);

  const currentEpisode = useMemo(() => {
    return (
      filteredEpisodes.find((ep) => ep.id === selectedId) ??
      filteredEpisodes[0] ??
      allEpisodes[0]
    );
  }, [filteredEpisodes, selectedId, allEpisodes]);

  const episodeGlossary = useMemo(() => {
    if (!currentEpisode) return [];
    const seen = new Set<string>();
    const list: ReadingToken[] = [];
    currentEpisode.cues.forEach((cue) => {
      cue.tokens.forEach((tok) => {
        if (tok.term && !seen.has(tok.term.toLowerCase())) {
          seen.add(tok.term.toLowerCase());
          list.push(tok);
        }
      });
    });
    return list;
  }, [currentEpisode]);

  const [activeToken, setActiveToken] = useState<ReadingToken>(() => {
    const first = classicEpisodes[0]?.cues
      .flatMap((c) => c.tokens)
      .find((t) => Boolean(t.term));
    return (
      first ?? {
        text: 'Give up',
        lexiconId: 'pv-give-up',
        term: 'Give up',
        badge: 'Phrasal Verb · Essential',
        category: 'phrasal',
        ipa: '/ɡɪv ʌp/',
        azTranslation: 'Əl çəkmək, ümidini üzmək, təslim olmaq',
        definition:
          'To stop trying or abandon hope; to cease an endeavor or surrender.',
        exampleEn: 'You mustn’t give up hope — someday I’ll get out.',
        etymology: 'Separable phrasal verb: give [something] up.',
      }
    );
  });

  const sendYouTubeCommand = (func: string, args: unknown[] = []) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        JSON.stringify({ event: 'command', func, args }),
        '*'
      );
    } catch {
      // Ignore postMessage failure
    }
  };

  const focusAndPlayEpisode = (
    ep: FilmEpisode | undefined,
    options?: { seekSec?: number; cueIndex?: number }
  ) => {
    if (!ep) return;
    stopSpeaking();
    const switching = currentEpisode?.id !== ep.id;
    if (switching) {
      setSelectedId(ep.id);
    }

    window.setTimeout(() => {
      videoStageRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      if (ep.embedUrl) {
        if (typeof options?.seekSec === 'number') {
          sendYouTubeCommand('seekTo', [options.seekSec, true]);
        }
        sendYouTubeCommand('playVideo');
      } else if (ep.videoUrl) {
        const vid = videoRef.current;
        if (vid) {
          vid.currentTime = options?.seekSec ?? 0;
          vid.play().catch(() => {});
        }
      }
    }, switching ? 200 : 40);
  };

  useEffect(() => {
    if (!focusTerm) return;
    const lower = focusTerm.trim().toLowerCase();
    const matched = allEpisodes.find(
      (ep) =>
        ep.targetTerm?.toLowerCase() === lower ||
        ep.cues.some((c) =>
          c.tokens.some((t) => t.term?.toLowerCase() === lower)
        )
    );
    if (matched) {
      setFilter('all');
      setSearchQuery('');
      focusAndPlayEpisode(matched);
      onClearFocusTerm?.();
    } else {
      const retry = window.setTimeout(() => {
        void fetchEpisodesFromServer();
      }, 400);
      return () => window.clearTimeout(retry);
    }
  }, [focusTerm, allEpisodes, onClearFocusTerm]);

  useEffect(() => {
    stopSpeaking();
    setResolveClipError(null);
    if (!currentEpisode) return;
    const firstAnnotated = currentEpisode.cues
      .flatMap((c) => c.tokens)
      .find((t) => Boolean(t.term));
    if (firstAnnotated) {
      setActiveToken(firstAnnotated);
    }
  }, [currentEpisode?.id]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const handleReplayClip = () => {
    stopSpeaking();
    if (currentEpisode?.embedUrl) {
      sendYouTubeCommand('seekTo', [0, true]);
      sendYouTubeCommand('playVideo');
      return;
    }
    if (currentEpisode?.videoUrl) {
      const vid = videoRef.current;
      if (!vid) return;
      vid.currentTime = 0;
      vid.play().catch(() => {});
    }
  };

  const handleLookupWord = (rawWord: string, lineContext: string) => {
    const cleaned = rawWord.replace(/[^a-zA-Z'-]/g, '').trim();
    if (!cleaned) return;
    const lower = cleaned.toLowerCase();

    const wordMatch = allWords.find((w) => w.term.toLowerCase() === lower);
    if (wordMatch) {
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

    const idiomMatch = allIdioms.find((i) =>
      i.term.toLowerCase().includes(lower)
    );
    if (idiomMatch && lower.length > 3) {
      setActiveToken({
        text: idiomMatch.term,
        lexiconId: idiomMatch.id,
        term: idiomMatch.term,
        badge: idiomMatch.levelBadge,
        category: 'idiom',
        ipa: idiomMatch.ipa,
        azTranslation: `${idiomMatch.azEquivalent} (${idiomMatch.azNuance})`,
        definition: idiomMatch.semanticValue,
        exampleEn: idiomMatch.exampleEn,
        exampleAz: idiomMatch.exampleAz,
        etymology: idiomMatch.loreText,
      });
      const epMatch = allEpisodes.find(
        (ep) => ep.targetTerm?.toLowerCase() === idiomMatch.term.toLowerCase()
      );
      focusAndPlayEpisode(epMatch ?? currentEpisode);
      return;
    }

    const pvMatch = allPhrasals.find((p) =>
      p.term.toLowerCase().startsWith(lower)
    );
    if (pvMatch && lower.length > 3) {
      setActiveToken({
        text: pvMatch.term,
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
      const epMatch = allEpisodes.find(
        (ep) => ep.targetTerm?.toLowerCase() === pvMatch.term.toLowerCase()
      );
      focusAndPlayEpisode(epMatch ?? currentEpisode);
      return;
    }

    setActiveToken({
      text: rawWord,
      lexiconId: `film-word-${lower}`,
      term: cleaned.charAt(0).toUpperCase() + cleaned.slice(1),
      badge: 'Film Episode Word',
      category: 'word',
      ipa: `/${lower}/`,
      azTranslation:
        customAzNote.trim() || 'Add Azerbaijani translation below before saving',
      definition: `Spoken in "${currentEpisode?.filmTitle ?? 'Film Clip'}". Save to Difficult Words to review in quizzes.`,
      exampleEn: lineContext,
      etymology: 'Extracted from real film dialogue.',
    });
  };

  const handleSpeak = (term: string) => {
    setSpeakingTerm(term);
    speakEnglish(term, () => setSpeakingTerm(null));
    setTimeout(
      () => setSpeakingTerm((prev) => (prev === term ? null : prev)),
      1200
    );
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setStudioError('Please upload a PNG, JPEG, or WebP photograph.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedImageDataUrl(reader.result);
        setUploadedImageMime(file.type);
        setUploadedImageName(file.name);
        setStudioError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateTextVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudioError(null);
    setStudioSuccess(null);

    if (!promptInput.trim()) {
      setStudioError('Please describe the film scene to generate.');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/videos/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptInput.trim(),
          aspectRatio,
          filmTitle: filmTitleInput.trim() || 'Original Film Study',
          episodeTitle: `Scene · ${filmTitleInput.trim() || 'Study'}`,
          scriptText: scriptInput.trim(),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Video generation failed.');
      }

      const newEpisode = payload.episode as FilmEpisode;
      setGeneratedEpisodes((prev) => [newEpisode, ...prev]);
      setFilter('all');
      setSelectedId(newEpisode.id);
      setStudioSuccess(
        `Scene "${newEpisode.episodeTitle}" generated (${aspectRatio}) via gemini-omni-1.2-flash.`
      );
    } catch (err) {
      setStudioError(
        err instanceof Error ? err.message : 'Unable to generate scene video.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAnimateImageVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudioError(null);
    setStudioSuccess(null);

    if (!uploadedImageDataUrl) {
      setStudioError('Please upload a photograph first to animate it.');
      return;
    }
    if (!motionPromptInput.trim()) {
      setStudioError('Please enter motion directions for the photograph.');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/videos/animate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: uploadedImageDataUrl,
          mimeType: uploadedImageMime,
          prompt: motionPromptInput.trim(),
          aspectRatio,
          filmTitle: filmTitleInput.trim() || 'Animated Photograph',
          episodeTitle: `Animated · ${uploadedImageName.replace(/\.[^/.]+$/, '') || 'Still'}`,
          scriptText: scriptInput.trim(),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Image animation failed.');
      }

      const newEpisode = payload.episode as FilmEpisode;
      setGeneratedEpisodes((prev) => [newEpisode, ...prev]);
      setFilter('all');
      setSelectedId(newEpisode.id);
      setStudioSuccess(
        `Animated film scene "${newEpisode.episodeTitle}" created (${aspectRatio}).`
      );
    } catch (err) {
      setStudioError(
        err instanceof Error ? err.message : 'Unable to animate photograph.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteEpisode = async (id: string, kind: FilmEpisode['kind']) => {
    stopSpeaking();
    if (kind === 'classic') {
      const updatedDeleted = Array.from(new Set([...deletedClassicIds, id]));
      setDeletedClassicIds(updatedDeleted);
      try {
        localStorage.setItem(
          DELETED_CLASSIC_STORAGE_KEY,
          JSON.stringify(updatedDeleted)
        );
      } catch {
        // Ignore storage error
      }
      if (selectedId === id) {
        const nextEp = allEpisodes.find((ep) => ep.id !== id);
        setSelectedId(nextEp?.id ?? '');
      }
      fetch(`/api/episodes/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).catch(() => {});
      return;
    }

    try {
      const res = await fetch(`/api/episodes/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setGeneratedEpisodes((prev) => prev.filter((ep) => ep.id !== id));
        if (selectedId === id) {
          const nextEp = allEpisodes.find((ep) => ep.id !== id);
          setSelectedId(nextEp?.id ?? '');
        }
      }
    } catch {
      // Ignore silent network error
    }
  };

  const handleRestoreClassicEpisodes = async () => {
    setDeletedClassicIds([]);
    try {
      localStorage.removeItem(DELETED_CLASSIC_STORAGE_KEY);
    } catch {
      // Ignore storage error
    }
    try {
      await fetch('/api/episodes/restore-classic', { method: 'POST' });
    } catch {
      // Ignore silent network error
    }
  };

  const handleResolveRealClip = async (id: string) => {
    setResolvingClipId(id);
    setResolveClipError(null);
    try {
      const res = await fetch(
        `/api/episodes/${encodeURIComponent(id)}/resolve-real-clip`,
        { method: 'POST' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResolveClipError(
          data?.error || 'Could not locate a real movie clip right now.'
        );
        return;
      }
      if (data?.episode) {
        const updated = data.episode as FilmEpisode;
        setGeneratedEpisodes((prev) =>
          prev.map((ep) => (ep.id === id ? updated : ep))
        );
        const firstAnnotated = updated.cues
          ?.flatMap((c) => c.tokens)
          .find((t) => Boolean(t.term));
        if (firstAnnotated) {
          setActiveToken(firstAnnotated);
        }
      }
    } catch {
      setResolveClipError('Network error while searching for real film clips.');
    } finally {
      setResolvingClipId(null);
    }
  };

  const activeId =
    activeToken.lexiconId ??
    `film-word-${(activeToken.term ?? 'word').toLowerCase().replace(/\s+/g, '-')}`;
  const isSaved = difficultIds.has(activeId);

  const markedCount = matchedTermsByEpisodeId.size;
  const phrasalCount = allEpisodes.filter(
    (e) => e.targetCategory === 'phrasal'
  ).length;
  const idiomCount = allEpisodes.filter(
    (e) => e.targetCategory === 'idiom'
  ).length;
  const wordCount = allEpisodes.filter(
    (e) => e.targetCategory === 'word'
  ).length;

  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-8 pt-8 pb-20">
      {/* Editorial Header */}
      <header className="text-center max-w-2xl mx-auto mb-10">
        <span className="font-[var(--font-display)] text-xs uppercase tracking-[0.22em] text-secondary font-semibold block mb-2">
          Fascicle VI · Real Cinema Clips
        </span>
        <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl text-primary tracking-tight leading-[1.1] [text-wrap:balance]">
          Part VI · Film Episodes
        </h1>
        <p className="text-on-surface-variant text-sm sm:text-base italic mt-3 leading-relaxed">
          Authentic 4–5 second clips from classic Hollywood &amp; British films
          where actors speak real idioms, phrasal verbs, and B2–C2 vocabulary in
          context.
        </p>
      </header>

      {/* Filter & Search Bar + Real Film Clip Strip */}
      <section className="mb-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center bg-surface-container p-1 rounded-lg gap-0.5">
            {(
              [
                { key: 'all', label: `All Clips (${allEpisodes.length})` },
                ...(markedCount > 0
                  ? [
                      {
                        key: 'marked' as const,
                        label: `Marked Idioms & Phrasals (${markedCount})`,
                      },
                    ]
                  : []),
                { key: 'phrasal', label: `Phrasal Verbs (${phrasalCount})` },
                { key: 'idiom', label: `Idioms (${idiomCount})` },
                { key: 'word', label: `Words (${wordCount})` },
                ...(generatedEpisodes.length > 0
                  ? [
                      {
                        key: 'generated' as const,
                        label: `Generated (${generatedEpisodes.length})`,
                      },
                    ]
                  : []),
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 rounded text-xs font-[var(--font-display)] uppercase tracking-wider whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  filter === tab.key
                    ? 'bg-primary text-on-primary font-semibold'
                    : 'text-on-surface-variant hover:text-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search film, idiom, or phrasal verb..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-xs text-primary focus:outline-none focus:border-secondary"
              />
            </div>

            {deletedClassicIds.length > 0 && (
              <button
                type="button"
                onClick={handleRestoreClassicEpisodes}
                className="px-2.5 py-1.5 rounded-lg bg-surface-container hover:bg-secondary-fixed text-xs font-[var(--font-display)] text-secondary cursor-pointer transition-colors whitespace-nowrap"
              >
                Restore Classic ({deletedClassicIds.length})
              </button>
            )}
          </div>
        </div>

        {/* Clip Cards Grid */}
        {filteredEpisodes.length === 0 ? (
          <div className="p-6 rounded-xl bg-surface-container-low border border-outline-variant/40 text-center text-sm text-on-surface-variant italic">
            No film clips matched your search. Clear the filter or restore deleted clips to browse cinema scenes.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {filteredEpisodes.map((ep) => {
              const isSelected = currentEpisode?.id === ep.id;
              const matchedTerms = matchedTermsByEpisodeId.get(ep.id);
              return (
                <div
                  key={ep.id}
                  className={`relative rounded-xl border transition-colors p-3 text-left flex flex-col justify-between gap-2 ${
                    isSelected
                      ? 'bg-surface-container-lowest border-secondary shadow-sm'
                      : 'bg-surface-container-low/80 border-outline-variant/40 hover:bg-surface-container-lowest'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => focusAndPlayEpisode(ep)}
                    className="text-left w-full cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <span className="font-[var(--font-display)] text-[10px] uppercase tracking-wider text-secondary font-semibold truncate">
                        {ep.sceneTag}
                      </span>
                      <span className="text-[10px] font-mono text-on-surface-variant tabular-nums shrink-0">
                        {ep.durationSec.toFixed(1)}s
                      </span>
                    </div>
                    <h2 className="font-[var(--font-display)] text-lg text-primary font-bold leading-snug">
                      {ep.targetTerm || ep.filmTitle}
                    </h2>
                    <p className="text-xs text-on-surface-variant truncate mt-0.5">
                      {ep.filmTitle}
                    </p>
                    {matchedTerms && matchedTerms.length > 0 && (
                      <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-[var(--font-display)] text-[10px] font-semibold">
                        Marked: {matchedTerms[0]}
                      </span>
                    )}
                    {ep.status === 'generating' && (
                      <span className="inline-flex items-center gap-1 mt-1.5 ml-1 text-[10px] text-secondary font-[var(--font-display)]">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Rendering MP4
                      </span>
                    )}
                  </button>

                  <div className="flex items-center justify-between pt-1.5 border-t border-outline-variant/25 text-[11px] text-on-surface-variant">
                    <span className="italic truncate">{ep.episodeTitle}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteEpisode(ep.id, ep.kind);
                      }}
                      title="Delete film clip"
                      aria-label={`Delete ${ep.targetTerm || ep.episodeTitle}`}
                      className="text-on-surface-variant hover:text-error p-0.5 rounded cursor-pointer shrink-0 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Main Real Cinema Video Stage + Dossier & Studio */}
      {currentEpisode && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: Real Film MP4 Video Player & Spoken Line Breakdown (7 cols) */}
          <section className="lg:col-span-7 space-y-6">
            <div
              ref={videoStageRef}
              className="bg-surface-container-lowest rounded-xl border border-outline-variant/50 shadow-sm overflow-hidden"
            >
              {/* Film Title Strip */}
              <div className="px-5 py-3.5 bg-surface-container-low border-b border-outline-variant/30 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-[var(--font-display)] text-[11px] uppercase tracking-[0.18em] text-secondary font-semibold block">
                    {currentEpisode.filmTitle} · {currentEpisode.releaseYear}
                  </span>
                  <h2 className="font-[var(--font-display)] text-2xl text-primary leading-tight">
                    {currentEpisode.episodeTitle}
                  </h2>
                </div>
                {currentEpisode.targetTerm && (
                  <button
                    type="button"
                    onClick={() => focusAndPlayEpisode(currentEpisode)}
                    title="Play film scene for this expression"
                    className="bg-secondary-fixed hover:bg-secondary hover:text-on-secondary text-on-secondary-fixed px-3 py-1 rounded font-[var(--font-display)] text-xs font-bold tracking-wide cursor-pointer transition-colors"
                  >
                    Target: {currentEpisode.targetTerm}
                  </button>
                )}
              </div>

              {/* Real Cinema Video Clip (YouTube Film Scene or Classic MP4) */}
              <div className="bg-[#120e0d] p-3 flex justify-center">
                {currentEpisode.embedUrl ? (
                  <div className="w-full">
                    <iframe
                      ref={iframeRef}
                      key={currentEpisode.embedUrl}
                      src={currentEpisode.embedUrl}
                      title={`${currentEpisode.filmTitle} — ${currentEpisode.targetTerm || currentEpisode.episodeTitle}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full aspect-video rounded bg-black border-0"
                    />
                  </div>
                ) : currentEpisode.videoUrl ? (
                  <div className="relative w-full flex justify-center">
                    <video
                      ref={videoRef}
                      key={currentEpisode.videoUrl}
                      src={currentEpisode.videoUrl}
                      controls
                      playsInline
                      loop={loopClip}
                      preload="metadata"
                      onPlay={() => stopSpeaking()}
                      onPause={() => stopSpeaking()}
                      onEnded={() => stopSpeaking()}
                      className={
                        currentEpisode.aspectRatio === '9:16'
                          ? 'w-full max-w-[340px] aspect-[9/16] rounded bg-black object-contain'
                          : 'w-full aspect-video rounded bg-black object-contain'
                      }
                    />
                  </div>
                ) : (
                  <div className="w-full aspect-video rounded bg-[#16100f] border border-white/10 flex flex-col items-center justify-center text-center p-6 gap-3">
                    <Film className="w-8 h-8 text-[#ffb2bc]" />
                    <div>
                      <p className="font-[var(--font-display)] text-lg text-[#fef9f0]">
                        {currentEpisode.targetTerm || currentEpisode.episodeTitle}
                      </p>
                      <p className="text-xs text-[#d0c4c0] mt-1">
                        Locate an authentic film scene with real actor dialogue for this expression.
                      </p>
                      {resolveClipError && (
                        <p className="text-xs text-[#ffb2bc] mt-2">
                          {resolveClipError}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={resolvingClipId === currentEpisode.id}
                      onClick={() => handleResolveRealClip(currentEpisode.id)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded bg-[#8f4955] hover:bg-[#a65865] disabled:opacity-60 text-[#fef9f0] font-[var(--font-display)] text-xs uppercase tracking-wider cursor-pointer transition-colors"
                    >
                      {resolvingClipId === currentEpisode.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Finding Real Movie Clip…</span>
                        </>
                      ) : (
                        <>
                          <Search className="w-3.5 h-3.5" />
                          <span>Find Real Movie Clip</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Spoken Line & Subtitle Plaque Directly Beneath Real Video */}
              {currentEpisode.cues[0] && (
                <div className="px-5 py-4 bg-[#191311] text-[#fef9f0] border-t border-white/10">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-[var(--font-display)] text-[11px] uppercase tracking-[0.2em] text-[#ffb2bc]">
                        {currentEpisode.cues[0].speaker}
                      </span>
                      {currentEpisode.cues[0].startSec > 0 && (
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-[#ffd9dd]">
                          @ {Math.floor(currentEpisode.cues[0].startSec / 60)}:
                          {String(Math.floor(currentEpisode.cues[0].startSec % 60)).padStart(2, '0')}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#d0c4c0] italic">
                      Click highlighted phrase to inspect &amp; save
                    </span>
                  </div>

                  <p className="text-base sm:text-lg leading-relaxed">
                    {currentEpisode.cues[0].tokens.map((tok, i) =>
                      tok.term ? (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setActiveToken(tok);
                            focusAndPlayEpisode(currentEpisode, {
                              seekSec: currentEpisode.cues[0]?.startSec ?? 0,
                              cueIndex: 0,
                            });
                          }}
                          className={`inline mx-0.5 px-2 py-0.5 rounded font-semibold underline decoration-[#ffb2bc] decoration-2 underline-offset-4 transition-colors cursor-pointer ${
                            activeToken.term?.toLowerCase() ===
                            tok.term.toLowerCase()
                              ? 'bg-secondary text-white'
                              : 'bg-[#ffd9dd]/20 hover:bg-secondary/80 text-[#ffd9dd]'
                          }`}
                        >
                          {tok.text}
                        </button>
                      ) : (
                        <React.Fragment key={i}>{tok.text}</React.Fragment>
                      )
                    )}
                  </p>

                  {showAzSubtitles && currentEpisode.cues[0].azSubtitle && (
                    <p className="mt-2 text-xs sm:text-sm italic text-[#d0c4c0]">
                      <span className="not-italic font-semibold text-[#ffb2bc] mr-1.5">
                        AZ:
                      </span>
                      {currentEpisode.cues[0].azSubtitle}
                    </p>
                  )}
                </div>
              )}

              {/* Quick Clip Controls */}
              <div className="px-5 py-3 bg-surface-container-low border-t border-outline-variant/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                <p className="text-on-surface-variant italic">
                  {currentEpisode.directorNote}
                </p>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {currentEpisode.kind === 'generated' && currentEpisode.targetTerm && (
                    <button
                      type="button"
                      disabled={resolvingClipId === currentEpisode.id}
                      onClick={() => handleResolveRealClip(currentEpisode.id)}
                      title="Re-match real film clip and sync spoken quote + Azerbaijani translation"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container hover:bg-secondary-fixed text-secondary font-[var(--font-display)] uppercase tracking-wider text-[11px] cursor-pointer disabled:opacity-60"
                    >
                      {resolvingClipId === currentEpisode.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Search className="w-3.5 h-3.5" />
                      )}
                      <span>Sync Clip Quote</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleReplayClip}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-on-primary hover:bg-primary-container font-[var(--font-display)] uppercase tracking-wider text-[11px] cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Replay Clip</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLoopClip((l) => !l)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded font-[var(--font-display)] uppercase tracking-wider text-[11px] cursor-pointer ${
                      loopClip
                        ? 'bg-secondary-fixed text-on-secondary-fixed font-semibold'
                        : 'bg-surface-container text-on-surface-variant hover:text-primary'
                    }`}
                  >
                    <Repeat className="w-3.5 h-3.5" />
                    <span>Loop</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAzSubtitles((v) => !v)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded font-[var(--font-display)] uppercase tracking-wider text-[11px] cursor-pointer ${
                      showAzSubtitles
                        ? 'bg-secondary text-on-secondary font-semibold'
                        : 'bg-surface-container text-on-surface-variant hover:text-primary'
                    }`}
                  >
                    <Languages className="w-3.5 h-3.5" />
                    <span>AZ</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive Dialogue Script */}
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/50 shadow-sm p-6">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-outline-variant/30">
                <div>
                  <span className="font-[var(--font-display)] text-xs uppercase tracking-[0.18em] text-secondary font-semibold block">
                    Sentence Breakdown
                  </span>
                  <h3 className="font-[var(--font-display)] text-2xl text-primary">
                    Clickable Words &amp; Idioms in Scene
                  </h3>
                </div>
                <Film className="w-5 h-5 text-secondary" aria-hidden="true" />
              </div>

              <div className="space-y-3">
                {currentEpisode.cues.map((cue, cueIndex) => {
                  const plainLine = cue.tokens.map((t) => t.text).join('');
                  const hasPreAnnotatedTokens = cue.tokens.some((t) =>
                    Boolean(t.term)
                  );

                  return (
                    <div
                      key={cue.id}
                      className="p-4 rounded-lg border bg-surface-container-low/60 border-outline-variant/30"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-[var(--font-display)] text-xs uppercase tracking-wider font-bold text-primary">
                          {cue.speaker}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSpeak(plainLine)}
                          title="Read sentence slowly in UK English"
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container hover:bg-secondary-fixed text-secondary text-[11px] font-[var(--font-display)] cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Hear Slow</span>
                        </button>
                      </div>

                      <p className="text-base text-primary leading-relaxed">
                        {hasPreAnnotatedTokens
                          ? cue.tokens.map((tok, idx) =>
                              tok.term ? (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    setActiveToken(tok);
                                    focusAndPlayEpisode(currentEpisode, {
                                      seekSec: cue.startSec,
                                      cueIndex,
                                    });
                                  }}
                                  className={`inline px-1.5 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                                    activeToken.term?.toLowerCase() ===
                                    tok.term.toLowerCase()
                                      ? 'bg-secondary text-on-secondary'
                                      : 'bg-secondary-fixed/70 hover:bg-secondary-fixed text-on-secondary-fixed'
                                  }`}
                                >
                                  {tok.text}
                                </button>
                              ) : (
                                <React.Fragment key={idx}>
                                  {tok.text}
                                </React.Fragment>
                              )
                            )
                          : plainLine.split(/(\s+)/).map((wordPart, idx) => {
                              if (/^\s+$/.test(wordPart)) return wordPart;
                              const clean = wordPart
                                .replace(/[^a-zA-Z'-]/g, '')
                                .toLowerCase();
                              const matched = allWords.some(
                                (w) => w.term.toLowerCase() === clean
                              );
                              const selected =
                                activeToken.term?.toLowerCase() === clean;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() =>
                                    handleLookupWord(wordPart, plainLine)
                                  }
                                  className={`inline px-0.5 rounded transition-colors cursor-pointer ${
                                    selected
                                      ? 'bg-secondary text-on-secondary font-semibold'
                                      : matched
                                        ? 'bg-secondary-fixed/70 hover:bg-secondary-fixed font-medium'
                                        : 'hover:bg-surface-container-high'
                                  }`}
                                >
                                  {wordPart}
                                </button>
                              );
                            })}
                      </p>

                      <p className="text-xs text-on-surface-variant italic mt-2">
                        <span className="text-secondary font-semibold not-italic mr-1.5">
                          AZ:
                        </span>
                        {cue.azSubtitle}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* RIGHT: Unknown Word / Idiom Dossier + AI Video Studio (5 cols) */}
          <aside className="lg:col-span-5 space-y-6">
            {/* Episode Word Dossier */}
            <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/50 shadow-sm">
              <div className="flex items-start justify-between gap-2 pb-2">
                <div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-[var(--font-display)] uppercase tracking-widest text-on-surface-variant">
                      Episode Word Dossier
                    </span>
                    <span className="text-secondary" aria-hidden="true">
                      ❦
                    </span>
                    <span className="bg-secondary-fixed text-on-secondary-fixed px-2 py-0.5 rounded font-[var(--font-display)] text-[11px] uppercase font-semibold">
                      {activeToken.badge || 'Film Vocabulary'}
                    </span>
                  </div>
                  <h3 className="font-[var(--font-display)] text-4xl text-primary tracking-tight mt-1 leading-none">
                    {activeToken.term || 'Select a word'}
                  </h3>
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
              </div>

              {/* Azerbaijani Gloss */}
              <div className="bg-surface-container-low p-4 rounded-lg border border-outline-variant/30 my-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-[var(--font-display)] text-[11px] uppercase tracking-widest text-secondary font-bold">
                    ❖ Azərbaycan Dili Tərcüməsi
                  </span>
                  <Languages className="w-3.5 h-3.5 text-secondary" />
                </div>
                <p className="font-[var(--font-display)] text-xl text-primary font-semibold">
                  {activeToken.azTranslation}
                </p>
                {activeToken.badge === 'Film Episode Word' && (
                  <input
                    type="text"
                    value={customAzNote}
                    onChange={(e) => {
                      setCustomAzNote(e.target.value);
                      setActiveToken((prev) => ({
                        ...prev,
                        azTranslation:
                          e.target.value.trim() ||
                          'Add Azerbaijani translation below before saving',
                      }));
                    }}
                    placeholder="Enter custom Azerbaijani meaning..."
                    className="mt-2 w-full px-2.5 py-1.5 rounded bg-surface-container-lowest text-xs border border-outline-variant/50 focus:outline-none focus:border-secondary"
                  />
                )}
              </div>

              {activeToken.definition && (
                <p className="text-sm text-on-surface leading-relaxed mb-4">
                  {activeToken.definition}
                </p>
              )}

              {activeToken.exampleEn && (
                <div className="bg-surface-container p-3.5 rounded-lg mb-4 space-y-1 border border-outline-variant/30">
                  <span className="font-[var(--font-display)] text-[11px] uppercase tracking-wider text-secondary font-semibold block">
                    Film Sentence Example
                  </span>
                  <blockquote className="text-sm italic text-primary leading-relaxed">
                    “{activeToken.exampleEn}”
                  </blockquote>
                  {activeToken.exampleAz && (
                    <p className="text-xs text-on-surface-variant">
                      <span className="text-secondary font-semibold mr-1">
                        AZ:
                      </span>
                      {activeToken.exampleAz}
                    </p>
                  )}
                </div>
              )}

              {activeToken.etymology && (
                <div className="bg-surface-container-high/60 p-3 rounded-lg mb-4 flex items-start gap-2.5">
                  <Network className="w-4 h-4 text-on-surface-variant mt-0.5 shrink-0" />
                  <p className="text-xs text-on-surface">
                    {activeToken.etymology}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  onToggleDifficult({
                    id: activeId,
                    term: activeToken.term || activeToken.text,
                    category: activeToken.category || 'word',
                    badge: activeToken.badge || 'Film Vocabulary',
                    ipa: activeToken.ipa || '/—/',
                    azTranslation:
                      activeToken.azTranslation || 'Saved from Film Clip',
                    definition:
                      activeToken.definition ||
                      'Encountered during real cinema study.',
                    exampleEn:
                      activeToken.exampleEn ||
                      `Spoken in “${currentEpisode.filmTitle}”.`,
                    exampleAz: activeToken.exampleAz,
                    etymologyNote: activeToken.etymology,
                  })
                }
                className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded font-[var(--font-display)] text-sm tracking-wider transition-colors cursor-pointer ${
                  isSaved
                    ? 'bg-secondary text-on-secondary font-semibold'
                    : 'bg-primary hover:bg-primary-container text-on-primary'
                }`}
              >
                <Star className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
                <span>
                  {isSaved
                    ? 'Saved in Difficult Words'
                    : '+ Mark as Difficult Word'}
                </span>
              </button>

              {episodeGlossary.length > 0 && (
                <div className="mt-5 pt-4 border-t border-outline-variant/30">
                  <span className="font-[var(--font-display)] text-[11px] uppercase tracking-wider text-on-surface-variant block mb-2">
                    Featured Expression in Clip
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {episodeGlossary.map((tok) => {
                      const active =
                        activeToken.term?.toLowerCase() ===
                        tok.term?.toLowerCase();
                      return (
                        <button
                          key={tok.term}
                          type="button"
                          onClick={() => {
                            setActiveToken(tok);
                            focusAndPlayEpisode(currentEpisode, { seekSec: 0 });
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-[var(--font-display)] transition-colors cursor-pointer ${
                            active
                              ? 'bg-secondary text-on-secondary font-semibold'
                              : 'bg-surface-container hover:bg-secondary-fixed text-primary'
                          }`}
                        >
                          {tok.term}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Cinema Scene Studio (Text-to-Video & Photo-to-Video) */}
            <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/50 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-[var(--font-display)] text-[11px] uppercase tracking-[0.18em] text-secondary font-semibold block">
                    Cinema Scene Studio
                  </span>
                  <h3 className="font-[var(--font-display)] text-2xl text-primary leading-tight">
                    Generate Custom Video Clip
                  </h3>
                </div>
                <Clapperboard
                  className="w-5 h-5 text-secondary shrink-0"
                  aria-hidden="true"
                />
              </div>

              <div className="grid grid-cols-2 gap-1.5 bg-surface-container p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setStudioTab('text-to-video');
                    setStudioError(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-[var(--font-display)] uppercase tracking-wider cursor-pointer transition-colors ${
                    studioTab === 'text-to-video'
                      ? 'bg-primary text-on-primary font-semibold'
                      : 'text-on-surface-variant hover:text-primary'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Text → Video</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStudioTab('image-to-video');
                    setStudioError(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-[var(--font-display)] uppercase tracking-wider cursor-pointer transition-colors ${
                    studioTab === 'image-to-video'
                      ? 'bg-primary text-on-primary font-semibold'
                      : 'text-on-surface-variant hover:text-primary'
                  }`}
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>Photo → Video</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="font-[var(--font-display)] text-xs uppercase tracking-wider text-on-surface-variant">
                  Aspect Ratio
                </span>
                <div className="flex items-center gap-1.5 bg-surface-container p-1 rounded-lg">
                  {(['16:9', '9:16'] as const).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => setAspectRatio(ratio)}
                      className={`px-3 py-1 rounded text-xs font-mono cursor-pointer transition-colors ${
                        aspectRatio === ratio
                          ? 'bg-secondary text-on-secondary font-semibold'
                          : 'text-on-surface-variant hover:text-primary'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              {studioError && (
                <div className="p-3 rounded-lg bg-error-container text-on-error-container text-xs leading-relaxed">
                  {studioError}
                </div>
              )}

              {studioSuccess && (
                <div className="p-3 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed text-xs leading-relaxed">
                  {studioSuccess}
                </div>
              )}

              {studioTab === 'text-to-video' ? (
                <form onSubmit={handleGenerateTextVideo} className="space-y-3">
                  <div>
                    <label className="block font-[var(--font-display)] text-xs uppercase tracking-wider text-on-surface-variant mb-1">
                      Film Title
                    </label>
                    <input
                      type="text"
                      value={filmTitleInput}
                      onChange={(e) => setFilmTitleInput(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-surface-container-lowest text-sm text-primary border border-outline-variant/50 focus:outline-none focus:border-secondary"
                    />
                  </div>

                  <div>
                    <label className="block font-[var(--font-display)] text-xs uppercase tracking-wider text-on-surface-variant mb-1">
                      Visual Scene Prompt
                    </label>
                    <textarea
                      rows={3}
                      value={promptInput}
                      onChange={(e) => setPromptInput(e.target.value)}
                      className="w-full p-2.5 rounded bg-surface-container-lowest text-xs text-primary border border-outline-variant/50 focus:outline-none focus:border-secondary leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="block font-[var(--font-display)] text-xs uppercase tracking-wider text-on-surface-variant mb-1">
                      Scene Dialogue / Words Script
                    </label>
                    <textarea
                      rows={2}
                      value={scriptInput}
                      onChange={(e) => setScriptInput(e.target.value)}
                      className="w-full p-2.5 rounded bg-surface-container-lowest text-xs text-primary border border-outline-variant/50 focus:outline-none focus:border-secondary leading-relaxed"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isGenerating}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded bg-primary hover:bg-primary-container disabled:opacity-60 text-on-primary font-[var(--font-display)] text-sm tracking-wider cursor-pointer transition-colors"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Generating ({aspectRatio})...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-secondary-fixed" />
                        <span>Generate Video from Text</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleAnimateImageVideo} className="space-y-3">
                  <div>
                    <label className="block font-[var(--font-display)] text-xs uppercase tracking-wider text-on-surface-variant mb-1">
                      Upload Still Photograph (PNG / JPEG / WebP)
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full p-3 rounded-lg border border-dashed border-outline-variant hover:border-secondary bg-surface-container-lowest text-xs text-on-surface-variant flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <ImagePlus className="w-4 h-4 text-secondary" />
                      <span>
                        {uploadedImageName
                          ? `Selected: ${uploadedImageName}`
                          : 'Choose Photograph to Animate'}
                      </span>
                    </button>

                    {uploadedImageDataUrl && (
                      <div className="mt-2 rounded-lg overflow-hidden border border-outline-variant/40 bg-black/5">
                        <img
                          src={uploadedImageDataUrl}
                          alt="Uploaded scene frame preview"
                          className="w-full h-32 object-cover"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block font-[var(--font-display)] text-xs uppercase tracking-wider text-on-surface-variant mb-1">
                      Motion &amp; Camera Prompt
                    </label>
                    <textarea
                      rows={3}
                      value={motionPromptInput}
                      onChange={(e) => setMotionPromptInput(e.target.value)}
                      className="w-full p-2.5 rounded bg-surface-container-lowest text-xs text-primary border border-outline-variant/50 focus:outline-none focus:border-secondary leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="block font-[var(--font-display)] text-xs uppercase tracking-wider text-on-surface-variant mb-1">
                      Scene Dialogue / Vocabulary Script
                    </label>
                    <textarea
                      rows={2}
                      value={scriptInput}
                      onChange={(e) => setScriptInput(e.target.value)}
                      className="w-full p-2.5 rounded bg-surface-container-lowest text-xs text-primary border border-outline-variant/50 focus:outline-none focus:border-secondary leading-relaxed"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isGenerating}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded bg-primary hover:bg-primary-container disabled:opacity-60 text-on-primary font-[var(--font-display)] text-sm tracking-wider cursor-pointer transition-colors"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Animating Photo ({aspectRatio})...</span>
                      </>
                    ) : (
                      <>
                        <Clapperboard className="w-4 h-4 text-secondary-fixed" />
                        <span>Animate Photo into Video</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
