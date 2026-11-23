import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  Edit3,
  FileText,
  HelpCircle,
  Loader2,
  RotateCcw,
  Trash2,
  UploadCloud,
  Volume2,
  XCircle,
} from 'lucide-react';
import {
  CefrLevel,
  DocumentExtractedWord,
  DocumentVocabWorkspace,
  WordEntry,
} from '../types/lexicon';
import { lookupLocalStoryWord } from '../data/storyDictionary';
import { speakEnglish } from '../utils/speech';

interface DocumentsSectionProps {
  allWords: WordEntry[];
  onApproveWordsToSectionOne: (
    approvedWords: DocumentExtractedWord[],
    sourceDocTitle: string
  ) => number;
  onJumpToSectionOne: () => void;
}

type WorkspaceTab = 'cards' | 'quiz';
type CardFilter = 'all' | 'pending' | 'approved';
type QuizMode = 'en-to-az' | 'az-to-en' | 'context-to-en';

interface QuizQuestion {
  word: DocumentExtractedWord;
  mode: QuizMode;
  promptLabel: string;
  promptMain: string;
  contextHint?: string;
  correctOption: string;
  options: string[];
}

const STORAGE_WORKSPACES_KEY = 'the_crown_doc_workspaces_v1';
const CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const ACCEPTED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.txt',
  '.md',
  '.rtf',
  '.csv',
  '.html',
  '.htm',
]);

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function maskTermInSentence(sentence: string, term: string): string {
  if (!sentence || !term) return sentence;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return sentence.replace(new RegExp(`\\b${escaped}[a-z]*\\b`, 'gi'), '_____');
}

function parseCefrFromBadge(badge?: string): CefrLevel | null {
  if (!badge) return null;
  const m = badge.match(/\b(A1|A2|B1|B2|C1|C2)\b/i);
  return m ? (m[1].toUpperCase() as CefrLevel) : null;
}

export const DocumentsSection: React.FC<DocumentsSectionProps> = ({
  allWords,
  onApproveWordsToSectionOne,
  onJumpToSectionOne,
}) => {
  const [workspaces, setWorkspaces] = useState<DocumentVocabWorkspace[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_WORKSPACES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage errors
    }
    return [];
  });

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    () => workspaces[0]?.id ?? null
  );
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('cards');
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null);
  const [approvalBanner, setApprovalBanner] = useState<string | null>(null);

  // Card inline editing state
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [editAzValue, setEditAzValue] = useState('');
  const [editLevelValue, setEditLevelValue] = useState<CefrLevel>('B2');
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  // Quiz state
  const [quizMode, setQuizMode] = useState<QuizMode>('en-to-az');
  const [quizSeed, setQuizSeed] = useState(1);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [quizCorrectIds, setQuizCorrectIds] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasHydratedRef = useRef(false);

  // Hydrate workspaces from backend on mount
  useEffect(() => {
    let active = true;
    fetch('/api/document-workspaces')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        if (
          data &&
          Array.isArray(data.workspaces) &&
          data.workspaces.length > 0
        ) {
          const loaded = data.workspaces as DocumentVocabWorkspace[];
          setWorkspaces(loaded);
          setActiveWorkspaceId((prev) =>
            prev && loaded.some((w) => w.id === prev) ? prev : loaded[0].id
          );
        }
        hasHydratedRef.current = true;
      })
      .catch(() => {
        hasHydratedRef.current = true;
      });
    return () => {
      active = false;
    };
  }, []);

  // Persist workspaces locally & to backend (after initial hydration)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_WORKSPACES_KEY, JSON.stringify(workspaces));
    } catch {
      // Ignore storage quota errors
    }
    if (!hasHydratedRef.current) return;
    fetch('/api/document-workspaces', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaces }),
    }).catch(() => {});
  }, [workspaces]);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId]
  );

  const existingSection1Set = useMemo(() => {
    return new Set(allWords.map((w) => w.term.trim().toLowerCase()));
  }, [allWords]);

  const filteredWords = useMemo(() => {
    if (!activeWorkspace) return [];
    return activeWorkspace.words.filter((w) => {
      const isInSec1 =
        Boolean(w.approvedToSection1) ||
        existingSection1Set.has(w.term.trim().toLowerCase());
      if (cardFilter === 'pending') return !isInSec1;
      if (cardFilter === 'approved') return isInSec1;
      return true;
    });
  }, [activeWorkspace, cardFilter, existingSection1Set]);

  const counts = useMemo(() => {
    if (!activeWorkspace) return { total: 0, approved: 0, pending: 0, withAz: 0 };
    let approved = 0;
    let withAz = 0;
    for (const w of activeWorkspace.words) {
      if (
        w.approvedToSection1 ||
        existingSection1Set.has(w.term.trim().toLowerCase())
      ) {
        approved++;
      }
      if (w.azTranslation.trim()) withAz++;
    }
    return {
      total: activeWorkspace.words.length,
      approved,
      pending: activeWorkspace.words.length - approved,
      withAz,
    };
  }, [activeWorkspace, existingSection1Set]);

  // Ensure sensible quiz mode based on whether extracted words have AZ translations
  useEffect(() => {
    if (!activeWorkspace) return;
    const hasAz = activeWorkspace.words.some((w) => w.azTranslation.trim().length > 0);
    if (!hasAz && quizMode !== 'context-to-en') {
      setQuizMode('context-to-en');
    }
  }, [activeWorkspace, quizMode]);

  // Build quiz questions from active document's words
  const quizQuestions: QuizQuestion[] = useMemo(() => {
    if (!activeWorkspace || activeWorkspace.words.length === 0) return [];
    const pool = activeWorkspace.words;
    const eligible =
      quizMode === 'context-to-en'
        ? pool
        : pool.filter((w) => w.azTranslation.trim().length > 0);

    const sourceList = eligible.length > 0 ? eligible : pool;
    const picked = shuffleArray(sourceList).slice(0, Math.min(8, sourceList.length));

    return picked.map((word) => {
      const effectiveMode: QuizMode =
        quizMode !== 'context-to-en' && word.azTranslation.trim().length > 0
          ? quizMode
          : 'context-to-en';

      if (effectiveMode === 'en-to-az') {
        const correctOption = word.azTranslation.trim();
        const azDistractors: string[] = [];
        const candidates = shuffleArray([
          ...pool.map((w) => w.azTranslation.trim()),
          ...allWords.map((w) => w.azTranslation.trim()),
        ]);
        for (const cand of candidates) {
          if (
            cand &&
            cand.toLowerCase() !== correctOption.toLowerCase() &&
            !azDistractors.includes(cand)
          ) {
            azDistractors.push(cand);
          }
          if (azDistractors.length === 3) break;
        }
        return {
          word,
          mode: effectiveMode,
          promptLabel: 'Bu sözün Azərbaycan dilində mənası nədir?',
          promptMain: word.term,
          contextHint: word.exampleEn,
          correctOption,
          options: shuffleArray([correctOption, ...azDistractors]),
        };
      }

      // AZ -> EN or Context/Definition -> EN
      const correctOption = word.term;
      const enDistractors: string[] = [];
      const enCandidates = shuffleArray([
        ...pool.map((w) => w.term),
        ...allWords.map((w) => w.term),
      ]);
      for (const cand of enCandidates) {
        if (
          cand &&
          cand.toLowerCase() !== correctOption.toLowerCase() &&
          !enDistractors.includes(cand)
        ) {
          enDistractors.push(cand);
        }
        if (enDistractors.length === 3) break;
      }

      if (effectiveMode === 'az-to-en') {
        return {
          word,
          mode: effectiveMode,
          promptLabel: 'Aşağıdakı mənaya uyğun ingiliscə sözü seçin:',
          promptMain: word.azTranslation.trim(),
          contextHint: maskTermInSentence(word.exampleEn, word.term),
          correctOption,
          options: shuffleArray([correctOption, ...enDistractors]),
        };
      }

      return {
        word,
        mode: 'context-to-en',
        promptLabel: 'İzaha və cümləyə əsasən uyğun sözü tapın:',
        promptMain: word.definition,
        contextHint: maskTermInSentence(word.exampleEn, word.term),
        correctOption,
        options: shuffleArray([correctOption, ...enDistractors]),
      };
    });
  }, [activeWorkspace, quizMode, quizSeed, allWords]);

  useEffect(() => {
    setQuestionIndex(0);
    setSelectedOption(null);
    setSubmitted(false);
    setScore(0);
    setQuizFinished(false);
    setQuizCorrectIds([]);
  }, [quizSeed, quizMode, activeWorkspaceId]);

  const currentQuestion = quizQuestions[questionIndex];

  const handleSpeak = (id: string, term: string) => {
    setSpeakingId(id);
    speakEnglish(term, () => setSpeakingId(null));
    setTimeout(() => setSpeakingId((prev) => (prev === id ? null : prev)), 1200);
  };

  const updateWorkspaceWord = (
    workspaceId: string,
    wordId: string,
    patch: Partial<DocumentExtractedWord>
  ) => {
    setWorkspaces((prev) =>
      prev.map((ws) =>
        ws.id !== workspaceId
          ? ws
          : {
              ...ws,
              words: ws.words.map((w) => (w.id === wordId ? { ...w, ...patch } : w)),
            }
      )
    );
  };

  const removeWorkspaceWord = (workspaceId: string, wordId: string) => {
    setWorkspaces((prev) =>
      prev.map((ws) =>
        ws.id !== workspaceId
          ? ws
          : {
              ...ws,
              words: ws.words.filter((w) => w.id !== wordId),
            }
      )
    );
  };

  const handleApproveSingle = (word: DocumentExtractedWord) => {
    if (!activeWorkspace) return;
    const addedCount = onApproveWordsToSectionOne([word], activeWorkspace.title);
    updateWorkspaceWord(activeWorkspace.id, word.id, {
      approvedToSection1: true,
    });
    setApprovalBanner(
      addedCount > 0
        ? `“${word.term}” təsdiqləndi və yalnız Section 01-ə (Words) əlavə edildi.`
        : `“${word.term}” artıq Section 01-də mövcuddur və təsdiqlənmiş kimi qeyd olundu.`
    );
  };

  const handleApproveMany = (targetWords: DocumentExtractedWord[]) => {
    if (!activeWorkspace || targetWords.length === 0) return;
    const addedCount = onApproveWordsToSectionOne(
      targetWords,
      activeWorkspace.title
    );
    const targetIds = new Set(targetWords.map((w) => w.id));
    setWorkspaces((prev) =>
      prev.map((ws) =>
        ws.id !== activeWorkspace.id
          ? ws
          : {
              ...ws,
              words: ws.words.map((w) =>
                targetIds.has(w.id) ? { ...w, approvedToSection1: true } : w
              ),
            }
      )
    );
    setApprovalBanner(
      addedCount > 0
        ? `${addedCount} təsdiqlənmiş söz yalnız Section 01-ə (Words) əlavə edildi.`
        : 'Seçilmiş bütün sözlər artıq Section 01-də (Words) mövcuddur.'
    );
  };

  const handleDeleteWorkspace = async (workspaceId: string) => {
    setWorkspaces((prev) => {
      const next = prev.filter((w) => w.id !== workspaceId);
      if (activeWorkspaceId === workspaceId) {
        setActiveWorkspaceId(next[0]?.id ?? null);
      }
      return next;
    });
    fetch(`/api/document-workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'DELETE',
    }).catch(() => {});
  };

  const processFile = async (file: File) => {
    setUploadError(null);
    setAnalysisWarning(null);
    setApprovalBanner(null);

    const extMatch = file.name.toLowerCase().match(/(\.[a-z0-9]+)$/);
    const ext = extMatch?.[1] ?? '';
    if (ext === '.doc') {
      setUploadError(
        'Köhnə .doc formatı dəstəklənmir. Zəhmət olmasa sənədi .docx, .pdf və ya .txt formatında yükləyin.'
      );
      return;
    }
    if (ext && !ACCEPTED_EXTENSIONS.has(ext)) {
      setUploadError(
        'Dəstəklənən formatlar: PDF, DOCX, TXT, MD, RTF, CSV, HTML.'
      );
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setUploadError('Fayl 20 MB limitini aşır. Daha kiçik sənəd seçin.');
      return;
    }

    setIsProcessing(true);
    setProcessingStage('Sənəd oxunur (PDF / DOCX / Mətn)...');

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('Fayl oxuna bilmədi.'));
        };
        reader.onerror = () => reject(new Error('Fayl oxuna bilmədi.'));
        reader.readAsDataURL(file);
      });

      const extractRes = await fetch('/api/documents/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          dataBase64: dataUrl,
        }),
      });
      const extractPayload = await extractRes.json();
      if (!extractRes.ok || !extractPayload?.document?.text) {
        throw new Error(
          extractPayload?.error || 'Sənəddən mətn çıxarmaq mümkün olmadı.'
        );
      }

      const doc = extractPayload.document as {
        id: string;
        title: string;
        fileName: string;
        format: string;
        wordCount: number;
        pageCount?: number;
        text: string;
      };

      setProcessingStage('Sözlər və mənaları hazırlanır...');

      // Collect local dictionary hints from WordsData + StoryDictionary so known words resolve immediately
      const rawTokens = Array.from(
        new Set(
          (doc.text.toLowerCase().match(/\b[a-z]{4,24}\b/g) ?? []).slice(0, 400)
        )
      );
      const localHints: Array<{
        term: string;
        ipa?: string;
        level?: string;
        partOfSpeech?: string;
        azTranslation?: string;
        definition?: string;
        etymology?: string;
        exampleAz?: string;
      }> = [];

      const wordsLookup = new Map(
        allWords.map((w) => [w.term.trim().toLowerCase(), w])
      );

      for (const token of rawTokens) {
        const wHit = wordsLookup.get(token);
        if (wHit) {
          localHints.push({
            term: wHit.term,
            ipa: wHit.ipa,
            level: wHit.level,
            partOfSpeech: wHit.partOfSpeech,
            azTranslation: wHit.azTranslation,
            definition: wHit.definition,
            etymology: wHit.etymology,
            exampleAz: wHit.exampleAz,
          });
          continue;
        }
        const sHit = lookupLocalStoryWord(token);
        if (sHit) {
          localHints.push({
            term: sHit.term,
            ipa: sHit.ipa,
            level: parseCefrFromBadge(sHit.badge) ?? 'B1',
            partOfSpeech: sHit.badge.split('·')[1]?.trim() || 'Lexicon',
            azTranslation: sHit.azTranslation,
            definition: sHit.definition,
            etymology: sHit.etymology,
          });
        }
      }

      const analyzeRes = await fetch('/api/documents/analyze-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: doc.title,
          fileName: doc.fileName,
          format: doc.format,
          wordCount: doc.wordCount,
          pageCount: doc.pageCount,
          text: doc.text,
          localHints,
        }),
      });
      const analyzePayload = await analyzeRes.json();
      if (!analyzeRes.ok || !analyzePayload?.workspace) {
        throw new Error(
          analyzePayload?.error || 'Sənəddən sözlər çıxarıla bilmədi.'
        );
      }

      const workspace = analyzePayload.workspace as DocumentVocabWorkspace;
      if (analyzePayload.warning) {
        setAnalysisWarning(String(analyzePayload.warning));
      }

      setWorkspaces((prev) =>
        [workspace, ...prev.filter((w) => w.id !== workspace.id)].slice(0, 15)
      );
      setActiveWorkspaceId(workspace.id);
      setActiveTab('cards');
      setCardFilter('all');
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : 'Sənəd emal edilərkən xəta baş verdi.'
      );
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  const handleStartEdit = (w: DocumentExtractedWord) => {
    setEditingWordId(w.id);
    setEditAzValue(w.azTranslation);
    setEditLevelValue(w.level);
  };

  const handleSaveEdit = (wordId: string) => {
    if (!activeWorkspace) return;
    updateWorkspaceWord(activeWorkspace.id, wordId, {
      azTranslation: editAzValue.trim(),
      level: editLevelValue,
    });
    setEditingWordId(null);
  };

  const handleSubmitAnswer = () => {
    if (!selectedOption || !currentQuestion || submitted) return;
    setSubmitted(true);
    if (selectedOption === currentQuestion.correctOption) {
      setScore((s) => s + 1);
      setQuizCorrectIds((prev) =>
        prev.includes(currentQuestion.word.id)
          ? prev
          : [...prev, currentQuestion.word.id]
      );
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

  return (
    <div className="w-full max-w-[1240px] mx-auto px-4 sm:px-8 pt-6 pb-16 flex flex-col gap-7">
      {/* Editorial Section Header */}
      <section className="bg-surface-container-low p-6 sm:p-8 rounded-xl border border-outline-variant/40">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div className="flex flex-col gap-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-[var(--font-display)] uppercase tracking-widest text-secondary font-semibold">
                Part VII · Document Vocabulary Lab
              </span>
              <span className="text-outline-variant" aria-hidden="true">
                ·
              </span>
              <span className="font-[var(--font-display)] italic text-on-surface-variant">
                PDF, DOCX &amp; Text Extraction
              </span>
            </div>
            <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl text-primary tracking-tight [text-wrap:balance]">
              Sənəd Yükləmə, Söz Kartları &amp; Quiz
            </h1>
            <p className="text-sm sm:text-base text-on-surface-variant">
              PDF, DOCX və ya mətn sənədlərini buraya sürükləyib atın. Sənəddəki əsas sözlər mənaları ilə birlikdə çıxarılır, quiz ilə yoxlanılır və təsdiqlədiyiniz sözlər{' '}
              <strong className="text-primary font-semibold">
                yalnız Section 01-ə (Words)
              </strong>{' '}
              əlavə olunur.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-surface-container px-4 py-3 rounded-lg border border-outline-variant/30 self-start lg:self-auto shrink-0">
            <div className="flex flex-col">
              <span className="font-[var(--font-display)] text-[11px] text-on-surface-variant uppercase tracking-wider">
                Sənədlər
              </span>
              <span className="font-[var(--font-display)] text-2xl text-primary font-bold tabular-nums">
                {workspaces.length}
              </span>
            </div>
            <div className="w-px h-8 bg-outline-variant/50" />
            <div className="flex flex-col">
              <span className="font-[var(--font-display)] text-[11px] text-secondary uppercase tracking-wider">
                Section 01-ə Təsdiq
              </span>
              <span className="font-[var(--font-display)] text-2xl text-primary italic tabular-nums">
                {counts.approved} / {counts.total}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Drag & Drop Upload Zone + Saved Documents Strip */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isDragging) setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          className={`lg:col-span-8 rounded-xl border-2 border-dashed p-6 sm:p-8 transition-colors flex flex-col items-center justify-center text-center gap-3 ${
            isDragging
              ? 'border-[#72313c] bg-[#72313c]/10'
              : 'border-outline-variant bg-surface-container-lowest hover:border-[#72313c]/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.rtf,.csv,.html,.htm"
            onChange={handleFileInputChange}
            className="hidden"
          />

          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-sm"
            style={{ backgroundColor: 'rgb(114, 49, 60)' }}
          >
            {isProcessing ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <UploadCloud className="w-6 h-6" />
            )}
          </div>

          {isProcessing ? (
            <div className="space-y-1">
              <p className="font-[var(--font-display)] text-xl text-primary font-semibold">
                {processingStage || 'Sənəd emal edilir...'}
              </p>
              <p className="text-xs text-on-surface-variant">
                Sözlər, IPA transkripsiyaları və mənalar çıxarılır.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <p className="font-[var(--font-display)] text-2xl text-primary">
                  Sənədi buraya sürükləyib buraxın (Drag &amp; Drop)
                </p>
                <p className="text-sm text-on-surface-variant">
                  Dəstəklənən formatlar: PDF, DOCX, TXT, MD, RTF, CSV, HTML (maks. 20 MB)
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 px-5 py-2.5 rounded-lg text-white font-[var(--font-display)] text-xs uppercase tracking-wider cursor-pointer transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'rgb(114, 49, 60)' }}
              >
                Fayl Seçin
              </button>
            </>
          )}
        </div>

        {/* Saved Documents List */}
        <div className="lg:col-span-4 bg-surface-container-low rounded-xl border border-outline-variant/40 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-[var(--font-display)] text-xs uppercase tracking-widest text-secondary font-semibold">
              Yüklənmiş Sənədlər
            </span>
            <span className="text-xs text-on-surface-variant tabular-nums">
              {workspaces.length} fayl
            </span>
          </div>

          {workspaces.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-6 px-3 text-xs text-on-surface-variant">
              <FileText className="w-6 h-6 text-outline mb-2" aria-hidden="true" />
              <p>Hələ heç bir sənəd yüklənməyib. Sol hissədən PDF, DOCX və ya TXT faylı əlavə edin.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[210px] overflow-y-auto pr-1">
              {workspaces.map((ws) => {
                const isSelected = ws.id === activeWorkspace?.id;
                const approvedInWs = ws.words.filter(
                  (w) =>
                    w.approvedToSection1 ||
                    existingSection1Set.has(w.term.trim().toLowerCase())
                ).length;
                return (
                  <div
                    key={ws.id}
                    className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-surface-container-lowest border-[#72313c] shadow-xs'
                        : 'bg-surface-container/60 border-outline-variant/30 hover:bg-surface-container'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveWorkspaceId(ws.id);
                        setApprovalBanner(null);
                      }}
                      className="text-left min-w-0 flex-1 cursor-pointer"
                    >
                      <p className="font-[var(--font-display)] text-sm font-semibold text-primary truncate">
                        {ws.title}
                      </p>
                      <p className="text-[11px] text-on-surface-variant truncate tabular-nums">
                        {ws.format} · {ws.words.length} söz · {approvedInWs} təsdiqlənib
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteWorkspace(ws.id)}
                      aria-label={`Delete ${ws.title}`}
                      className="p-1.5 rounded text-on-surface-variant hover:text-error hover:bg-surface-container cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Error / Warning / Approval Banners */}
      {uploadError && (
        <div className="px-4 py-3 rounded-xl bg-error-container/50 border border-error/40 text-on-error-container text-sm flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {analysisWarning && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-300/80 text-amber-900 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" />
          <span>{analysisWarning}</span>
        </div>
      )}

      {approvalBanner && (
        <div className="px-4 py-3 rounded-xl bg-tertiary-fixed/50 border border-tertiary-container/30 text-on-tertiary-fixed text-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-tertiary-container" />
            <span className="font-medium">{approvalBanner}</span>
          </div>
          <button
            type="button"
            onClick={onJumpToSectionOne}
            className="px-3 py-1.5 rounded bg-primary text-on-primary font-[var(--font-display)] text-xs uppercase tracking-wider hover:bg-primary-container transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>01. Words-a Bax</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Active Document Workspace */}
      {activeWorkspace && (
        <section className="flex flex-col gap-5">
          {/* Workspace Control Bar */}
          <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveTab('cards')}
                className={`px-4 py-2 rounded-lg font-[var(--font-display)] text-xs uppercase tracking-wider whitespace-nowrap shrink-0 transition-colors cursor-pointer inline-flex items-center gap-2 ${
                  activeTab === 'cards'
                    ? 'text-white font-semibold'
                    : 'bg-surface-container text-on-surface-variant hover:text-primary'
                }`}
                style={
                  activeTab === 'cards'
                    ? { backgroundColor: 'rgb(114, 49, 60)' }
                    : undefined
                }
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Söz Kartları ({activeWorkspace.words.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('quiz')}
                disabled={activeWorkspace.words.length === 0}
                className={`px-4 py-2 rounded-lg font-[var(--font-display)] text-xs uppercase tracking-wider whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-40 inline-flex items-center gap-2 ${
                  activeTab === 'quiz'
                    ? 'text-white font-semibold'
                    : 'bg-surface-container text-on-surface-variant hover:text-primary'
                }`}
                style={
                  activeTab === 'quiz'
                    ? { backgroundColor: 'rgb(114, 49, 60)' }
                    : undefined
                }
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Quiz Başlat</span>
              </button>

              {activeTab === 'cards' && (
                <div className="flex items-center gap-1 ml-0 sm:ml-2 bg-surface-container p-1 rounded-lg">
                  {(
                    [
                      { id: 'all', label: `Hamısı (${counts.total})` },
                      { id: 'pending', label: `Gözləyən (${counts.pending})` },
                      { id: 'approved', label: `Təsdiqlənmiş (${counts.approved})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setCardFilter(f.id)}
                      className={`px-2.5 py-1 rounded text-[11px] font-[var(--font-display)] uppercase tracking-wider cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                        cardFilter === f.id
                          ? 'bg-surface-container-lowest text-primary font-semibold shadow-2xs'
                          : 'text-on-surface-variant hover:text-primary'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                disabled={counts.pending === 0}
                onClick={() => {
                  const pending = activeWorkspace.words.filter(
                    (w) =>
                      !w.approvedToSection1 &&
                      !existingSection1Set.has(w.term.trim().toLowerCase())
                  );
                  handleApproveMany(pending);
                }}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary-container disabled:opacity-40 font-[var(--font-display)] text-xs uppercase tracking-wider whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:cursor-default inline-flex items-center gap-2"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Hamısını Təsdiqlə → Section 01</span>
              </button>
            </div>
          </div>

          {/* TAB 1: EXTRACTED WORD CARDS (rgb(114, 49, 60)) */}
          {activeTab === 'cards' && (
            <>
              {filteredWords.length === 0 ? (
                <div className="bg-surface-container-lowest p-10 rounded-xl border border-outline-variant/40 text-center">
                  <p className="font-[var(--font-display)] text-2xl text-primary mb-1">
                    Bu filtrdə söz tapılmadı
                  </p>
                  <p className="text-sm text-on-surface-variant">
                    Digər filtrləri seçin və ya yeni sənəd yükləyin.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredWords.map((word) => {
                    const isInSection1 =
                      Boolean(word.approvedToSection1) ||
                      existingSection1Set.has(word.term.trim().toLowerCase());
                    const isEditing = editingWordId === word.id;
                    const isSpeaking = speakingId === word.id;

                    return (
                      <article
                        key={word.id}
                        style={{ backgroundColor: 'rgb(114, 49, 60)' }}
                        className="rounded-xl p-5 text-[#fef9f0] border border-white/15 shadow-sm flex flex-col justify-between gap-4 transition-transform hover:-translate-y-0.5"
                      >
                        <div className="flex flex-col gap-3">
                          {/* Metadata Row (Unboxed typography per zero-pill discipline) */}
                          <div className="flex items-center justify-between gap-2 text-xs text-[#ffd9dd]">
                            <span className="font-[var(--font-display)] uppercase tracking-wider font-semibold">
                              {word.level} · {word.partOfSpeech} · {word.frequency}×
                            </span>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleSpeak(word.id, word.term)}
                                aria-label={`Listen to ${word.term}`}
                                className={`p-1.5 rounded transition-colors cursor-pointer ${
                                  isSpeaking
                                    ? 'bg-white text-[rgb(114,49,60)]'
                                    : 'text-[#ffd9dd] hover:bg-white/15 hover:text-white'
                                }`}
                              >
                                <Volume2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  isEditing
                                    ? setEditingWordId(null)
                                    : handleStartEdit(word)
                                }
                                aria-label={`Edit ${word.term}`}
                                className="p-1.5 rounded text-[#ffd9dd] hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  removeWorkspaceWord(activeWorkspace.id, word.id)
                                }
                                aria-label={`Remove ${word.term}`}
                                className="p-1.5 rounded text-[#ffd9dd] hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Headword & IPA */}
                          <div className="flex items-baseline gap-2.5 flex-wrap">
                            <h3 className="font-[var(--font-display)] text-2xl font-bold text-white tracking-tight">
                              {word.term}
                            </h3>
                            <span className="text-xs text-[#ffd9dd] italic">
                              {word.ipa}
                            </span>
                          </div>

                          {/* Azerbaijani Meaning (Display or Inline Edit) */}
                          {isEditing ? (
                            <div className="bg-black/25 p-3 rounded-lg border border-white/20 flex flex-col gap-2">
                              <label className="text-[11px] uppercase tracking-wider text-[#ffd9dd] font-[var(--font-display)]">
                                Azərbaycan mənası &amp; Səviyyə
                              </label>
                              <input
                                type="text"
                                value={editAzValue}
                                onChange={(e) => setEditAzValue(e.target.value)}
                                placeholder="Mənanı yazın..."
                                className="w-full px-2.5 py-1.5 rounded bg-white text-[#16110f] text-sm focus:outline-none"
                              />
                              <div className="flex items-center justify-between gap-2">
                                <select
                                  value={editLevelValue}
                                  onChange={(e) =>
                                    setEditLevelValue(e.target.value as CefrLevel)
                                  }
                                  className="px-2 py-1 rounded bg-white text-[#16110f] text-xs font-semibold"
                                >
                                  {CEFR_LEVELS.map((lvl) => (
                                    <option key={lvl} value={lvl}>
                                      {lvl}
                                    </option>
                                  ))}
                                </select>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditingWordId(null)}
                                    className="px-2.5 py-1 rounded text-xs text-[#ffd9dd] hover:bg-white/10 cursor-pointer"
                                  >
                                    Ləğv et
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveEdit(word.id)}
                                    className="px-3 py-1 rounded bg-white text-[rgb(114,49,60)] text-xs font-semibold cursor-pointer"
                                  >
                                    Yadda saxla
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-black/20 px-3.5 py-2.5 rounded-lg border border-white/15">
                              <span className="font-[var(--font-display)] text-[10px] uppercase tracking-widest text-[#ffd9dd] block mb-0.5">
                                Azərbaycan Mənası
                              </span>
                              {word.azTranslation ? (
                                <p className="font-[var(--font-display)] text-lg text-white italic leading-snug">
                                  {word.azTranslation}
                                </p>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(word)}
                                  className="text-xs text-[#ffd9dd] underline underline-offset-4 hover:text-white cursor-pointer text-left"
                                >
                                  Məna əlavə etmək üçün klikləyin...
                                </button>
                              )}
                            </div>
                          )}

                          {/* English Definition & Document Sentence */}
                          <p className="text-xs text-[#f6e7e9] leading-relaxed">
                            {word.definition}
                          </p>
                          <div className="bg-white/10 px-3 py-2 rounded-lg text-xs text-[#fef9f0]/95 italic leading-relaxed">
                            “{word.exampleEn}”
                          </div>
                        </div>

                        {/* Bottom Approval Action -> STRICTLY SECTION 1 */}
                        <div className="pt-2 border-t border-white/15 flex items-center justify-between gap-2">
                          {isInSection1 ? (
                            <div className="w-full flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-xs font-[var(--font-display)] uppercase tracking-wider text-[#c5ebd7] font-semibold">
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                <span>Section 01-də var</span>
                              </span>
                              <button
                                type="button"
                                onClick={onJumpToSectionOne}
                                className="text-xs text-[#ffd9dd] hover:text-white underline underline-offset-4 cursor-pointer whitespace-nowrap"
                              >
                                Section 01-ə keç
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleApproveSingle(word)}
                              className="w-full py-2 px-3 rounded-lg bg-[#fef9f0] text-[rgb(114,49,60)] hover:bg-white font-[var(--font-display)] text-xs uppercase tracking-wider font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Təsdiqlə → Section 01</span>
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* TAB 2: DOCUMENT QUIZ CHAMBER */}
          {activeTab === 'quiz' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Main Quiz Card */}
              <div className="lg:col-span-8 bg-surface-container-lowest p-6 sm:p-8 rounded-xl border border-outline-variant/50 shadow-sm flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-outline-variant/30">
                  <div>
                    <span className="font-[var(--font-display)] text-xs uppercase tracking-widest text-secondary font-semibold block">
                      Sənəd İmtahanı
                    </span>
                    <h2 className="font-[var(--font-display)] text-2xl text-primary">
                      {activeWorkspace.title}
                    </h2>
                  </div>

                  {/* Mode selector */}
                  <div className="flex items-center bg-surface-container p-1 rounded-lg gap-0.5 flex-wrap">
                    <button
                      type="button"
                      disabled={counts.withAz === 0}
                      onClick={() => setQuizMode('en-to-az')}
                      className={`px-2.5 py-1 rounded text-[11px] font-[var(--font-display)] uppercase cursor-pointer disabled:opacity-40 ${
                        quizMode === 'en-to-az'
                          ? 'bg-primary text-on-primary font-semibold'
                          : 'text-on-surface-variant hover:text-primary'
                      }`}
                    >
                      EN → AZ
                    </button>
                    <button
                      type="button"
                      disabled={counts.withAz === 0}
                      onClick={() => setQuizMode('az-to-en')}
                      className={`px-2.5 py-1 rounded text-[11px] font-[var(--font-display)] uppercase cursor-pointer disabled:opacity-40 ${
                        quizMode === 'az-to-en'
                          ? 'bg-primary text-on-primary font-semibold'
                          : 'text-on-surface-variant hover:text-primary'
                      }`}
                    >
                      AZ → EN
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuizMode('context-to-en')}
                      className={`px-2.5 py-1 rounded text-[11px] font-[var(--font-display)] uppercase cursor-pointer ${
                        quizMode === 'context-to-en'
                          ? 'bg-primary text-on-primary font-semibold'
                          : 'text-on-surface-variant hover:text-primary'
                      }`}
                    >
                      Məna → Söz
                    </button>
                  </div>
                </div>

                {quizQuestions.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="font-[var(--font-display)] text-xl text-primary mb-2">
                      Quiz üçün söz tapılmadı
                    </p>
                    <p className="text-sm text-on-surface-variant">
                      Əvvəlcə sənəd yükləyin ki, sözlər əsasında suallar hazırlansın.
                    </p>
                  </div>
                ) : quizFinished ? (
                  <div className="py-6 text-center flex flex-col items-center gap-4">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center text-white"
                      style={{ backgroundColor: 'rgb(114, 49, 60)' }}
                    >
                      <Award className="w-8 h-8" />
                    </div>
                    <div>
                      <span className="font-[var(--font-display)] text-xs uppercase tracking-widest text-secondary font-semibold">
                        Quiz Tamamlandı
                      </span>
                      <h3 className="font-[var(--font-display)] text-3xl text-primary font-bold mt-1 tabular-nums">
                        {score} / {quizQuestions.length} Düzgün
                      </h3>
                      <p className="text-sm text-on-surface-variant mt-1 max-w-md">
                        İndi bu sənəddəki sözləri təsdiqləyib{' '}
                        <strong>yalnız Section 01-ə (Words)</strong> əlavə edə bilərsiniz.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const testedWords = quizQuestions.map((q) => q.word);
                          handleApproveMany(testedWords);
                        }}
                        style={{ backgroundColor: 'rgb(114, 49, 60)' }}
                        className="px-5 py-2.5 rounded-lg text-white font-[var(--font-display)] text-xs uppercase tracking-wider font-semibold cursor-pointer hover:opacity-95 inline-flex items-center gap-2"
                      >
                        <Check className="w-4 h-4" />
                        <span>Quiz Sözlərini Təsdiqlə → Section 01</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setQuizSeed((s) => s + 1)}
                        className="px-4 py-2.5 rounded-lg bg-surface-container text-primary font-[var(--font-display)] text-xs uppercase tracking-wider hover:bg-surface-container-high cursor-pointer inline-flex items-center gap-2"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Yenidən Quiz Et</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-xs text-on-surface-variant">
                      <span className="font-[var(--font-display)] uppercase tracking-wider">
                        Sual {questionIndex + 1} / {quizQuestions.length}
                      </span>
                      <span className="tabular-nums font-medium">
                        Cari xal: {score}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wider font-[var(--font-display)] text-secondary font-semibold">
                        {currentQuestion.promptLabel}
                      </p>
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="font-[var(--font-display)] text-2xl sm:text-3xl text-primary font-bold leading-snug">
                          “{currentQuestion.promptMain}”
                        </p>
                        {currentQuestion.mode === 'en-to-az' && (
                          <button
                            type="button"
                            onClick={() =>
                              handleSpeak(
                                currentQuestion.word.id,
                                currentQuestion.word.term
                              )
                            }
                            aria-label={`Listen to ${currentQuestion.word.term}`}
                            className="p-2 rounded-full bg-surface-container text-primary hover:bg-surface-container-high cursor-pointer"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {currentQuestion.contextHint && (
                        <p className="text-sm text-on-surface-variant italic bg-surface-container-low px-3.5 py-2.5 rounded-lg">
                          “{currentQuestion.contextHint}”
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2.5">
                      {currentQuestion.options.map((opt, idx) => {
                        const letter = ['A', 'B', 'C', 'D'][idx];
                        const isSelected = selectedOption === opt;
                        const isCorrectOpt = opt === currentQuestion.correctOption;

                        let cardClasses =
                          'bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/40';
                        let badgeClasses = 'bg-surface-container-high text-primary';

                        if (!submitted && isSelected) {
                          cardClasses =
                            'bg-[rgb(114,49,60)] text-white border border-[rgb(114,49,60)]';
                          badgeClasses = 'bg-white text-[rgb(114,49,60)]';
                        } else if (submitted && isCorrectOpt) {
                          cardClasses =
                            'bg-tertiary-fixed/50 text-primary border border-tertiary-container/40';
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

                    {submitted && (
                      <div
                        className={`px-4 py-3 rounded-lg flex items-start justify-between gap-3 ${
                          selectedOption === currentQuestion.correctOption
                            ? 'bg-tertiary-fixed/40 text-on-tertiary-fixed'
                            : 'bg-error-container/40 text-on-error-container'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 text-xs">
                          {selectedOption === currentQuestion.correctOption ? (
                            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          )}
                          <div>
                            <span className="font-[var(--font-display)] font-bold uppercase tracking-wider block">
                              {selectedOption === currentQuestion.correctOption
                                ? 'Doğrudur'
                                : `Doğru cavab: ${currentQuestion.correctOption}`}
                            </span>
                            <p className="mt-0.5 opacity-90">
                              {currentQuestion.word.term} ({currentQuestion.word.ipa}) —{' '}
                              {currentQuestion.word.azTranslation ||
                                currentQuestion.word.definition}
                            </p>
                          </div>
                        </div>

                        {!currentQuestion.word.approvedToSection1 &&
                          !existingSection1Set.has(
                            currentQuestion.word.term.trim().toLowerCase()
                          ) && (
                            <button
                              type="button"
                              onClick={() =>
                                handleApproveSingle(currentQuestion.word)
                              }
                              style={{ backgroundColor: 'rgb(114, 49, 60)' }}
                              className="px-3 py-1.5 rounded text-white font-[var(--font-display)] text-[11px] uppercase tracking-wider shrink-0 cursor-pointer"
                            >
                              Təsdiqlə → Section 01
                            </button>
                          )}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <button
                        type="button"
                        disabled={!selectedOption || submitted}
                        onClick={handleSubmitAnswer}
                        style={{ backgroundColor: 'rgb(114, 49, 60)' }}
                        className="px-5 py-2.5 rounded text-white font-[var(--font-display)] text-xs uppercase tracking-wider disabled:opacity-40 cursor-pointer disabled:cursor-default"
                      >
                        Cavabı Yoxla
                      </button>

                      <button
                        type="button"
                        disabled={!submitted}
                        onClick={handleNextQuestion}
                        className="px-4 py-2.5 rounded bg-surface-container text-primary font-[var(--font-display)] text-xs uppercase tracking-wider hover:bg-surface-container-high disabled:opacity-40 cursor-pointer disabled:cursor-default inline-flex items-center gap-1.5"
                      >
                        <span>
                          {questionIndex + 1 >= quizQuestions.length
                            ? 'Quizi Bitir'
                            : 'Növbəti Sual'}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Right Sidebar: Quick Approval Summary of Tested Words */}
              <aside className="lg:col-span-4 bg-surface-container-low p-5 rounded-xl border border-outline-variant/40 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-[var(--font-display)] text-xs uppercase tracking-widest text-secondary font-semibold">
                    Quiz Sözləri &amp; Təsdiq
                  </span>
                  <span className="text-xs text-on-surface-variant tabular-nums">
                    {quizCorrectIds.length} düzgün
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant">
                  Buradan təsdiqlədiyiniz sözlər birbaşa <strong>Section 01 (Words)</strong> bölməsinə əlavə olunur.
                </p>
                <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1">
                  {quizQuestions.map(({ word }) => {
                    const isApproved =
                      Boolean(word.approvedToSection1) ||
                      existingSection1Set.has(word.term.trim().toLowerCase());
                    return (
                      <div
                        key={word.id}
                        style={{ backgroundColor: 'rgb(114, 49, 60)' }}
                        className="p-3 rounded-lg text-white flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="font-[var(--font-display)] text-sm font-bold truncate">
                            {word.term}
                          </p>
                          <p className="text-[11px] text-[#ffd9dd] truncate">
                            {word.azTranslation || word.definition}
                          </p>
                        </div>
                        {isApproved ? (
                          <span className="text-[11px] text-[#c5ebd7] font-semibold shrink-0 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>S01</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleApproveSingle(word)}
                            className="px-2.5 py-1 rounded bg-[#fef9f0] text-[rgb(114,49,60)] text-[11px] font-bold uppercase tracking-wider shrink-0 cursor-pointer hover:bg-white"
                          >
                            Təsdiqlə
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </aside>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
