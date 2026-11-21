import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { getJob, getJobs, storageDirectory, updateJob } from '../store.js';
import { transcribeAudioChunk } from './transcribe.js';
import { isUsableTranscript } from './transcriptText.js';

// A saved chunk is a string. '' means "processed, no speech found" and must not be re-sent to Gemini on resume.
const isProcessed=(chunk:unknown)=>typeof chunk==='string';
const speechChunks=(chunks:unknown[])=>chunks.filter((chunk):chunk is string=>typeof chunk==='string'&&chunk.trim().length>0);
const processedCount=(chunks:unknown[])=>chunks.filter(isProcessed).length;

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
  await updateJob(jobId,{status:'transcribing',stage:'transcribing_audio',progress:0,error:undefined,transcriptionTotalChunks:chunks.length,transcribedChunkCount:processedCount(transcripts),note:'Sending audio chunks to Google Gemini for original-language transcription. This requires the consent recorded for this job.'});
  for(let index=0;index<chunks.length;index++){
   if(isProcessed(transcripts[index]))continue;
   await updateJob(jobId,{status:'transcribing',stage:`transcribing_chunk_${index+1}_of_${chunks.length}`,progress:Math.floor((index/chunks.length)*100),transcriptionTotalChunks:chunks.length,transcribedChunkCount:processedCount(transcripts),note:`Transcribing audio chunk ${index+1} of ${chunks.length}.`});
   const text=await transcribeAudioChunk(path.join(outputDir,chunks[index]),index);
   transcripts[index]=text;
   const completed=processedCount(transcripts);
   await updateJob(jobId,{status:'transcribing',stage:`transcribing_chunk_${index+1}_of_${chunks.length}`,progress:Math.floor((completed/chunks.length)*100),transcriptChunks:transcripts,transcript:speechChunks(transcripts).join('\n\n'),transcribedChunkCount:completed,transcriptionTotalChunks:chunks.length,note:text?`Transcribed ${completed} of ${chunks.length} audio chunks. Completed chunks are saved and reused if processing is interrupted.`:`Processed ${completed} of ${chunks.length} audio chunks. Chunk ${index+1} had no detectable speech and was skipped.`});
  }
  const spoken=speechChunks(transcripts);
  const transcript=spoken.join('\n\n').trim();
  if(!isUsableTranscript(transcript)){
   // Nothing but silence, music or unclear audio: never mark this as transcribed, so recap generation stays blocked.
   // Saved chunks are cleared so a deliberate retry sends the audio to Gemini again.
   await updateJob(jobId,{status:'failed',stage:'transcription_no_speech',progress:0,transcriptChunks:[],transcript:undefined,transcribedChunkCount:0,transcriptionTotalChunks:chunks.length,error:'No speech was detected in the audio (only silence, music, noise or unclear sound). No transcript was saved and no recap script can be generated from this job.',note:'No usable speech found. If you expect this video to contain speech, check the audio track and retry transcription.'});
   return;
  }
  const silent=chunks.length-spoken.length;
  await updateJob(jobId,{status:'transcribed',stage:'transcription_complete',progress:100,transcriptChunks:transcripts,transcript,transcribedChunkCount:chunks.length,transcriptionTotalChunks:chunks.length,note:`Transcription complete: ${chunks.length} audio chunk(s)${silent?`, ${silent} without detectable speech`:''}. Review the transcript before generating a recap script.`});
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
