import { spawn } from 'node:child_process';
import { mkdir, stat, writeFile, unlink, rm } from 'node:fs/promises';
import path from 'node:path';
import { getDialogueClips, getProject, getRenderJob, getSource, getSubtitleTrack, getRenderJobs, storageDirectory, updateRenderJob } from './store.js';

function run(command:string,args:string[],onProgress?:(value:string)=>void){
 return new Promise<void>((resolve,reject)=>{
  const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',(chunk:string)=>{stdout+=chunk;let index:number;while((index=stdout.indexOf('\n'))>=0){const line=stdout.slice(0,index).trim();stdout=stdout.slice(index+1);if(line)onProgress?.(line);}});
  child.stderr.on('data',(chunk:string)=>{stderr+=chunk;if(stderr.length>200000)stderr=stderr.slice(-200000)});
  child.on('error',error=>reject(new Error(`Could not start ${command}. Install FFmpeg and ensure it is on PATH. ${error.message}`)));
  child.on('close',code=>code===0?resolve():reject(new Error(stderr.trim()||`${command} exited with code ${code}`)));
 });
}
function toMs(value:string){const m=value.replace(',','.').match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{1,3})$/);if(!m)throw new Error('Invalid stored subtitle timestamp.');return ((Number(m[1])*60+Number(m[2]))*60+Number(m[3]))*1000+Number((m[4]+'000').slice(0,3));}
function makeSrt(cues:{start:string;end:string;myanmar:string;english:string}[],language:'myanmar'|'english'){
 const selected=cues.filter(c=>(language==='myanmar'?c.myanmar:c.english).trim());
 return selected.map((cue,i)=>{if(toMs(cue.end)<=toMs(cue.start))throw new Error('Subtitle end time must be later than start time.');const text=language==='myanmar'?cue.myanmar:cue.english;return `${i+1}\n${cue.start.replace('.',',')} --> ${cue.end.replace('.',',')}\n${text.trim()}`;}).join('\n\n')+'\n';
}
let queue=Promise.resolve();
export function enqueueRenderJob(id:string){queue=queue.then(()=>processRenderJob(id)).catch(error=>console.error('AUREON render queue error',error));return queue;}
async function processRenderJob(id:string){
 const job=getRenderJob(id);if(!job)return;
 const workDir=path.join(storageDirectory(),'renders');const tempDir=path.join(workDir,id+'-tmp');const output=path.join(workDir,id+'.mp4');
 try{
  const project=getProject(job.projectId);const source=getSource(job.sourceId);if(!project||!source||source.kind!=='upload'||!source.path)throw new Error('A project and uploaded local video source are required.');
  const input=path.resolve(process.cwd(),source.path);const sourceInfo=await stat(input);if(!sourceInfo.isFile())throw new Error('Uploaded source video is missing.');
  await mkdir(tempDir,{recursive:true});await mkdir(workDir,{recursive:true});
  const durationText=await new Promise<string>((resolve,reject)=>{let out='';const child=spawn('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',input],{stdio:['ignore','pipe','pipe']});child.stdout.setEncoding('utf8');child.stdout.on('data',x=>out+=x);child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(new Error('Could not read source duration.')));});
  const duration=Number(durationText);if(!Number.isFinite(duration)||duration<=0)throw new Error('Invalid source video duration.');
  await updateRenderJob(id,{status:'rendering',progress:2,durationSeconds:duration,note:'Preparing video, dialogue audio and subtitle tracks for FFmpeg.'});
  const clips=job.includeDialogue?getDialogueClips(job.projectId):[];
  const track=getSubtitleTrack(job.projectId);
  const args=['-y','-nostdin','-hide_banner','-loglevel','error','-i',input];
  for(const clip of clips){const clipPath=path.resolve(process.cwd(),clip.path);const clipInfo=await stat(clipPath);if(!clipInfo.isFile())throw new Error(`Dialogue audio is missing: ${clip.fileName}`);args.push('-i',clipPath);}
  const subtitleInputs:{language:'myanmar'|'english';file:string}[]=[];
  if(job.includeMyanmar&&track.cues.some(c=>c.myanmar.trim())){const file=path.join(tempDir,'myanmar.srt');await writeFile(file,makeSrt(track.cues,'myanmar'),'utf8');args.push('-i',file);subtitleInputs.push({language:'myanmar',file});}
  if(job.includeEnglish&&track.cues.some(c=>c.english.trim())){const file=path.join(tempDir,'english.srt');await writeFile(file,makeSrt(track.cues,'english'),'utf8');args.push('-i',file);subtitleInputs.push({language:'english',file});}
  const filters:string[]=[];
  if(clips.length){filters.push('[0:a:0]aresample=48000[base]');clips.forEach((clip,i)=>{filters.push(`[${i+1}:a:0]adelay=${clip.startMs}|${clip.startMs},aresample=48000[d${i}]`);});const inputs=['[base]',...clips.map((_,i)=>`[d${i}]`)].join('');filters.push(`${inputs}amix=inputs=${clips.length+1}:duration=first:dropout_transition=0:normalize=0[aout]`);}
  if(filters.length)args.push('-filter_complex',filters.join(';'));
  args.push('-map','0:v:0');if(clips.length)args.push('-map','[aout]');else args.push('-map','0:a:0');
  subtitleInputs.forEach((sub,i)=>{const inputIndex=1+clips.length+i;args.push('-map',`${inputIndex}:s:0`);});
  args.push('-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-c:s','mov_text','-movflags','+faststart','-shortest','-progress','pipe:1','-nostats');
  subtitleInputs.forEach((sub,i)=>args.push(`-metadata:s:s:${i}`,`language=${sub.language==='myanmar'?'mya':'eng'}`));
  args.push(output);
  await run('ffmpeg',args,line=>{if(line.startsWith('out_time_ms=')){const ms=Number(line.slice(12))/1000;if(Number.isFinite(ms))void updateRenderJob(id,{progress:Math.min(96,Math.max(5,Math.floor(ms/(duration*1000)*95))),note:'FFmpeg is encoding the video and mixing dialogue audio.'});}});
  const result=await stat(output);if(!result.isFile()||result.size<1024)throw new Error('FFmpeg output validation failed: rendered MP4 is empty or too small.');
  await updateRenderJob(id,{status:'completed',progress:100,outputPath:path.relative(process.cwd(),output),note:'MP4 render complete. Dialogue clips are mixed at their timeline offsets; Myanmar/English subtitles are included as selectable soft tracks.'});
 }catch(error){const message=error instanceof Error?error.message:'Unknown rendering error';await unlink(output).catch(()=>undefined);await updateRenderJob(id,{status:'failed',progress:0,error:message,note:'FFmpeg rendering failed. Check source media, dialogue clips and FFmpeg support.'});}
 finally{await rm(tempDir,{recursive:true,force:true}).catch(()=>undefined);}
}
export async function resumePendingRenderJobs(){for(const job of getRenderJobs('')){if(job.status==='queued'||job.status==='rendering'){await updateRenderJob(job.id,{status:'queued',progress:job.progress||0,note:'Resuming FFmpeg render job.'});void enqueueRenderJob(job.id);}}}
