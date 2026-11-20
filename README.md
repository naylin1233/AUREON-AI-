# AUREON AI

**Your World. Your AI.** — Premium Gold AI Media Studio.

## Stage 1 — Web UI foundation

A responsive Burmese-first React + TypeScript + Vite dashboard for:
- Donghua recap project setup with five recap modes;
- authorized video upload / URL intake UI;
- video library placeholder;
- Myanmar + English subtitle studio placeholder;
- Myanmar-only voice setup placeholder (no English fallback);
- YouTube, Facebook and TikTok publishing setup UI;
- Premium Gold theme and mobile navigation.

## Run locally

Requirements: Node.js 20+

```bash
npm install
npm run dev
npm run build
```

## Honest implementation status

This branch is the **Stage 1 frontend foundation**, not a completed AI media production system. AI script generation, real Myanmar TTS, long-video chunk processing, scene-aware rendering, subtitle synchronization, persistent cloud storage, OAuth, scheduled publishing, and Android packaging are not implemented or verified yet. The UI must not be treated as if those integrations are active.

## Project constraints

- Prefer free tiers; do not enable paid billing without explicit approval.
- Process only media the user owns, licenses, or is otherwise authorized to use.
- Keep API keys and OAuth secrets server-side; never commit secrets.
- Do not claim TTS/render/publishing success until end-to-end tests pass.
- Android packaging follows a verified web/backend foundation.
