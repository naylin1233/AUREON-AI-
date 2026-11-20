import { spawn } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { getJob, getSource, getJobs, storageDirectory, updateJob } from './store.js';

function run(command:string,args:string[]){
 return new Promise<string>((resolve,reject)=>{
  const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});
  let stdout='';let stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',(chunk:string)=>{stdout+=chunk;if(stdout.length>1_000_000)stdout=stdout.slice(-1_000_000)});
  child.stderr.on('data',(chunk:string)=>{stderr+=chunk;if(stderr.length>1_000_000)stderr=stderr.slice(-1_000_000)});
  child.on('error',error=>reject(new Error(`Could not start ${command}. Install FFmpeg and ensure it is on PATH. ${error.message}`)));
  child.on('close',code=>code===0?resolve(stdout.trim()):reject(new Error(stderr.trim()||`${command} exited with code ${code}`)));
 });
}
let queue=Promise.resolve();
export function enqueueMediaJob(jobId:string){
 queue=queue.then(()=>processMediaJob(jobId)).catch(error=>console.error('AUREON media worker queue error',error));
 return queue;
}
async function processMediaJob(jobId:string){
 const job=getJob(jobId);if(!job||!job.sourceId)return;
 try{
  await updateJob(jobId,{status:'processing',stage:'checking_media_tools',progress:3,note:'Checking FFmpeg and source file.'});
  const source=getSource(job.sourceId);
  if(!source||source.kind!=='upload'||!source.path)throw new Error('A local uploaded video source is required. URL imports are metadata-only.');
  const input=path.resolve(process.cwd(),source.path);
  const fileInfo=await stat(input);if(!fileInfo.isFile())throw new Error('Uploaded source file was not found.');
  await run('ffprobe',['-version']);
  await updateJob(jobId,{stage:'probing_video',progress:8,note:'Reading video duration and audio stream.'});
  const durationText=await run('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',input]);
  const duration=Number.parseFloat(durationText);
  if(!Number.isFinite(duration)||duration<=0)throw new Error('Could not read a valid video duration.');
  const audio=await run('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=codec_type','-of','csv=p=0',input]);
  if(!audio.includes('audio'))throw new Error('This video has no audio track to prepare for narration analysis.');
  const outputDir=path.join(storageDirectory(),'processed',jobId);
  await mkdir(outputDir,{recursive:true});
  await updateJob(jobId,{stage:'extracting_audio_chunks',progress:15,durationSeconds:duration,note:'Extracting mono 16 kHz WAV audio in 10-minute resumable-sized chunks.'});
  await run('ffmpeg',['-y','-nostdin','-hide_banner','-loglevel','error','-i',input,'-map','0:a:0','-vn','-ac','1','-ar','16000','-c:a','pcm_s16le','-f','segment','-segment_time','600','-reset_timestamps','1','-segment_format','wav',path.join(outputDir,'chunk-%04d.wav')]);
  const chunks=(await readdir(outputDir)).filter(name=>/^chunk-\d+\.wav$/.test(name)).sort();
  if(chunks.length===0)throw new Error('FFmpeg completed but no audio chunks were produced.');
  await updateJob(jobId,{stage:'extracting_sampled_frames',progress:65,note:'Extracting low-resolution reference frames every 30 seconds for later visual review.'});
  const framesDir=path.join(outputDir,'frames');
  await mkdir(framesDir,{recursive:true});
  await run('ffmpeg',['-y','-nostdin','-hide_banner','-loglevel','error','-i',input,'-vf','fps=1/30,scale=480:-2','-q:v','4',path.join(framesDir,'frame-%05d.jpg')]);
  const frames=(await readdir(framesDir)).filter(name=>/^frame-\d+\.jpg$/.test(name)).sort();
  if(frames.length===0)throw new Error('FFmpeg completed but no sampled reference frames were produced.');
  await updateJob(jobId,{status:'media_ready',stage:'media_preparation_complete',progress:100,chunkCount:chunks.length,frameCount:frames.length,outputDir:path.relative(process.cwd(),outputDir),note:`Media preparation complete: ${chunks.length} audio chunk(s) and ${frames.length} sampled reference frame(s). These are review assets, not AI scene analysis. Burmese TTS and final video rendering have not started.`});
 }catch(error){
  const message=error instanceof Error?error.message:'Unknown media processing error';
  await updateJob(jobId,{status:'failed',stage:'media_preparation_failed',progress:0,error:message,note:'Media preparation failed. Check FFmpeg installation and the uploaded file.'});
 }
}
export async function resumePendingMediaJobs(){
 for(const job of getJobs()){
  if(job.status==='queued'||job.status==='processing'){
   await updateJob(job.id,{status:'queued',stage:'queued',progress:0,note:'Resumed after server restart.'});
   void enqueueMediaJob(job.id);
  }
 }
}
