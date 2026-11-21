import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { requestWithRetry, transcribeAudioChunk } from '../server/ai/transcribe.ts';

test('uploads one audio chunk, transcribes it, and deletes the temporary Gemini file',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'aureon-transcribe-test-'));
 const filePath=path.join(dir,'chunk.wav');
 await writeFile(filePath,Buffer.alloc(256,7));
 const previousFetch=globalThis.fetch;
 const previousKey=process.env.GEMINI_API_KEY;
 process.env.GEMINI_API_KEY='test-only-key';
 const calls:{url:string;method:string;headers:HeadersInit|undefined;body:any}[]=[];
 const uploadUrl='https://generativelanguage.googleapis.com/upload/v1beta/files/test-session';
 globalThis.fetch=(async(input:any,init:any={})=>{
  const url=typeof input==='string'?input:input.url;
  const method=init.method||'GET';
  calls.push({url,method,headers:init.headers,body:init.body});
  if(url==='https://generativelanguage.googleapis.com/upload/v1beta/files')return new Response('',{status:200,headers:{'x-goog-upload-url':uploadUrl}});
  if(url===uploadUrl)return new Response(JSON.stringify({file:{name:'files/test-audio',uri:'https://generativelanguage.googleapis.com/files/test-audio',state:'ACTIVE'}}),{status:200,headers:{'content-type':'application/json'}});
  if(url==='https://generativelanguage.googleapis.com/v1beta/interactions')return new Response(JSON.stringify({steps:[{type:'model_output',content:[{type:'text',text:'这是测试转录文本'}]}]}),{status:200,headers:{'content-type':'application/json'}});
  if(url==='https://generativelanguage.googleapis.com/v1beta/files/test-audio'&&method==='DELETE')return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
  throw new Error('Unexpected mocked Gemini request: '+method+' '+url);
 }) as typeof fetch;
 try{
  const transcript=await transcribeAudioChunk(filePath,0);
  assert.equal(transcript,'这是测试转录文本');
  assert.equal(calls.filter(call=>call.url===uploadUrl).length,1);
  const interaction=calls.find(call=>call.url.endsWith('/interactions'));
  assert.ok(interaction);
  const payload=JSON.parse(interaction.body);
  assert.equal(payload.model,'gemini-3.8-flash');
  assert.equal(payload.store,false);
  assert.equal(payload.input[1].type,'audio');
  assert.equal(payload.input[1].uri,'https://generativelanguage.googleapis.com/files/test-audio');
  assert.ok(calls.some(call=>call.method==='DELETE'));
 }finally{
  globalThis.fetch=previousFetch;
  if(previousKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previousKey;
  await rm(dir,{recursive:true,force:true});
 }
});


test('retries Gemini 503/429 responses using Retry-After and succeeds',async()=>{
 const previousFetch=globalThis.fetch;
 const calls:string[]=[];
 globalThis.fetch=(async(input:any)=>{
  const url=typeof input==='string'?input:input.url;
  calls.push(url);
  if(calls.length===1)return new Response(JSON.stringify({error:{message:'high demand'}}),{status:503,headers:{'content-type':'application/json','retry-after':'0'}});
  if(calls.length===2)return new Response(JSON.stringify({error:{message:'rate limited'}}),{status:429,headers:{'content-type':'application/json','retry-after':'0'}});
  return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});
 }) as typeof fetch;
 try{
  const response=await requestWithRetry('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',body:'{}'});
  assert.equal(response.status,200);
  assert.equal(calls.length,3);
 }finally{
  globalThis.fetch=previousFetch;
 }
});

test('does not retry permanent Gemini client errors',async()=>{
 const previousFetch=globalThis.fetch;
 let calls=0;
 globalThis.fetch=(async()=>{
  calls++;
  return new Response(JSON.stringify({error:{message:'invalid request'}}),{status:400,headers:{'content-type':'application/json'}});
 }) as typeof fetch;
 try{
  const response=await requestWithRetry('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',body:'{}'});
  assert.equal(response.status,400);
  assert.equal(calls,1);
 }finally{
  globalThis.fetch=previousFetch;
 }
});


test('uses the explicitly enabled Groq Whisper fallback when Gemini is not configured',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'aureon-groq-test-'));
 const filePath=path.join(dir,'chunk.wav');
 await writeFile(filePath,Buffer.alloc(256,7));
 const previousFetch=globalThis.fetch;
 const previousGemini=process.env.GEMINI_API_KEY;
 const previousGroq=process.env.GROQ_API_KEY;
 const previousEnabled=process.env.GROQ_TRANSCRIPTION_ENABLED;
 delete process.env.GEMINI_API_KEY;
 process.env.GROQ_API_KEY='test-only-key';
 process.env.GROQ_TRANSCRIPTION_ENABLED='true';
 globalThis.fetch=(async(input:any,init:any={})=>{
  const url=typeof input==='string'?input:input.url;
  assert.equal(url,'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(init.method,'POST');
  assert.equal(new Headers(init.headers).get('authorization'),'Bearer test-only-key');
  assert.ok(init.body instanceof FormData);
  assert.equal(init.body.get('model'),'whisper-large-v3-turbo');
  return new Response(JSON.stringify({text:'မြန်မာအသံစာသား စမ်းသပ်ချက်'}),{status:200,headers:{'content-type':'application/json'}});
 }) as typeof fetch;
 try{
  const transcript=await transcribeAudioChunk(filePath,0);
  assert.equal(transcript,'မြန်မာအသံစာသား စမ်းသပ်ချက်');
 }finally{
  globalThis.fetch=previousFetch;
  if(previousGemini===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previousGemini;
  if(previousGroq===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=previousGroq;
  if(previousEnabled===undefined)delete process.env.GROQ_TRANSCRIPTION_ENABLED;else process.env.GROQ_TRANSCRIPTION_ENABLED=previousEnabled;
  await rm(dir,{recursive:true,force:true});
 }
});
