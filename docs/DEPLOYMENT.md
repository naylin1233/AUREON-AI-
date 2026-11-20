# Deployment and private configuration

## Current deployment readiness

AUREON AI is a single-owner Express + Vite application with local JSON state and local media files. The Docker image includes FFmpeg and binds to `0.0.0.0` inside the container.

**Owner login is now integrated end-to-end:** a server-side password check creates a signed, seven-day HttpOnly, SameSite=Strict session cookie; API routes require a valid session when login is configured. Public-interface startup is refused unless the owner password and session-signing secret are configured. Health and authentication bootstrap endpoints remain public. Login is rate-limited after repeated failed attempts.

**This is not yet ready for public production use.** JSON state and media still depend on a persistent mounted volume; there is no managed database or object storage, no automated backup/restore, and no production hosting provider configured. Do not expose it until a persistent volume is attached and tested, HTTPS is enabled, and backup/recovery is verified. Do not enable paid hosting or billing without explicit approval.

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

## Owner login configuration

For a public-interface deployment, set these as private server runtime environment variables (not GitHub source files and never `VITE_*` browser variables):

- `AUREON_ADMIN_PASSWORD`: a unique password of at least 12 characters.
- `AUREON_SESSION_SECRET`: a randomly generated secret of at least 32 bytes. Keep it stable across restarts so existing sessions remain valid.
- Set `NODE_ENV=production` behind HTTPS so the session cookie receives the `Secure` attribute.
- Set `HOST=0.0.0.0` only after the password and session secret are present. The server refuses public-interface startup without them.
- Login uses an HttpOnly, SameSite=Strict cookie. Do not share the password or session secret.

## Before public hosting

- Attach a persistent volume at `/app/storage/data`; verify projects, uploaded videos, voice samples, dialogue clips, subtitles, and rendered MP4 files survive a container restart.
- Back up the volume and test restoring a copy before relying on it.
- Add HTTPS, operational monitoring, and review upload limits and resource capacity.
- Confirm the host supports FFmpeg, long-running jobs, sufficient disk/temporary space, and persistent storage.
- Set `YOUTUBE_API_KEY` as a server-side runtime secret in the chosen host.
- Review provider pricing and free-tier limits with an adult/guardian where required. Do not turn on paid billing automatically.
