# AUREON AI

**Your World. Your AI.** — Premium Gold, Burmese-first media studio.

## Implemented stages

### Stage 1 — Web workspace
- Responsive React + TypeScript + Vite dashboard.
- Five recap modes and Burmese-first interface.

### Stage 2 — Local API and storage
- Express API with JSON-backed project/source/job records.
- Guarded local video upload; authorized URL is metadata-only and is not downloaded.
- Optional bearer-token protection.

### Stage 3 — Media preparation
- FFmpeg/FFprobe validates local video and audio.
- Extracts mono 16 kHz WAV in ten-minute chunks.
- Tracks progress, validates chunks and reuses completed chunks after restart.
- Docker image includes FFmpeg and persistent local storage.

### Stage 4 — Myanmar voice connector
- Server-side Azure Speech adapter for standard Burmese Nilar and Thiha voices.
- MP3 validation/storage and audio preview endpoint.
- No English fallback. Requires owner-configured Azure Speech credentials; live voice generation is not yet verified. Personal voice cloning is not included.

### Stage 5 — Burmese recap script draft
- Server-side Gemini Interactions API adapter using `gemini-3.8-flash` by default.
- Creates Burmese recap script drafts from a transcript supplied by the user.
- Five recap modes, transcript length validation, explicit uncertainty handling and paraphrased original wording.
- AI remains disabled until `GEMINI_API_KEY` is configured server-side.
- This stage does not transcribe audio automatically; users must provide a transcript.

### Stage 5 — Bilingual subtitle workspace
- Import SRT and WebVTT files into separate Myanmar and English tracks.
- Merge imported language tracks by matching timestamps.
- Edit cue timings and both language texts manually.
- Export each language as SRT or WebVTT.
- Automatic transcription, machine translation and subtitle alignment are not implemented.

## Run locally

Requirements: Node.js 20+ and FFmpeg/FFprobe on PATH.

```bash
npm install
cp .env.example .env
npm run dev
```

Web: http://127.0.0.1:5173  
API health: http://127.0.0.1:8787/api/health

## Docker

```bash
docker build -t aureon-ai .
docker run --rm -p 8787:8787 -v aureon-data:/app/storage/data aureon-ai
```

### Stage 6 — Bilingual subtitle editor
- Import SRT and WebVTT files.
- Edit Myanmar and English cue text and timestamps.
- Export separate Myanmar/English SRT or VTT files.
- Validate timestamp order and malformed cue timing.
- Automatic translation and speech recognition are not included yet.

## Not implemented yet
- Automatic speech recognition / transcript extraction from uploaded video.
- Chunk summarization and long-video transcript orchestration.
- Automatic subtitle translation and speech-to-text alignment.
- Scene selection, 3D scene generation and final video rendering.
- Personal voice cloning.
- YouTube/Facebook/TikTok OAuth, scheduling and automatic publishing.
- Cloud object storage, managed database, distributed workers and Android packaging.

A job marked `media_ready` means only that audio chunks were extracted. A generated script is a draft from the supplied transcript, not a finished recap video.

## Safety and cost principles
- Free-tier-first. No paid billing or tier upgrades without explicit approval.
- Provider keys remain in private server environment variables; never paste them into chat or commit them.
- Use provider accounts and configuration with adult/guardian assistance where required.
- Process only media you own or are authorized to use.
- Review AI-generated names, plot details and script accuracy before publishing.
- Keep the development server local. Public deployment requires production authentication, HTTPS, rate limits, persistent database and object storage.

## Provider configuration

### Gemini recap scripts
Set `GEMINI_API_KEY` in the private server environment. Default model: `gemini-3.8-flash`. Check Google AI Studio for current model access and free-tier quota before enabling. The app does not activate paid billing automatically.

### Burmese neural voice
Set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in the private server environment. Use only the free tier unless the owner separately approves a paid plan. Live synthesis requires a valid resource and has not yet been verified.

Official API references: [Gemini Interactions API](https://ai.google.dev/gemini-api/docs/get-started) · [Azure Burmese voice list](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support)
