import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { getJob, getJobs, storageDirectory, updateJob } from '../store.js';
import { transcribeAudioChunk } from './transcribe.js';

let queue=Promise.resolve();
export function enqueueTranscriptionJob(jobId:string){
 queue=queue.then(()=>processTranscriptionJob(jobId)).catch(error=>console.error('AUREON transcription queue error',error));
 return queue;
}
async function processTranscriptionJob(jobId:string){
 const job=getJob(jobId);if(!job||!job.transcriptionConsentAt)return;
 const outputDir=path.join(storageDirectory(),'processed',jobId);
 try{
  const chunks=(await readdir(outputDir)).filter(name=>/^chunk-\d+\.wav$/.test(name)).sort();
  if(!chunks.length)throw new Error('No prepared audio chunks were found for this job.');
  const transcripts=[...(job.transcriptChunks||[])];
  await updateJob(jobId,{status:'transcribing',stage:'transcribing_audio',progress:0,error:undefined,transcriptionTotalChunks:chunks.length,transcribedChunkCount:transcripts.filter(Boolean).length,note:'Sending audio chunks to Google Gemini for original-language transcription. This requires the consent recorded for this job.'});
  for(let index=0;index<chunks.length;index++){
   if(transcripts[index])continue;
   await updateJob(jobId,{status:'transcribing',stage:`transcribing_chunk_${index+1}_of_${chunks.length}`,progress:Math.floor((index/chunks.length)*100),transcriptionTotalChunks:chunks.length,transcribedChunkCount:transcripts.filter(Boolean).length,note:`Transcribing audio chunk ${index+1} of ${chunks.length}.`});
   const text=await transcribeAudioChunk(path.join(outputDir,chunks[index]),index);
   transcripts[index]=text;
   const completed=transcripts.filter(Boolean).length;
   await updateJob(jobId,{status:'transcribing',stage:`transcribing_chunk_${index+1}_of_${chunks.length}`,progress:Math.floor((completed/chunks.length)*100),transcriptChunks:transcripts,transcript:transcripts.filter(Boolean).join('\n\n'),transcribedChunkCount:completed,transcriptionTotalChunks:chunks.length,note:`Transcribed ${completed} of ${chunks.length} audio chunks. Completed chunks are saved and reused if processing is interrupted.`});
  }
  const transcript=transcripts.filter(Boolean).join('\n\n').trim();
  if(!transcript)throw new Error('Transcription completed without any usable text.');
  await updateJob(jobId,{status:'transcribed',stage:'transcription_complete',progress:100,transcriptChunks:transcripts,transcript,transcribedChunkCount:chunks.length,transcriptionTotalChunks:chunks.length,note:`Transcription complete: ${chunks.length} audio chunk(s). Review the transcript before generating a recap script.`});
 }catch(error){
  const message=error instanceof Error?error.message:'Unknown transcription error';
  await updateJob(jobId,{status:'failed',stage:'transcription_failed',error:message,note:'Audio transcription failed. Completed chunks are preserved; retry after checking Gemini access and quota.'});
 }
}
export async function resumePendingTranscriptionJobs(){
 for(const job of getJobs()){
  if(job.status==='transcribing'&&job.transcriptionConsentAt)void enqueueTranscriptionJob(job.id);
 }
}
