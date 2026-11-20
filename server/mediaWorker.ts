import { spawn } from 'node:child_process';
import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
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
async function probeDuration(filePath:string){
 const value=await run('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',filePath]);
 const duration=Number.parseFloat(value);
 if(!Number.isFinite(duration)||duration<=0)throw new Error('Could not read a valid media duration.');
 return duration;
}
async function isCompleteChunk(filePath:string,expectedSeconds:number){
 try{
  const info=await stat(filePath);if(!info.isFile()||info.size<=44)return false;
  const duration=await probeDuration(filePath);
  return duration>=Math.min(0.5,expectedSeconds*0.5)&&Math.abs(duration-expectedSeconds)<3;
 }catch{return false;}
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
  const duration=await probeDuration(input);
  const audio=await run('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=codec_type','-of','csv=p=0',input]);
  if(!audio.includes('audio'))throw new Error('This video has no audio track to prepare for narration analysis.');
  const outputDir=path.join(storageDirectory(),'processed',jobId);
  await mkdir(outputDir,{recursive:true});
  const chunkSeconds=600;
  const totalChunks=Math.ceil(duration/chunkSeconds);
  let completed=0;
  for(let index=0;index<totalChunks;index++){
   const start=index*chunkSeconds;
   const length=Math.min(chunkSeconds,duration-start);
   const name=`chunk-${String(index).padStart(4,'0')}.wav`;
   const finalPath=path.join(outputDir,name);
   if(await isCompleteChunk(finalPath,length)){completed++;}
   else{
    await unlink(finalPath).catch(()=>undefined);
    const tempPath=path.join(outputDir,`chunk-${String(index).padStart(4,'0')}.partial.wav`);
    await unlink(tempPath).catch(()=>undefined);
    await updateJob(jobId,{stage:`extracting_chunk_${index+1}_of_${totalChunks}`,progress:15+Math.floor((completed/totalChunks)*80),durationSeconds:duration,chunkCount:completed,note:`Preparing audio chunk ${index+1} of ${totalChunks}. Existing valid chunks are retained when a job resumes.`});
    await run('ffmpeg',['-y','-nostdin','-hide_banner','-loglevel','error','-ss',String(start),'-i',input,'-t',String(length),'-map','0:a:0','-vn','-ac','1','-ar','16000','-c:a','pcm_s16le','-f','wav',tempPath]);
    if(!(await isCompleteChunk(tempPath,length)))throw new Error(`Audio chunk ${index+1} failed validation after FFmpeg extraction.`);
    await rename(tempPath,finalPath);
    completed++;
   }
   await updateJob(jobId,{stage:`extracting_chunk_${index+1}_of_${totalChunks}`,progress:15+Math.floor((completed/totalChunks)*80),durationSeconds:duration,chunkCount:completed,note:`Prepared ${completed} of ${totalChunks} audio chunks. The worker can skip completed chunks after a restart.`});
  }
  const chunks=(await readdir(outputDir)).filter(name=>/^chunk-\d+\.wav$/.test(name)).sort();
  if(chunks.length!==totalChunks)throw new Error('Audio chunk count validation failed.');
  await updateJob(jobId,{status:'media_ready',stage:'media_preparation_complete',progress:100,chunkCount:chunks.length,durationSeconds:duration,outputDir:path.relative(process.cwd(),outputDir),note:`Media preparation complete: ${chunks.length} validated audio chunk(s). AI story analysis, Burmese TTS and video rendering have not started.`});
 }catch(error){
  const message=error instanceof Error?error.message:'Unknown media processing error';
  await updateJob(jobId,{status:'failed',stage:'media_preparation_failed',progress:0,error:message,note:'Media preparation failed. Check FFmpeg installation and the uploaded file.'});
 }
}
export async function resumePendingMediaJobs(){
 for(const job of getJobs()){
  if(job.status==='queued'||job.status==='processing'){
   await updateJob(job.id,{status:'queued',stage:'queued',progress:job.progress||0,note:'Resuming media preparation; valid completed chunks will be reused.'});
   void enqueueMediaJob(job.id);
  }
 }
}
