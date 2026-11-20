# AUREON AI

**Your World. Your AI.** — Premium Gold AI Media Studio.

## Current stage

### Stage 1 — Web UI
Responsive Burmese-first React + TypeScript + Vite dashboard with five recap modes, video library, subtitle, voice and publishing sections.

### Stage 2 — Local backend
- Express API, JSON-backed project/source/job persistence.
- Local video uploads with MIME allow-list and configurable size limit.
- Authorized URL metadata registration (no remote download).
- Optional bearer-token API protection.

### Stage 3 — Real media preparation
- FFmpeg/FFprobe validates uploaded video duration and audio stream.
- Extracts mono 16 kHz WAV audio into 10-minute chunks, supporting long source videos.
- Stores job status, progress, output path, chunk count and failure details.
- Re-enqueues queued/processing jobs after server restart (re-extracts from the beginning; per-chunk checkpoint resume is not yet implemented).
- Docker runtime includes FFmpeg and a persistent data volume.

## Run locally

Requirements: Node.js 20+ and FFmpeg/FFprobe on PATH.

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:5173. API health: http://127.0.0.1:8787/api/health.

## Docker

```bash
docker build -t aureon-ai .
docker run --rm -p 8787:8787 -v aureon-data:/app/storage/data aureon-ai
```

## Capability boundary

The FFmpeg audio preparation pipeline is implemented and covered by CI smoke tests. It does **not** perform AI story analysis, script generation, transcription, Myanmar TTS, voice cloning, scene-aware video editing, final video rendering, subtitle synchronization/export, remote URL downloads, cloud storage, managed database, social OAuth, automatic publishing or Android packaging. A job marked `media_ready` means audio chunks were extracted, not that a recap video was generated.

## Principles
- Free-tier-first; no paid billing without explicit approval.
- Process only videos the user owns or is authorized to use.
- Keep API/provider keys and OAuth secrets server-side.
- Development server binds to localhost. Public deployment needs production authentication, HTTPS, rate limits, managed database and object storage.
- Verify every integration end-to-end before showing it as active.
