# Deployment and private configuration

## Current deployment readiness

AUREON AI is currently a single-process Express + Vite application with local JSON state and local media files. The Docker image includes FFmpeg and binds to `0.0.0.0` inside the container.

**Do not expose this build as a public production service yet.** The current app does not have user login/session management, a production authorization model for browser requests, a managed database, or object storage. The API's optional bearer-token middleware is not yet integrated into the browser client, so enabling `AUREON_API_TOKEN` would also block normal UI API calls. A restart on ephemeral hosting can lose projects, uploads, audio, and rendered videos.

A public deployment should wait until authentication is implemented end-to-end and persistent database/object storage are configured. Do not enable paid hosting or billing without explicit approval.

## Configure YouTube API for local testing

1. Copy `.env.example` to `.env` on the machine running the backend.
2. Add the API key locally: `YOUTUBE_API_KEY=your-key`.
3. Optionally set up to four semicolon-separated search terms: `YOUTUBE_REFERENCE_QUERIES=donghua recap;anime recap;Chinese animation recap;movie recap`.
4. Keep `.env` out of Git. It is ignored by `.gitignore`.
5. In Google Cloud, restrict the key to **YouTube Data API v3**. Do not use a browser HTTP-referrer restriction for a server-side key. Do not paste the key into chat, issues, screenshots, source files, or commit history.

The API key belongs in the private environment of the process that runs the Express backend. A GitHub Actions repository secret is not automatically available to a running server; it only becomes available to a workflow that explicitly reads it. The current CI workflow does not deploy or run the long-lived backend.

## Run locally

Requirements: Node.js 20+ and FFmpeg/FFprobe.

```bash
npm install
cp .env.example .env
# Edit .env locally and add YOUTUBE_API_KEY
npm run dev
```

The UI is served by Vite at `http://127.0.0.1:5173`; the API is at `http://127.0.0.1:8787`.

## Docker smoke test

```bash
docker build -t aureon-ai .
docker run --rm --env-file .env -p 8787:8787 -v aureon-data:/app/storage/data aureon-ai
```

The named Docker volume keeps application data across container recreation on the same Docker host. This is a local smoke-test setup, not a public production deployment.

## YouTube discovery behavior

The backend checks for projects and runs the discovery task daily at 06:15 Asia/Bangkok while the process remains running. It also exposes a manual discovery endpoint for the References UI. Results are stored as metadata-only, reference-only entries. The app does not download videos, audio, captions, or transcripts and does not verify reuse rights. Search quota and availability are controlled by YouTube.

## Before public hosting

- Implement login and secure session handling, and authorize every project/resource by owner.
- Integrate any API authentication with the browser client; do not ship a secret in `VITE_*` variables.
- Replace local JSON state with a managed database and move uploaded media/audio/renders to persistent object storage.
- Add upload limits, rate limits, HTTPS, secure headers, backup/restore, and operational monitoring.
- Confirm the host supports FFmpeg, long-running jobs, sufficient disk/temporary space, and persistent storage.
- Set `YOUTUBE_API_KEY` as a server-side runtime secret in the chosen host.
- Review provider pricing and free-tier limits with an adult/guardian where required. Do not turn on paid billing automatically.
