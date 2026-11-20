# AUREON AI backend — Stage 2/3 foundation

## Implemented
- Express API health endpoint and Vite proxy.
- JSON-backed project, source and job persistence.
- Local video uploads with MIME allow-list and configurable size limit.
- URL source metadata registration only (no remote media download).
- FFmpeg/FFprobe worker for uploaded local video:
  - validates duration and audio stream;
  - extracts mono 16 kHz PCM WAV into 10-minute chunks;
  - records progress, chunk count, output directory and errors;
  - re-enqueues queued/processing jobs after server restart, reuses validated completed chunks, and reprocesses incomplete chunks.
- Job status endpoint: `GET /api/jobs/:id`.
- Optional bearer-token API protection via `AUREON_API_TOKEN`.
- Azure Burmese TTS adapter for Nilar/Thiha standard voices; stays disabled until server-side key and region are configured. No English fallback.
- Gemini Interactions API adapter for Burmese recap-script drafts from user-provided transcripts; default model `gemini-3.8-flash`, disabled until server-side `GEMINI_API_KEY` is configured.
- Production frontend static serving from `dist/`.
- Docker image installs FFmpeg and persists `/app/storage/data`.

## Run locally
Requirements: Node.js 20+ and FFmpeg/FFprobe installed and available on PATH.

```bash
npm install
cp .env.example .env
npm run dev
```
Web UI: http://127.0.0.1:5173
API health: http://127.0.0.1:8787/api/health

## Docker
```bash
docker build -t aureon-ai .
docker run --rm -p 8787:8787 -v aureon-data:/app/storage/data aureon-ai
```
For a public deployment, configure a strong `AUREON_API_TOKEN`, HTTPS and a trusted reverse proxy. The sample container is a single-user foundation, not a hardened multi-tenant service.

## Storage and processing
Local data lives under `storage/data/` (ignored by Git). Uploaded files are under `uploads/`; extracted chunks are under `processed/<job-id>/`. Back up this directory. A two-hour source creates approximately twelve ten-minute WAV chunks. Chunk extraction is actual FFmpeg work; it is not AI transcription or recap generation.

## Not implemented yet
No automatic speech recognition/transcript extraction, long-video transcript orchestration, Myanmar TTS voice cloning, scene-aware video editing/rendering, subtitle alignment/export, distributed job queue, remote URL downloading, cloud object storage, managed database, social OAuth, scheduled/automatic publishing, or Android package. Jobs reach `media_ready` only after audio extraction. Gemini script generation accepts a manually supplied transcript; video transcription and recap rendering have not started.

## Safety and cost
- Bind to localhost by default; do not expose the development server publicly.
- Keep API/provider keys server-side; never commit secrets.
- Process only media the user owns or is authorized to use.
- Free-tier-first; do not enable paid billing without explicit approval.

## Subtitle workspace

The browser-side subtitle editor imports SRT/WebVTT, maintains separate Myanmar and English text tracks matched by timestamps, and exports each language to SRT or WebVTT. It is a manual editing tool; it does not automatically transcribe, translate, or align speech.

## Burmese TTS configuration

Set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in the private server environment to enable the standard Burmese voices `my-MM-NilarNeural` and `my-MM-ThihaNeural`. The integration returns a clear 503 while credentials are absent and never falls back to English. Use the Azure Free (F0) tier only; do not upgrade to a paid tier without explicit approval. Live audio generation has not been verified until a valid resource is configured. Personal voice cloning is not included.

## Gemini recap-script configuration

Set `GEMINI_API_KEY` in the private server environment. Fixed model: `gemini-3.8-flash` (no paid-model override). The API accepts a user-provided transcript up to 30,000 characters and returns a Burmese draft in the selected recap mode. The API requires explicit user consent before sending. Transcripts are sent to Google for processing and are not stored by this endpoint. Google states that Free Tier content may be used to improve its products. Do not submit private or sensitive material without appropriate permission. Check current model access and free-tier quota first; no paid billing is enabled by this app.

This is transcript-to-script generation only. It does not transcribe uploaded audio or automatically produce a complete recap video.
