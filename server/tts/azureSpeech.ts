import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storageDirectory } from '../store.js';

export const BURMESE_VOICES = {
 Nilar: 'my-MM-NilarNeural',
 Thiha: 'my-MM-ThihaNeural'
} as const;
export type BurmeseVoice = keyof typeof BURMESE_VOICES;
export function azureTtsStatus(){
 return {configured:Boolean(process.env.AZURE_SPEECH_KEY&&process.env.AZURE_SPEECH_REGION),language:'my-MM',voices:Object.entries(BURMESE_VOICES).map(([label,id])=>({label,id}))};
}
function escapeXml(value:string){
 return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
}
export async function synthesizeBurmese(text:string,voice:BurmeseVoice){
 const key=process.env.AZURE_SPEECH_KEY;
 const region=process.env.AZURE_SPEECH_REGION;
 if(!key||!region)throw new Error('Myanmar TTS is not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION on the server.');
 if(!/^[a-z0-9-]+$/i.test(region))throw new Error('Invalid Azure Speech region.');
 const voiceId=BURMESE_VOICES[voice];
 const ssml=`<speak version="1.0" xml:lang="my-MM"><voice name="${voiceId}" xml:lang="my-MM">${escapeXml(text)}</voice></speak>`;
 const response=await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,{
  method:'POST',
  headers:{
   'Ocp-Apim-Subscription-Key':key,
   'Content-Type':'application/ssml+xml',
   'X-Microsoft-OutputFormat':'audio-16khz-128kbitrate-mono-mp3',
   'User-Agent':'AUREON-AI'
  },
  body:ssml,
  signal:AbortSignal.timeout(60000)
 });
 if(!response.ok){
  const detail=(await response.text()).slice(0,500);
  throw new Error(`Azure Speech request failed (${response.status}): ${detail||response.statusText}`);
 }
 const type=response.headers.get('content-type')||'';
 if(!type.toLowerCase().startsWith('audio/'))throw new Error('Speech provider returned a non-audio response; no audio was saved.');
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length<100)throw new Error('Speech provider returned an empty or invalid audio file.');
 const id=randomUUID();
 const dir=path.join(storageDirectory(),'tts');
 await mkdir(dir,{recursive:true});
 await writeFile(path.join(dir,`${id}.mp3`),bytes,{flag:'wx'});
 return {id,bytes:bytes.length,voice:voiceId};
}
