# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # Start HTTP server (port 3000)
npm run server         # Same as above
npm run generate       # CLI mode (src/index.js)
npm run electron       # Launch Electron desktop app
npm run build          # Build Windows executable via electron-builder
```

Docker: `docker build -t masal . && docker run -p 3000:3000 --env-file .env masal`

## Architecture

MASAL is a personalized Turkish children's storybook generator. A child's photo + name + story template → AI-generated 3D Pixar-style illustrated PDF book.

### Pipeline (BookOrchestrator)

```
Phase 1: INIT        → Load book.json, prepare child photo, personalize texts
Phase 2: PROFILE     → Generate 3D character reference from child photo
Phase 2.5: OUTFITS   → Generate outfit-specific profiles (parallel)
Phase 3: SCENES      → Generate all scenes in parallel batches of 7
Phase 4: FINALIZE    → Cover/dedication/fun-fact pages, text overlays, PDF assembly
```

### 4-Agent System (`src/agents/`)

- **BookOrchestrator** — Coordinates full pipeline, manages SSE progress, file I/O
- **PromptArchitect** — Builds optimized image prompts; book.json scene prompt is the "star", agent adds context
- **SceneGenerator** — Wraps image provider API; batch parallel generation, child photo caching
- **QualityValidator** — Gemini Vision 2.0 Flash validates outfit/style/composition/face consistency

### Image Providers (`src/api/`, selectable via `IMAGE_PROVIDER` env)

- **kie** (recommended) — Async with polling or webhook callback (`CALLBACK_URL`). Cheapest option.
- **google** — Gemini image generation
- **fal** — Fal.ai nano-banana-pro

### Entry Points

- **Web**: `src/server.js` — HTTP server with SSE progress, multipart upload, static file serving
- **Desktop**: `electron-main.js` — Electron wrapper
- **CLI**: `src/index.js` — Standalone generation

### Key Server Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/generate` | POST | Start book generation (multipart: bookId, childName, childGender, childAge, childPhoto) |
| `/api/progress` | GET | SSE stream for real-time progress (supports reconnection with `?replay=1`) |
| `/api/kie-callback` | POST | Webhook endpoint for Kie.ai async results |
| `/api/books` | GET | List available story templates |
| `/api/outputs` | GET | List generated books |
| `/api/rerender-scene` | POST | Re-generate a single scene |
| `/api/rebuild-pdf` | POST | Rebuild PDF from existing images |

## Story Structure (`src/stories/{id}/book.json`)

Each story defines: id, title, ageGroup, style description, characterDescription, theme (colors/icon), scenes array, and optional funFacts. Scenes have: sceneNumber, outfitId, title, text (Turkish, uses `{CHILD_NAME}`), prompt (English, starts with `CHARACTER_DESC`), mood, setting.

The outfit system groups scenes by clothing. The prompt must end with the 3D CGI style suffix (Ice Age/Shrek style).

## Environment Variables

See `.env.example`. Key ones: `KIE_API_KEY`, `IMAGE_PROVIDER=kie`, `IMAGE_RESOLUTION=2K`, `CALLBACK_URL` (enables webhook mode for Kie.ai), `OPENAI_API_KEY` (text personalization), `GEMINI_VISION_ENABLED` (quality validation).

## Constants (`src/constants.js`)

Canvas: 1785×2526 (3:4 portrait). PDF: A4. Upload limit: 50MB. SSE buffer: 50 events. Validation thresholds: outfit 70, style 65, overall 60, face 60. Max regen attempts: 1.

## Language

All story texts and UI are in Turkish. Image generation prompts are in English. Code comments are in Turkish.

## Deployment

Production runs on Railway (Docker). Auto-deploys from `main` branch on GitHub (`movement00/masal`). Railway env vars must include all API keys + `CALLBACK_URL` for webhook mode.
