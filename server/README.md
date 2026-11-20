# AUREON AI backend — Stage 2

## Implemented and testable
- Express API health endpoint.
- Project creation and JSON-backed persistence.
- Video upload to local disk with file size and MIME-type limits.
- Authorized URL source registration (metadata only; it does not download remote media).
- Durable recap-job records that honestly remain `awaiting_pipeline`.
- Optional bearer-token protection via `AUREON_API_TOKEN`.
- Vite proxy for local API development.

## Run locally
Requirements: Node.js 20+
```bash
npm install
cp .env.example .env
npm run dev
```
Web UI: http://127.0.0.1:5173
API health: http://127.0.0.1:8787/api/health

## Storage
Local data is stored under `storage/data/` (ignored by Git). Uploaded files are saved under `storage/data/uploads/`. Back up this directory. This JSON store is suitable only for a single-instance development deployment; use managed PostgreSQL/object storage before public multi-user production.

## Not implemented yet
No AI script generation, actual Myanmar TTS, voice cloning, scene extraction, video rendering, subtitle alignment/export, background worker, distributed queue, remote URL download, social OAuth, or automatic publishing. Jobs are records only and remain `awaiting_pipeline`. Do not advertise these features as active until end-to-end tests pass.

## Safety and deployment
- Bind to localhost by default. Do not expose this development server publicly.
- If you expose it behind a trusted reverse proxy, set a strong `AUREON_API_TOKEN`, HTTPS, request rate limits, and authentication/authorization.
- Do not store API keys in frontend code or commit secrets.
- Process only media you own or are authorized to use.
- Do not enable paid billing without explicit approval.
