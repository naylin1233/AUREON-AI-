import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { transcribeAudioChunk } from '../server/ai/transcribe.ts';
import { NO_SPEECH_MARKER, isUsableTranscript, normalizeTranscript, recapScriptBlockReason } from '../server/ai/transcriptText.ts';

const textOutput=(text:string)=>({steps:[{type:'model_output',content:[{type:'text',text}]}]});

async function transcribeWithMock(modelBody:unknown){
 const dir=await mkdtemp(path.join(os.tmpdir(),'aureon-normalize-test-'));
 const filePath=path.join(dir,'chunk.wav');
 await writeFile(filePath,Buffer.alloc(256,7));
 const previousFetch=globalThis.fetch;
 const previousKey=process.env.GEMINI_API_KEY;
 process.env.GEMINI_API_KEY='test-only-key';
 const calls:{url:string;method:string;body:any}[]=[];
 const uploadUrl='https://generativelanguage.googleapis.com/upload/v1beta/files/test-session';
 globalThis.fetch=(async(input:any,init:any={})=>{
  const url=typeof input==='string'?input:input.url;
  const method=init.method||'GET';
  calls.push({url,method,body:init.body});
  if(url==='https://generativelanguage.googleapis.com/upload/v1beta/files')return new Response('',{status:200,headers:{'x-goog-upload-url':uploadUrl}});
  if(url===uploadUrl)return new Response(JSON.stringify({file:{name:'files/test-audio',uri:'https://generativelanguage.googleapis.com/files/test-audio',state:'ACTIVE'}}),{status:200,headers:{'content-type':'application/json'}});
  if(url==='https://generativelanguage.googleapis.com/v1beta/interactions')return new Response(JSON.stringify(modelBody),{status:200,headers:{'content-type':'application/json'}});
  if(url==='https://generativelanguage.googleapis.com/v1beta/files/test-audio'&&method==='DELETE')return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
  throw new Error('Unexpected mocked Gemini request: '+method+' '+url);
 }) as typeof fetch;
 let value:string|undefined;
 let error:Error|undefined;
 try{value=await transcribeAudioChunk(filePath,0);}catch(caught){error=caught as Error;}
 finally{
  globalThis.fetch=previousFetch;
  if(previousKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previousKey;
  await rm(dir,{recursive:true,force:true});
 }
 return {value,error,calls};
}

test('normalizeTranscript rejects marker-only, silence and music outputs',()=>{
 const empties=[
  NO_SPEECH_MARKER,'[NO SPEECH]','  [no speech].  ','[unclear]','[unclear] [unclear]','[inaudible]','[Music]\n[music]','(silence)','[Background noise]',
  '♪ ♪ ♫','...','','   ','Speaker 1:','```\n[no speech]\n```','There is no speech in this audio.','The audio contains only background music.','This clip is silent.'
 ];
 for(const sample of empties)assert.equal(normalizeTranscript(sample),'',`expected empty for ${JSON.stringify(sample)}`);
});

test('normalizeTranscript rejects very short outputs',()=>{
 for(const sample of ['ok','Hi.','12','啊','[unclear] ok'])assert.equal(normalizeTranscript(sample),'',`expected empty for ${JSON.stringify(sample)}`);
});

test('normalizeTranscript keeps real speech in Chinese, Burmese and English',()=>{
 assert.equal(normalizeTranscript('这是测试转录文本'),'这是测试转录文本');
 assert.equal(normalizeTranscript('မင်္ဂလာပါ ကျွန်တော်'),'မင်္ဂလာပါ ကျွန်တော်');
 assert.equal(normalizeTranscript('Hello everyone, welcome back.'),'Hello everyone, welcome back.');
 assert.equal(normalizeTranscript('Speaker 1: Hello everyone\nSpeaker 2: Welcome back'),'Speaker 1: Hello everyone\nSpeaker 2: Welcome back');
});

test('normalizeTranscript keeps [unclear] inside speech but removes standalone music and silence tags',()=>{
 assert.equal(normalizeTranscript('Hello everyone welcome\n[unclear]\nthanks all'),'Hello everyone welcome\n[unclear]\nthanks all');
 assert.equal(normalizeTranscript('Hello everyone welcome\n[music]\nthanks again'),'Hello everyone welcome\nthanks again');
 assert.equal(normalizeTranscript('[Music] Hello there everyone'),'Hello there everyone');
 assert.equal(normalizeTranscript('First paragraph here.\n\nSecond paragraph here.'),'First paragraph here.\n\nSecond paragraph here.');
});

test('normalizeTranscript does not discard real speech that merely mentions "no speech"',()=>{
 const spoken='I have no speech prepared for today, so let me just say hello to everyone here.';
 assert.equal(normalizeTranscript(spoken),spoken);
 const longer='The narrator explains that there is no speech in this audio recording of the old film, then goes on to describe the silent era in great detail for several minutes.';
 assert.equal(normalizeTranscript(longer),longer);
});

test('isUsableTranscript and recapScriptBlockReason block unusable transcripts',()=>{
 assert.equal(isUsableTranscript('[unclear]'),false);
 assert.equal(isUsableTranscript(undefined),false);
 assert.equal(isUsableTranscript('这是测试转录文本'),true);
 assert.match(recapScriptBlockReason({status:'media_ready',transcript:'这是测试转录文本'})||'',/Complete audio transcription/);
 assert.match(recapScriptBlockReason({status:'transcribed',transcript:''})||'',/Complete audio transcription/);
 assert.match(recapScriptBlockReason({status:'transcribed',transcript:'[unclear]\n\n[no speech]'})||'',/no usable speech transcript/);
 assert.equal(recapScriptBlockReason({status:'transcribed',transcript:'这是测试转录文本'}),undefined);
});

test('transcription prompt asks for the no-speech marker and does not touch Gemini safety settings',async()=>{
 const {value,calls}=await transcribeWithMock(textOutput('这是测试转录文本'));
 assert.equal(value,'这是测试转录文本');
 const interaction=calls.find(call=>call.url.endsWith('/interactions'));
 assert.ok(interaction);
 const payload=JSON.parse(interaction.body);
 const prompt:string=payload.input[0].text;
 assert.ok(prompt.includes(NO_SPEECH_MARKER));
 assert.match(prompt,/silence|music/i);
 assert.match(prompt,/never write words/i);
 assert.match(prompt,/\[unclear\]/);
 assert.deepEqual(Object.keys(payload).sort(),['input','model','store']);
 assert.equal(payload.safetySettings,undefined);
 assert.equal(payload.generationConfig,undefined);
});

test('chunk transcription returns an empty string for no-speech marker output and still deletes the Gemini file',async()=>{
 const {value,error,calls}=await transcribeWithMock(textOutput(NO_SPEECH_MARKER));
 assert.equal(error,undefined);
 assert.equal(value,'');
 assert.ok(calls.some(call=>call.method==='DELETE'));
});

test('chunk transcription returns an empty string for [unclear]-only, music-only and too-short output',async()=>{
 for(const sample of ['[unclear]','[Music]','ok','There is no speech in this audio.']){
  const {value,error}=await transcribeWithMock(textOutput(sample));
  assert.equal(error,undefined,sample);
  assert.equal(value,'',`expected empty chunk for ${JSON.stringify(sample)}`);
 }
});

test('chunk transcription strips standalone music tags from real speech',async()=>{
 const {value}=await transcribeWithMock(textOutput('[Music]\nHello everyone, welcome back.\n[Music]'));
 assert.equal(value,'Hello everyone, welcome back.');
});

test('chunk transcription still throws when Gemini returns no text at all',async()=>{
 for(const body of [{steps:[]},{steps:[{type:'model_output',content:[{type:'text',text:'   '}]}]},{}]){
  const {value,error}=await transcribeWithMock(body);
  assert.equal(value,undefined);
  assert.match(error?.message||'',/no usable transcript for audio chunk 1/);
 }
});
