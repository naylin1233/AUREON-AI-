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
  - resumes queued/processing jobs after server restart.
- Job status endpoint: `GET /api/jobs/:id`.
- Optional bearer-token API protection via `AUREON_API_TOKEN`.
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
No AI story analysis/script generation, Myanmar TTS or voice cloning, scene-aware video editing/rendering, subtitle alignment/export, distributed job queue, remote URL downloading, cloud object storage, managed database, social OAuth, scheduled/automatic publishing, or Android package. Jobs reach `media_ready` only after audio extraction; AI recap generation has not started.

## Safety and cost
- Bind to localhost by default; do not expose the development server publicly.
- Keep API/provider keys server-side; never commit secrets.
- Process only media the user owns or is authorized to use.
- Free-tier-first; do not enable paid billing without explicit approval.
