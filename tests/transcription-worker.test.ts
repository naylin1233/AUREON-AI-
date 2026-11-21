import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// The store reads AUREON_DATA_DIR when it is first imported, so configure it before importing anything from server/.
const dataDir=await mkdtemp(path.join(os.tmpdir(),'aureon-worker-test-'));
process.env.AUREON_DATA_DIR=dataDir;
process.env.GEMINI_API_KEY='test-only-key';
const store=await import('../server/store.ts');
const { enqueueTranscriptionJob }=await import('../server/ai/transcriptionWorker.ts');
const { recapScriptBlockReason }=await import('../server/ai/transcriptText.ts');
await store.initializeStore();

const realFetch=globalThis.fetch;
after(async()=>{
 globalThis.fetch=realFetch;
 await rm(dataDir,{recursive:true,force:true});
});

/** Mocks the Gemini upload, status, delete and interactions endpoints. Interaction N returns outputs[N]. */
function mockGemini(outputs:(string|number)[]){
 const state={interactions:0};
 const uploadUrl='https://generativelanguage.googleapis.com/upload/v1beta/files/test-session';
 globalThis.fetch=(async(input:any,init:any={})=>{
  const url=typeof input==='string'?input:input.url;
  const method=init.method||'GET';
  if(url==='https://generativelanguage.googleapis.com/upload/v1beta/files')return new Response('',{status:200,headers:{'x-goog-upload-url':uploadUrl}});
  if(url===uploadUrl)return new Response(JSON.stringify({file:{name:'files/test-audio',uri:'https://generativelanguage.googleapis.com/files/test-audio',state:'ACTIVE'}}),{status:200,headers:{'content-type':'application/json'}});
  if(url==='https://generativelanguage.googleapis.com/v1beta/files/test-audio'&&method==='DELETE')return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
  if(url==='https://generativelanguage.googleapis.com/v1beta/interactions'){
   const next=outputs[state.interactions++];
   if(typeof next==='number')return new Response(JSON.stringify({error:{message:'mock provider failure'}}),{status:next,headers:{'content-type':'application/json'}});
   return new Response(JSON.stringify({steps:[{type:'model_output',content:[{type:'text',text:next??''}]}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  throw new Error('Unexpected mocked Gemini request: '+method+' '+url);
 }) as typeof fetch;
 return state;
}

async function makeJob(chunkCount:number,saved?:string[]){
 const project=await store.addProject({title:'Worker test',recapMode:'Cinematic'});
 const source=await store.addSource({projectId:project.id,kind:'upload',name:'sample.mp4',status:'stored'});
 const job=await store.addJob(project.id,source.id);
 const outputDir=path.join(store.storageDirectory(),'processed',job.id);
 await mkdir(outputDir,{recursive:true});
 for(let i=0;i<chunkCount;i++)await writeFile(path.join(outputDir,`chunk-${String(i+1).padStart(3,'0')}.wav`),Buffer.alloc(256,7));
 await store.updateJob(job.id,{status:'transcribing',outputDir,transcriptionConsentAt:new Date().toISOString(),...(saved?{transcriptChunks:saved}:{})});
 return job.id;
}

test('a job whose chunks are all silence or marker-only fails and blocks recap generation',async()=>{
 const gemini=mockGemini(['[no speech]','[unclear]','[Music]']);
 const id=await makeJob(3);
 await enqueueTranscriptionJob(id);
 const job=store.getJob(id)!;
 assert.equal(gemini.interactions,3);
 assert.equal(job.status,'failed');
 assert.equal(job.stage,'transcription_no_speech');
 assert.match(job.error||'',/No speech was detected/);
 assert.equal(job.transcript,undefined);
 assert.deepEqual(job.transcriptChunks,[]);
 assert.equal(job.recapScript,undefined);
 assert.ok(recapScriptBlockReason(job));
});

test('a job with one real chunk and one silent chunk completes using only the speech',async()=>{
 const gemini=mockGemini(['这是测试转录文本','[no speech]']);
 const id=await makeJob(2);
 await enqueueTranscriptionJob(id);
 const job=store.getJob(id)!;
 assert.equal(gemini.interactions,2);
 assert.equal(job.status,'transcribed');
 assert.equal(job.stage,'transcription_complete');
 assert.equal(job.transcript,'这是测试转录文本');
 assert.deepEqual(job.transcriptChunks,['这是测试转录文本','']);
 assert.equal(job.transcribedChunkCount,2);
 assert.match(job.note,/1 without detectable speech/);
 assert.equal(recapScriptBlockReason(job),undefined);
});

test('resuming does not re-send chunks that were already processed, including no-speech chunks',async()=>{
 const gemini=mockGemini(['New transcribed speech here']);
 const id=await makeJob(3,['Existing speech text','']);
 await enqueueTranscriptionJob(id);
 const job=store.getJob(id)!;
 assert.equal(gemini.interactions,1);
 assert.equal(job.status,'transcribed');
 assert.equal(job.transcript,'Existing speech text\n\nNew transcribed speech here');
 assert.deepEqual(job.transcriptChunks,['Existing speech text','','New transcribed speech here']);
});

test('retrying after a no-speech failure sends the audio to Gemini again',async()=>{
 mockGemini(['[no speech]']);
 const id=await makeJob(1);
 await enqueueTranscriptionJob(id);
 assert.equal(store.getJob(id)!.stage,'transcription_no_speech');
 const retry=mockGemini(['Real speech is present now']);
 await store.updateJob(id,{status:'transcribing',stage:'transcription_queued',error:undefined});
 await enqueueTranscriptionJob(id);
 const job=store.getJob(id)!;
 assert.equal(retry.interactions,1);
 assert.equal(job.status,'transcribed');
 assert.equal(job.transcript,'Real speech is present now');
});

test('a provider error still fails the job and keeps completed chunks for retry',async()=>{
 mockGemini(['First chunk speech here',500,500,500]);
 const id=await makeJob(2);
 await enqueueTranscriptionJob(id);
 const job=store.getJob(id)!;
 assert.equal(job.status,'failed');
 assert.equal(job.stage,'transcription_failed');
 assert.match(job.error||'',/mock provider failure/);
 assert.deepEqual(job.transcriptChunks,['First chunk speech here']);
});
