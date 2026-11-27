# The Crown

**The Crown** is a full-stack English–Azerbaijani vocabulary, idiom, phrasal verb, reading, and cinema-context learning studio built with React, TypeScript, Vite, Tailwind CSS, and Express.

---

## Features

The application is organized into seven focused learning modules:

1. **01. Words** — B1–C2 vocabulary archive with British IPA phonetics, parts of speech, etymology notes, literary example sentences, Azerbaijani translations, pronunciation audio, and filtering/search.
2. **02. Idioms** — Figurative English idioms paired with natural Azerbaijani equivalents, semantic nuances, origin lore, and contextual examples.
3. **03. Phrasal Verbs** — Academic and conversational phrasal verbs with separability/syntax notes and bilingual examples.
4. **04. Difficult Words (Ledger & Quizzer)** — Personal review ledger synced to persistent storage with interactive flashcards/quizzes and a manual **«Videoda izlə»** button to locate a real film scene for any saved word or expression.
5. **05. Story & Article Reader** — Interactive reading room with clickable words/idioms for instant lookup, Azerbaijani translation, and quick saving to the Difficult Words ledger.
6. **06. Film Episodes** — Authentic live-action movie and classic TV clips (`<= 40s`) where the target expression is genuinely spoken in dialogue, featuring English subtitles enabled by default (`EN CC`), Azerbaijani subtitle translations, and clickable dialogue tokens.
7. **07. Documents** — Drag-and-drop document studio supporting **PDF**, **DOCX**, **TXT**, **MD**, **RTF**, and **HTML** files. Extracts vocabulary (including bold-highlighted target terms from PDFs/DOCX), translates and enriches entries into study cards, runs targeted quizzes, and lets learners approve mastered words directly into **01. Words**.

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Motion
- **Backend:** Node.js, Express (`server.ts` + Vite dev middleware)
- **Document Parsing:** `unpdf` (PDF), `mammoth` (DOCX), custom RTF/HTML/text extractors
- **AI & Translation:** `@google/genai` (server-side Gemini integration with translation & dictionary fallbacks)
- **Media & Video Clipping:** `ffmpeg` (for slicing verified classic cinema & TV scenes into `<= 40s` H.264/AAC MP4 clips)

---

## Prerequisites

- **Node.js** 20+
- **npm** (or `bun`)
- **ffmpeg** installed on `PATH` (required for slicing local MP4 clips from the curated classic cinema subtitle corpus in Section 06)

---

## Getting Started

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd <repo-folder>
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

   | Variable | Required | Description |
   | --- | --- | --- |
   | `GEMINI_API_KEY` | Optional (Recommended) | Server-side Google Gemini API key for custom word lookups, document vocabulary enrichment, and AI scene features. |
   | `APP_URL` | Optional | Public URL where the app is hosted. |

4. **Run in development mode**
   ```bash
   npm run dev
   ```
   The Express + Vite server starts on **http://localhost:3000**.

5. **Type-check and build for production**
   ```bash
   npm run lint
   npm run build
   npm start
   ```

---

## Available Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Starts the Express backend with Vite middleware on port `3000` via `tsx server.ts`. |
| `npm start` | Runs the production server (`node server.ts`) serving `dist/`. |
| `npm run build` | Builds the React frontend bundle into `dist/`. |
| `npm run lint` | Runs TypeScript type checking (`tsc --noEmit`). |
| `npm run clean` | Removes `dist/` and compiled `server.js`. |

---

## Project Structure

```text
├── server.ts                        # Express API, document extraction, lexicon lookup & clip pipeline
├── server/
│   └── classicCinemaCorpus.ts       # Curated cinema/TV SRT matcher & ffmpeg MP4 slicer
├── src/
│   ├── App.tsx                      # Root application state & section routing
│   ├── components/
│   │   ├── Header.tsx               # Top navigation & Difficult Words ledger counter
│   │   ├── WordsSection.tsx         # 01. Words archive
│   │   ├── IdiomsSection.tsx        # 02. Idioms archive
│   │   ├── PhrasalVerbsSection.tsx  # 03. Phrasal Verbs archive
│   │   ├── DifficultWordsSection.tsx# 04. Difficult Words ledger, quizzer & Watch-in-Video trigger
│   │   ├── StoryReaderSection.tsx   # 05. Interactive Story & Article reader
│   │   ├── FilmEpisodesSection.tsx  # 06. Real film scene player with EN/AZ subtitles
│   │   └── DocumentsSection.tsx     # 07. PDF/DOCX/TXT document extractor, cards & quizzer
│   ├── data/                        # Built-in lexicon, idioms, phrasals, readings, classic episodes
│   ├── types/lexicon.ts             # Shared TypeScript domain interfaces
│   └── utils/speech.ts              # Browser speech synthesis helpers
├── data/
│   ├── db.json                      # Local JSON persistence (ledger, custom lexicon, workspaces, episodes)
│   ├── subtitles-cache/             # Curated English film/TV subtitle manifests & SRT files
│   └── videos/                      # Sliced MP4 film clips served via /api/videos/file/:filename
├── .env.example                     # Environment variable template
├── index.html
├── package.json
└── vite.config.ts
```

---

## Key API Endpoints

- `GET /api/health` — Server health check
- `GET /api/difficult-words` & `PUT /api/difficult-words` — Read/save difficult words ledger
- `GET /api/custom-lexicon` & `PUT /api/custom-lexicon` — Read/save custom words, idioms, and phrasals
- `POST /api/translate-word` — Analyze, classify, and translate an English word or expression to Azerbaijani
- `POST /api/documents/extract` & `POST /api/documents/analyze-words` — Extract text/bold terms from uploaded documents and enrich vocabulary cards
- `GET /api/document-workspaces`, `PUT /api/document-workspaces`, `DELETE /api/document-workspaces/:id` — Manage document study workspaces
- `GET /api/episodes`, `POST /api/episodes/from-lexicon`, `DELETE /api/episodes/:id` — Fetch, generate, and manage spoken film episodes
- `GET /api/videos/file/:filename` — Stream locally sliced film scene MP4s
