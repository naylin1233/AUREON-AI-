# AUREON AI

**Your World. Your AI.** — Premium Gold, Burmese-first media studio.

## Implemented

### Stage 1 — Web workspace
- Responsive React + TypeScript + Vite dashboard.
- Burmese-first UI and five recap modes.

### Stage 2 — Local API and storage
- Express API with JSON-backed project, source and job records.
- Local video upload with file-size and MIME checks.
- Authorized URL metadata registration only; remote URLs are not downloaded.
- Optional bearer-token protection.

### Stage 3 — Media preparation
- FFmpeg/FFprobe validates uploaded video duration and audio stream.
- Extracts mono 16 kHz WAV audio into ten-minute chunks.
- Validates completed chunks and reuses them after server restart.
- Tracks job status, progress, output path and failures.

### Stage 4 — Myanmar voice connector
- Server-side Azure Speech adapter for standard Burmese Nilar and Thiha voices.
- MP3 validation, local storage and audio preview.
- No English fallback.
- Requires explicit consent before sending narration text to Azure Speech.- Requires server-side Azure credentials and per-request consent; live synthesis has not yet been verified. Personal voice cloning is not included.

### Stage 5 — Burmese recap script drafts
- Server-side Gemini Interactions API adapter; default model `gemini-3.8-flash`.
- Creates Burmese script drafts from transcripts manually supplied by the user.
- Supports five recap modes and prompts the model not to invent unsupported plot details.
- Requires server-side `GEMINI_API_KEY`.
- The transcript is sent to Google for processing and is not stored by this endpoint.
- The UI and API require explicit consent before sending. Google states that Free Tier content may be used to improve its products.
- Automatic transcription from video audio is not implemented.

### Stage 6 — Bilingual subtitle editor
- Import SRT and WebVTT files.
- Edit Myanmar and English tracks, cue text and timestamps.
- Export separate Myanmar/English SRT or VTT files.
- Validate cue timestamp order.
- Browser-side edits are not persisted to the server.
- Automatic translation and speech-to-text alignment are not implemented.

### Stage 7 — Consent-gated audio transcription
- Sends each prepared 10-minute WAV chunk to Gemini Files API and transcribes in the original spoken language.
- Processes chunks sequentially and saves completed transcript chunks for restart/retry recovery.
- Deletes each temporary Gemini Files API upload after transcription.
- Requires explicit per-job consent; Google states that Free Tier content may be used to improve its products.
- Audio transcription is not live-verified without a configured Gemini key and quota.

## Run locally

Requirements: Node.js 20+ and FFmpeg/FFprobe on PATH.

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

## Not implemented yet
- Automatic speech recognition or transcript extraction from uploaded videos.
- Dialogue clip timeline mixing into the final video render.
- Automatic chunk summarization and long-video recap orchestration.
- Automatic subtitle translation or timing alignment.
- Scene selection, AI/3D scene generation and final recap video rendering.
- YouTube/Facebook/TikTok OAuth, scheduling and auto-publishing.
- Production cloud database/object storage and Android APK packaging.

A job marked `media_ready` means only that audio chunks were extracted. A generated script is a draft based on the transcript provided, not a finished recap video.

## Safety and cost
- Free-tier-first. No paid billing or tier upgrades without explicit approval.
- Provider keys stay in private server environment variables. Never paste keys into chat or commit them.
- Provider accounts and setup should be handled with adult/guardian assistance where required.
- Process only media you own or are authorized to use.
- Review AI-generated names, events and scripts before publishing.
- Development server binds to localhost. Public deployment requires production authentication, HTTPS, rate limits, persistent database and object storage.

## Provider configuration

### Gemini recap scripts
Set `GEMINI_API_KEY` in the private server environment. Fixed model: `gemini-3.8-flash` (no paid-model override). The app cannot inspect whether the Google account has billing enabled; keep it on the Free Tier. The consent checkbox explains that Free Tier content may be used to improve Google products. The app does not activate paid billing automatically.

### Burmese neural voice
Set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` in the private server environment. Use the free tier only unless a paid plan is separately approved. Live synthesis requires valid credentials and has not yet been verified.

Official references: [Gemini Interactions API](https://ai.google.dev/gemini-api/docs/get-started) · [Azure Burmese voice list](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support)

## Actor Voice Library

The Myanmar Voice Studio supports adding consented actor recordings as named character voice references. Supported uploads: MP3, WAV, M4A, OGG, WEBM, AAC and FLAC (maximum 30 MB each). Profiles are stored locally under `storage/data/voice-profiles/` with a character/role label and an in-app audio preview. The uploader must confirm ownership or permission from the voice owner. These are original recordings only: profiles can be assigned to named characters within a project, and the assigned recording can be previewed. The current system does not clone the actor's voice or synthesize new lines in that actor's voice. Project Dialogue Clips can store original/authorized audio recordings, associate them with a character/voice assignment, validate duration with FFprobe, set a millisecond timeline start and preview the recording. Clips are timeline metadata only and are not yet mixed into rendered video.
