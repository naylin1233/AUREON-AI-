// Helpers that keep silence, music and "no speech" answers from being treated as real transcripts.

/** Exact marker the transcription prompt asks Gemini to return when a chunk has no intelligible speech. */
export const NO_SPEECH_MARKER='[no speech]';
/** Minimum number of letters/digits (markers and speaker labels excluded) for text to count as speech. */
export const MIN_TRANSCRIPT_CHARS=6;

// Tags that only describe non-speech audio. These are removed from transcripts.
const SILENCE_WORDS='no speech|no audible speech|no dialogue|speech not detected|silence|silent|music|background music|instrumental|background noise|noise|static|applause|laughter|sound effects?|sfx|singing|humming';
// Tags that mark uncertain speech. These are kept inside real speech but never count as content.
const UNCERTAIN_WORDS='unclear|inaudible';
const OPEN='[\\[(（【]';
const CLOSE='[\\])）】]';
const silenceTag=new RegExp(`${OPEN}\\s*(?:${SILENCE_WORDS})[\\s.…!]*${CLOSE}`,'giu');
const anyTag=new RegExp(`${OPEN}\\s*(?:${SILENCE_WORDS}|${UNCERTAIN_WORDS})[\\s.…!]*${CLOSE}`,'giu');
const musicSymbols=/[♪♫🎵🎶]/gu;
const speakerLabel=/^\s*(?:speaker|spk)\s*\d*\s*[:：]/gimu;
// A short prose answer such as "There is no speech in this audio." instead of the marker.
const noSpeechStatement=/\b(?:no|without)\s+(?:audible\s+|discernible\s+|intelligible\s+|clear\s+|spoken\s+)*(?:speech|dialogue|dialog)\b|\b(?:contains?|consists?\s+of|is|has)\s+(?:only\s+)?(?:silence|silent|music|background\s+(?:music|noise)|noise)\b/i;
const refersToAudio=/\b(?:audio|recording|clip|chunk|segment)\b/i;

function meaningfulLength(text:string){
 return (text.replace(anyTag,' ').replace(speakerLabel,' ').match(/[\p{L}\p{N}]/gu)||[]).length;
}
function isNoSpeechStatement(text:string){
 return text.length<=160&&refersToAudio.test(text)&&noSpeechStatement.test(text);
}

/**
 * Cleans one chunk of Gemini output. Returns '' when the chunk has no usable speech:
 * only the no-speech marker, only [unclear]/[music]-style tags, a short "no speech" sentence,
 * or fewer than MIN_TRANSCRIPT_CHARS letters/digits. Real speech keeps its [unclear] marks.
 */
export function normalizeTranscript(raw:string):string{
 if(typeof raw!=='string')return '';
 const unfenced=raw.replace(/\r\n?/g,'\n').replace(/^\s*```[a-z]*[ \t]*\n?/i,'').replace(/\n?[ \t]*```\s*$/,'').trim();
 const lines:string[]=[];
 for(const original of unfenced.split('\n')){
  if(!original.trim()){lines.push('');continue;}
  const cleaned=original.replace(silenceTag,' ').replace(musicSymbols,' ').replace(/[ \t]{2,}/g,' ').trim();
  if(cleaned)lines.push(cleaned);
 }
 const text=lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
 if(meaningfulLength(text)<MIN_TRANSCRIPT_CHARS)return '';
 if(isNoSpeechStatement(text))return '';
 return text;
}

export function isUsableTranscript(text:unknown):boolean{
 return typeof text==='string'&&normalizeTranscript(text)!=='';
}

/** Returns why a recap script cannot be generated for this job, or undefined when it can. */
export function recapScriptBlockReason(job:{status:string;transcript?:string}):string|undefined{
 if(job.status!=='transcribed'||!job.transcript?.trim())return 'Complete audio transcription before generating a recap script.';
 if(!isUsableTranscript(job.transcript))return 'This job has no usable speech transcript (only silence, music or unclear audio was found), so a recap script cannot be generated.';
 return undefined;
}
