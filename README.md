# AUREON AI

**Your World. Your AI.** — Premium Gold AI Media Studio.

## Current stage

### Stage 1 — Web UI
Responsive Burmese-first React + TypeScript + Vite dashboard with recap modes, video library, subtitle, voice, and social publishing sections.

### Stage 2 — Local backend foundation
- Express API health check and Vite development proxy.
- Project creation and JSON-backed persistence.
- Local video upload with MIME allow-list and configurable size limit.
- Authorized URL metadata registration (does not download remote files).
- Recap job records persisted as `awaiting_pipeline` until a real worker exists.
- Optional bearer-token API protection.

## Run locally

Requirements: Node.js 20+

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:5173. API health is at http://127.0.0.1:8787/api/health.

## Important capability boundary

The project is **not yet a complete AI video production system**. AI story analysis/script generation, real Myanmar TTS, personal voice support, scene extraction, 1–2 hour resumable video processing, rendering, subtitle synchronization/export, durable worker queue, cloud storage, OAuth, automatic publishing, and Android packaging are not yet implemented or verified. Jobs created by this version remain `awaiting_pipeline`; the UI must not imply that generation has started.

## Principles

- Free-tier-first. No paid billing without explicit approval.
- Only process videos the user owns or is authorized to use.
- Keep provider keys and OAuth secrets on the server; never commit them.
- Bind local development server to localhost. Do not deploy publicly without production authentication, HTTPS, rate limiting, persistent database and object storage.
- Verify each integration end-to-end before showing it as active.
