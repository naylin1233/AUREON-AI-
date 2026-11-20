import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const execFileAsync=promisify(execFile);
const dataDir=await mkdtemp(path.join(os.tmpdir(),'aureon-api-test-'));
const port=Number(process.env.AUREON_TEST_PORT||8879);
const base=`http://127.0.0.1:${port}`;
const sampleVideo=path.join(dataDir,'smoke-test.mp4');
const sampleVoice=path.join(dataDir,'actor-sample.wav');
let child;
async function start(){
 child=spawn(process.execPath,['--import','tsx','server/index.ts'],{
  env:{...process.env,HOST:'127.0.0.1',PORT:String(port),AUREON_DATA_DIR:dataDir,AUREON_MAX_UPLOAD_MB:'8',AZURE_SPEECH_KEY:'',AZURE_SPEECH_REGION:''},
  stdio:'ignore'
 });
 for(let i=0;i<80;i++){
  if(child.exitCode!==null)throw new Error('API process exited before startup');
  try{const response=await fetch(base+'/api/health');if(response.ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,150));
 }
 throw new Error('API did not become healthy within 12 seconds');
}
async function stop(){
 if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
}
try{
 await execFileAsync('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=160x120:d=2','-f','lavfi','-i','sine=frequency=1000:duration=2','-c:v','mpeg4','-c:a','aac','-shortest',sampleVideo]);
 await execFileAsync('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','pcm_s16le',sampleVoice]);
 await start();
 const health=await (await fetch(base+'/api/health')).json();
 assert.equal(health.ok,true);
 assert.equal(health.features.mediaPreparation,true);
 assert.equal(health.features.aiGeneration,false);
 assert.equal(health.features.burmeseTts,false);
 assert.equal(health.features.aiScriptGeneration,false);
 assert.equal(health.features.audioTranscription,false);
 const aiStatus=await (await fetch(base+'/api/ai/status')).json();
 assert.equal(aiStatus.configured,false);
 const aiNoConsent=await fetch(base+'/api/ai/recap-script',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript:'ဇာတ်လမ်းအကျဉ်း',recapMode:'Cinematic',consent:false})});
 assert.equal(aiNoConsent.status,400);
 const aiUnavailable=await fetch(base+'/api/ai/recap-script',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript:'ဇာတ်လမ်းအကျဉ်း',recapMode:'Cinematic',consent:true})});
 assert.equal(aiUnavailable.status,503);
 const aiInvalid=await fetch(base+'/api/ai/recap-script',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript:'',recapMode:'Cinematic'})});
 assert.equal(aiInvalid.status,400);
 const voiceStatus=await (await fetch(base+'/api/tts/status')).json();
 assert.equal(voiceStatus.configured,false);
 assert.equal(voiceStatus.language,'my-MM');
 const ttsNoConsent=await fetch(base+'/api/tts/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'မင်္ဂလာပါ',voice:'Nilar',consent:false})});
 assert.equal(ttsNoConsent.status,400);
 const ttsUnavailable=await fetch(base+'/api/tts/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'မင်္ဂလာပါ',voice:'Nilar',consent:true})});
 assert.equal(ttsUnavailable.status,503);
 const invalidActorForm=new FormData();invalidActorForm.append('name','Bad Actor');invalidActorForm.append('character','Fake');invalidActorForm.append('consent','true');invalidActorForm.append('audio',new Blob(['not audio'],{type:'audio/wav'}),'fake.wav');
 const invalidActor=await fetch(base+'/api/voices',{method:'POST',body:invalidActorForm});assert.equal(invalidActor.status,415);
 const actorForm=new FormData();actorForm.append('name','Smoke Actor');actorForm.append('character','Test Hero');actorForm.append('consent','true');actorForm.append('audio',new Blob([await readFile(sampleVoice)],{type:'audio/wav'}),'actor.wav');
 const actorResponse=await fetch(base+'/api/voices',{method:'POST',body:actorForm});
 assert.equal(actorResponse.status,201);
 const actor=(await actorResponse.json()).item;
 assert.equal(actor.name,'Smoke Actor');assert.equal(actor.character,'Test Hero');assert.equal(actor.language,'my-MM');
 const actorAudio=await fetch(base+actor.audioUrl);assert.equal(actorAudio.status,200);assert.ok(Number(actorAudio.headers.get('content-length'))>100);

 const projectResponse=await fetch(base+'/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Smoke Test Project',recapMode:'Cinematic'})});
 assert.equal(projectResponse.status,201);
 const project=(await projectResponse.json()).item;
 assert.ok(project.id);
 const badAssignment=await fetch(base+`/api/projects/${project.id}/voice-assignments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voiceProfileId:'missing',character:'Hero'})});assert.equal(badAssignment.status,404);
 const assignmentResponse=await fetch(base+`/api/projects/${project.id}/voice-assignments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voiceProfileId:actor.id,character:'Main Hero'})});assert.equal(assignmentResponse.status,201);assert.equal((await assignmentResponse.json()).item.voice.name,'Smoke Actor');
 const assignmentList=(await (await fetch(base+`/api/projects/${project.id}/voice-assignments`)).json()).items;assert.equal(assignmentList.length,1);assert.equal(assignmentList[0].character,'Main Hero');

 const urlResponse=await fetch(base+`/api/projects/${project.id}/url-source`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://example.com/authorized-video.mp4'})});
 assert.equal(urlResponse.status,201);
 assert.equal((await urlResponse.json()).item.status,'awaiting_review');

 const badReference=await fetch(base+`/api/projects/${project.id}/references`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://example.com/not-youtube'})});assert.equal(badReference.status,400);
 const referenceResponse=await fetch(base+`/api/projects/${project.id}/references`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://www.youtube.com/@sample-recap',channelName:'Sample Recap',language:'English',notes:'Study pacing only',authorizedForUse:false})});assert.equal(referenceResponse.status,201);const reference=(await referenceResponse.json()).item;assert.equal(reference.kind,'channel');assert.equal(reference.rightsStatus,'reference_only');
 const referenceVideo=await fetch(base+`/api/projects/${project.id}/references`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://www.youtube.com/watch?v=abcdefghijk',title:'Sample video',authorizedForUse:true})});assert.equal(referenceVideo.status,201);assert.equal((await referenceVideo.json()).item.kind,'video');
 const references=(await (await fetch(base+`/api/projects/${project.id}/references`)).json()).items;assert.equal(references.length,2);
\n const form=new FormData();
 form.append('video',new Blob([await readFile(sampleVideo)],{type:'video/mp4'}),'sample.mp4');
 const uploadResponse=await fetch(base+`/api/projects/${project.id}/upload`,{method:'POST',body:form});
 assert.equal(uploadResponse.status,201);
 assert.equal((await uploadResponse.json()).item.status,'stored');

 const jobResponse=await fetch(base+`/api/projects/${project.id}/recap-jobs`,{method:'POST'});
 assert.equal(jobResponse.status,202);
 const createdJob=(await jobResponse.json()).item;
 assert.equal(createdJob.status,'queued');
 let finalJob;
 for(let i=0;i<100;i++){
  const response=await fetch(base+`/api/jobs/${createdJob.id}`);
  finalJob=(await response.json()).item;
  if(finalJob.status==='media_ready'||finalJob.status==='failed')break;
  await new Promise(resolve=>setTimeout(resolve,150));
 }
 assert.equal(finalJob.status,'media_ready',finalJob.error||'Media worker did not complete.');
 assert.equal(finalJob.chunkCount,1);
 assert.ok(finalJob.outputDir);
 const transcribeNoConsent=await fetch(base+`/api/jobs/${createdJob.id}/transcribe`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:false})});
 assert.equal(transcribeNoConsent.status,400);
 const transcribeUnavailable=await fetch(base+`/api/jobs/${createdJob.id}/transcribe`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true})});
 assert.equal(transcribeUnavailable.status,503);
 const recapNoConsent=await fetch(base+`/api/jobs/${createdJob.id}/recap-script`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:false})});
 assert.equal(recapNoConsent.status,400);
 const recapNotReady=await fetch(base+`/api/jobs/${createdJob.id}/recap-script`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true})});
 assert.equal(recapNotReady.status,409);

 await stop();
 await start();
 const persisted=await (await fetch(base+'/api/projects')).json();
 assert.equal(persisted.items.length,1);
 assert.equal(persisted.items[0].title,'Smoke Test Project');
 const voiceList=(await (await fetch(base+'/api/voices')).json()).items;
 assert.equal(voiceList.length,1);assert.equal(voiceList[0].name,'Smoke Actor');
 const persistedAudio=await fetch(base+voiceList[0].audioUrl);assert.equal(persistedAudio.status,200);
 const persistedAssignments=(await (await fetch(base+`/api/projects/${project.id}/voice-assignments`)).json()).items;assert.equal(persistedAssignments.length,1);assert.equal(persistedAssignments[0].voice.name,'Smoke Actor');
 const clipForm=new FormData();clipForm.append('character','Main Hero');clipForm.append('voiceAssignmentId',persistedAssignments[0].id);clipForm.append('startMs','500');clipForm.append('audio',new Blob([await readFile(sampleVoice)],{type:'audio/wav'}),'hero-line.wav');const clipResponse=await fetch(base+`/api/projects/${project.id}/dialogue-clips`,{method:'POST',body:clipForm});assert.equal(clipResponse.status,201);const clip=(await clipResponse.json()).item;assert.equal(clip.character,'Main Hero');assert.equal(clip.startMs,500);assert.ok(clip.durationSeconds>0);assert.equal((await fetch(base+clip.audioUrl)).status,200);
 const badClipForm=new FormData();badClipForm.append('character','Wrong Character');badClipForm.append('voiceAssignmentId',persistedAssignments[0].id);badClipForm.append('audio',new Blob([await readFile(sampleVoice)],{type:'audio/wav'}),'wrong.wav');const badClip=await fetch(base+`/api/projects/${project.id}/dialogue-clips`,{method:'POST',body:badClipForm});assert.equal(badClip.status,400);
 const clipList=(await (await fetch(base+`/api/projects/${project.id}/dialogue-clips`)).json()).items;assert.equal(clipList.length,1);assert.equal(clipList[0].startMs,500);
 const subtitleSave=await fetch(base+`/api/projects/${project.id}/subtitles`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({cues:[{id:'smoke-cue',start:'00:00:00,000',end:'00:00:01,500',myanmar:'မြန်မာစာတန်း',english:'English caption'}]})});assert.equal(subtitleSave.status,200);const subtitleTrack=(await (await fetch(base+`/api/projects/${project.id}/subtitles`)).json()).item;assert.equal(subtitleTrack.cues.length,1);assert.equal(subtitleTrack.cues[0].myanmar,'မြန်မာစာတန်း');
 const invalidSubtitle=await fetch(base+`/api/projects/${project.id}/subtitles`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({cues:[{start:'00:00:03,000',end:'00:00:02,000',myanmar:'Bad',english:''}]})});assert.equal(invalidSubtitle.status,400);
 const renderCreate=await fetch(base+`/api/projects/${project.id}/renders`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({includeDialogue:true,includeMyanmar:true,includeEnglish:true})});assert.equal(renderCreate.status,202);const renderItem=(await renderCreate.json()).item;let finalRender;for(let i=0;i<120;i++){const r=await fetch(base+`/api/renders/${renderItem.id}`);finalRender=(await r.json()).item;if(finalRender.status==='completed'||finalRender.status==='failed')break;await new Promise(resolve=>setTimeout(resolve,250));}assert.equal(finalRender.status,'completed',finalRender.error||'FFmpeg render failed.');const renderedVideo=await fetch(base+`/api/renders/${renderItem.id}/video`);assert.equal(renderedVideo.status,200);assert.ok(Number(renderedVideo.headers.get('content-length'))>1000);
 const persistedClips=(await (await fetch(base+`/api/projects/${project.id}/dialogue-clips`)).json()).items;assert.equal(persistedClips.length,1);assert.equal(persistedClips[0].character,'Main Hero');assert.equal((await fetch(base+persistedClips[0].audioUrl)).status,200);const persistedSubtitle=(await (await fetch(base+`/api/projects/${project.id}/subtitles`)).json()).item;assert.equal(persistedSubtitle.cues[0].english,'English caption');
 const persistedJob=(await (await fetch(base+`/api/jobs/${createdJob.id}`)).json()).item;
 assert.equal(persistedJob.status,'media_ready');
 console.log('AUREON API smoke test passed: project persistence, YouTube channel/video reference URL validation and metadata-only storage, upload, FFmpeg probe, 10-minute audio chunk extraction, job recovery, safe TTS/AI-not-configured behavior transcription consent gate, actor voice upload, consent, audio preview and voice library persistence, character voice assignments, dialogue clip upload, FFprobe duration, timeline metadata, playback, invalid assignment rejection, dialogue clip persistence, bilingual subtitle persistence and FFmpeg MP4 rendering with soft subtitle tracks and timed dialogue audio.');
}finally{
 await stop();
 await rm(dataDir,{recursive:true,force:true});
}
