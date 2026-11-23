export type SectionId =
  | 'words'
  | 'idioms'
  | 'phrasal-verbs'
  | 'difficult-words'
  | 'story-reader'
  | 'film-episodes'
  | 'documents';

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type CefrGroup = 'all' | 'A1-A2' | 'B1-B2' | 'C1-C2';

export type LexiconCategory = 'word' | 'idiom' | 'phrasal';

export type VideoAspectRatio = '16:9' | '9:16';

export interface WordEntry {
  id: string;
  category: 'word';
  term: string;
  ipa: string;
  level: CefrLevel;
  partOfSpeech: string;
  etymology: string;
  azTranslation: string;
  definition: string;
  exampleEn: string;
  exampleAz: string;
  relationLabel: 'Collocations' | 'Synonyms' | 'Antonyms' | 'Derivatives';
  relatedTerms: string[];
  folioRef: string;
  isCustom?: boolean;
}

export type IdiomRegister =
  | 'IELTS Band 7.5+'
  | 'Academic Register'
  | 'Everyday Colloquial';

export interface IdiomEntry {
  id: string;
  category: 'idiom';
  term: string;
  ipa: string;
  levelBadge: string;
  registerGroup: IdiomRegister;
  azEquivalent: string;
  azNuance: string;
  semanticValue: string;
  loreTitle: string;
  loreText: string;
  imageUrl?: string;
  imageAlt?: string;
  exampleEn: string;
  exampleAz: string;
  registerNote: string;
  tipNote: string;
  folioRef: string;
}

export interface PhrasalVerbEntry {
  id: string;
  category: 'phrasal';
  term: string;
  rootStem: string;
  particle: string;
  ipa: string;
  levelBadge: string;
  grammarTag: string;
  azTranslation: string;
  syntaxNote: string;
  definition: string;
  exampleEn: string;
  exampleAz: string;
  folioRef: string;
  lexCode: string;
}

export interface DifficultItem {
  id: string;
  term: string;
  category: LexiconCategory;
  badge: string;
  ipa: string;
  azTranslation: string;
  definition: string;
  exampleEn: string;
  exampleAz?: string;
  etymologyNote?: string;
  addedAt: number;
  masteredCount?: number;
}

export interface ReadingToken {
  text: string;
  lexiconId?: string;
  term?: string;
  badge?: string;
  category?: LexiconCategory;
  ipa?: string;
  azTranslation?: string;
  azSubNote?: string;
  definition?: string;
  exampleEn?: string;
  exampleAz?: string;
  etymology?: string;
}

export interface ReadingParagraph {
  tokens: ReadingToken[];
  azSummary?: string;
}

export interface ReadingWork {
  id: string;
  mode: 'story' | 'article';
  tomeLabel: string;
  chapterLabel: string;
  title: string;
  subtitle: string;
  levelBadge: string;
  folioLabel: string;
  readingTime: string;
  illustrationUrl?: string;
  illustrationCaption?: string;
  illustrationSubcaption?: string;
  illustrationAlt?: string;
  paragraphs: ReadingParagraph[];
}

export interface FilmCue {
  id: string;
  startSec: number;
  endSec: number;
  speaker: string;
  tokens: ReadingToken[];
  azSubtitle: string;
}

export interface FilmEpisode {
  id: string;
  kind: 'classic' | 'generated';
  sourceSection?: 'reader' | 'studio' | 'classic';
  status?: 'generating' | 'ready' | 'audio-only';
  generationError?: string;
  filmTitle: string;
  releaseYear: string;
  directorNote: string;
  episodeTitle: string;
  sceneTag: string;
  targetTerm?: string;
  targetCategory?: LexiconCategory;
  durationSec: number;
  aspectRatio: VideoAspectRatio;
  videoSource?: 'classic-mp4' | 'youtube-film' | 'studio-mp4';
  embedUrl?: string;
  posterUrl?: string;
  videoUrl?: string;
  promptUsed?: string;
  cues: FilmCue[];
  createdAt: number;
}

export interface BoldExtractedEntry {
  term: string;
  partOfSpeechHint?: string;
  definitionHint?: string;
  exampleHint?: string;
  lineText?: string;
}

export interface DocumentExtractedWord {
  id: string;
  term: string;
  ipa: string;
  level: CefrLevel;
  partOfSpeech: string;
  azTranslation: string;
  definition: string;
  etymology?: string;
  exampleEn: string;
  exampleAz?: string;
  frequency: number;
  approvedToSection1?: boolean;
}

export interface DocumentVocabWorkspace {
  id: string;
  title: string;
  fileName: string;
  format: string;
  wordCount: number;
  pageCount?: number;
  extractionMode?: 'bold' | 'glossary' | 'keywords';
  text: string;
  words: DocumentExtractedWord[];
  createdAt: number;
}
