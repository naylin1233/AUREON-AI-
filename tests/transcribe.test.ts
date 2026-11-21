import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { transcribeAudioChunk } from '../server/ai/transcribe.ts';

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
