# Backend integration boundary

The Stage 1 deliverable is a frontend foundation only. No AI provider, TTS engine,
video renderer, file storage, scheduler, or social OAuth integration is active yet.

Future backend work should:
- validate uploaded media and authorized source URLs;
- store credentials only in server-side secrets;
- use durable job state and resumable processing;
- verify actual Myanmar audio output before marking TTS complete;
- require platform OAuth and explicit publishing approval;
- never enable paid billing without explicit user approval.