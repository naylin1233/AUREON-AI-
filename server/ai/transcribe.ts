import { readFile } from 'node:fs/promises';
import { GEMINI_MODEL } from './gemini.js';
import { NO_SPEECH_MARKER, normalizeTranscript } from './transcriptText.js';

const API='https://generativelanguage.googleapis.com';
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function errorMessage(response:Response){
 const data=await response.json().catch(()=>({}));
 return typeof data?.error?.message==='string'?data.error.message.slice(0,400):'HTTP '+response.status;
}
const RETRYABLE_GEMINI_STATUSES=new Set([408,429,500,502,503,504]);
const MAX_GEMINI_RETRIES=5;
function retryDelayMs(response:Response,attempt:number){
 const retryAfter=response.headers.get('retry-after');
 if(retryAfter){
  const seconds=Number(retryAfter);
  if(Number.isFinite(seconds)&&seconds>=0)return Math.min(30000,seconds*1000);
  const date=Date.parse(retryAfter);
  if(Number.isFinite(date))return Math.min(30000,Math.max(0,date-Date.now()));
 }
 return Math.min(15000,1000*(2**attempt));
}
export async function requestWithRetry(url:string,init:RequestInit,retries=MAX_GEMINI_RETRIES){
 for(let attempt=0;attempt<=retries;attempt++){
  // Retry only explicit transient HTTP responses. Retrying a network timeout on a
  // POST can duplicate a request that Gemini already processed.
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(300000)});
  if(!RETRYABLE_GEMINI_STATUSES.has(response.status)||attempt===retries)return response;
  const delay=retryDelayMs(response,attempt);
  await response.body?.cancel().catch(()=>undefined);
  await wait(delay);
 }
 throw new Error('Gemini request failed after retries.');
}
export async function transcribeAudioChunk(filePath:string,chunkIndex:number){
 const key=process.env.GEMINI_API_KEY;
 if(!key)throw new Error('Gemini is not configured. Add GEMINI_API_KEY to the private server environment.');
 const bytes=await readFile(filePath);
 if(bytes.length<100)throw new Error('Audio chunk is empty or too small to transcribe.');
 const start=await fetch(API+'/upload/v1beta/files',{
  method:'POST',
  headers:{
   'x-goog-api-key':key,
   'X-Goog-Upload-Protocol':'resumable',
   'X-Goog-Upload-Command':'start',
   'X-Goog-Upload-Header-Content-Length':String(bytes.length),
   'X-Goog-Upload-Header-Content-Type':'audio/wav',
   'Content-Type':'application/json'
  },
  body:JSON.stringify({file:{display_name:`aureon-audio-chunk-${chunkIndex+1}`}}),
  signal:AbortSignal.timeout(60000)
 });
 if(!start.ok)throw new Error('Gemini audio upload initialization failed: '+await errorMessage(start));
 const uploadUrl=start.headers.get('x-goog-upload-url');
 if(!uploadUrl)throw new Error('Gemini did not return a resumable upload URL.');
 const parsedUploadUrl=new URL(uploadUrl);
 if(parsedUploadUrl.protocol!=='https:'||parsedUploadUrl.hostname!=='generativelanguage.googleapis.com')throw new Error('Gemini returned an unexpected upload host.');
 const uploaded=await fetch(uploadUrl,{
  method:'POST',
  headers:{
   'Content-Length':String(bytes.length),
   'X-Goog-Upload-Offset':'0',
   'X-Goog-Upload-Command':'upload, finalize',
   'Content-Type':'audio/wav'
  },
  body:bytes as unknown as BodyInit,
  signal:AbortSignal.timeout(300000)
 });
 if(!uploaded.ok)throw new Error('Gemini audio upload failed: '+await errorMessage(uploaded));
 const uploadData=await uploaded.json().catch(()=>({}));
 const file=uploadData.file||uploadData;
 const fileName=typeof file.name==='string'?file.name:'';
 const fileUri=typeof file.uri==='string'?file.uri:'';
 if(!/^files\/[a-z0-9-]{1,40}$/.test(fileName)||!fileUri.startsWith('https://'))throw new Error('Gemini audio upload returned invalid file metadata.');
 let fileState=typeof file.state==='string'?file.state:'';
 try{
  for(let attempt=0;fileState!=='ACTIVE'&&attempt<20;attempt++){
   if(fileState==='FAILED')throw new Error('Gemini could not process the uploaded audio file.');
   await wait(1500);
   const status=await fetch(API+'/v1beta/'+fileName,{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(30000)});
   if(!status.ok)throw new Error('Gemini audio file status check failed: '+await errorMessage(status));
   const statusData=await status.json().catch(()=>({}));
   fileState=statusData.state||'';
  }
  if(fileState!=='ACTIVE')throw new Error('Gemini audio file did not become ready in time.');
  const prompt=[
   'Transcribe the speech in this audio as accurately as possible.',
   'Preserve the original spoken language and writing system. The source may contain Mandarin Chinese, Burmese, or other languages.',
   'Do not translate, summarize, explain, or invent any speech.',
   'Use speaker labels only when speakers are clearly distinguishable.',
   'If a short section cannot be understood, mark it as [unclear] rather than guessing.',
   'If the audio contains only silence, music, background noise, or no intelligible speech, return exactly '+NO_SPEECH_MARKER+' and nothing else.',
   'Never write words, captions, credits, greetings, or sign-offs that you cannot clearly hear. Silence and music must never be transcribed as speech.',
   'If only part of the chunk contains speech, transcribe only that speech and leave out silent or musical parts. Do not describe sounds or music.',
   'Return only the transcript text, with paragraph breaks where natural. Do not add commentary or explanations.',
   'This is audio chunk '+(chunkIndex+1)+'.'
  ].join('\n');
  const interaction=await requestWithRetry(API+'/v1beta/interactions',{
   method:'POST',
   headers:{'x-goog-api-key':key,'Content-Type':'application/json'},
   body:JSON.stringify({model:GEMINI_MODEL,input:[{type:'text',text:prompt},{type:'audio',uri:fileUri,mime_type:'audio/wav'}],store:false})
  });
  if(!interaction.ok)throw new Error('Gemini transcription failed: '+await errorMessage(interaction));
  const data=await interaction.json().catch(()=>({}));
  const output=Array.isArray(data.steps)?data.steps.filter((step:any)=>step?.type==='model_output').flatMap((step:any)=>Array.isArray(step.content)?step.content:[]).filter((part:any)=>part?.type==='text'&&typeof part.text==='string').map((part:any)=>part.text).join('\n').trim():typeof data.output_text==='string'?data.output_text.trim():'';
  if(!output)throw new Error('Gemini returned no usable transcript for audio chunk '+(chunkIndex+1)+'.');
  // '' means the chunk was understood but contains no usable speech (silence, music, markers only, or too short).
  return normalizeTranscript(output);
 }finally{
  await fetch(API+'/v1beta/'+fileName,{method:'DELETE',headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(15000)}).catch(()=>undefined);
 }
}
