import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { unlink } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { addJob, addProject, addSource, getJobs, getProjects, getProject, getSources, getJob, updateJob, getVoiceProfiles, getVoiceProfile, addVoiceProfile, getVoiceAssignments, assignVoiceToCharacter, getDialogueClips, getDialogueClip, addDialogueClip, getSubtitleTrack, saveSubtitleTrack, getRenderJobs, getRenderJob, addRenderJob, initializeStore, storageDirectory } from './store.js';
import { enqueueMediaJob, resumePendingMediaJobs } from './mediaWorker.js';
import { azureTtsStatus, synthesizeBurmese, type BurmeseVoice } from './tts/azureSpeech.js';
import { geminiStatus, generateBurmeseRecap } from './ai/gemini.js';
import { enqueueTranscriptionJob, resumePendingTranscriptionJobs } from './ai/transcriptionWorker.js';
import { enqueueRenderJob, resumePendingRenderJobs } from './renderWorker.js';

const execFileAsync=promisify(execFile);
const app=express();
const port=Number(process.env.PORT||8787);
const host=process.env.HOST||'127.0.0.1';
const uploadLimitMb=Math.max(1,Number(process.env.AUREON_MAX_UPLOAD_MB||1024));
const uploadsDir=path.join(storageDirectory(),'uploads');
const voiceDir=path.join(storageDirectory(),'voice-profiles');
const dialogueDir=path.join(storageDirectory(),'dialogue-clips');
app.disable('x-powered-by');
app.use((req,res,next)=>{
 const origin=req.headers.origin;
 if(origin==='http://127.0.0.1:5173'||origin==='http://localhost:5173')res.setHeader('Access-Control-Allow-Origin',origin);
 res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
 res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
 if(req.method==='OPTIONS')return res.sendStatus(204);
 next();
});
app.use(express.json({limit:'1mb'}));
app.use('/api',(req,res,next)=>{
 const token=process.env.AUREON_API_TOKEN;
 if(token&&req.headers.authorization!==`Bearer ${token}`)return res.status(401).json({error:'Unauthorized'});
 next();
});
const storage=multer.diskStorage({
 destination:async(_req,_file,cb)=>{try{await mkdir(uploadsDir,{recursive:true});
await mkdir(voiceDir,{recursive:true});cb(null,uploadsDir)}catch(e){cb(e as Error,uploadsDir)}},
 filename:(_req,file,cb)=>{const ext=path.extname(file.originalname).slice(0,12).toLowerCase();cb(null,`${randomUUID()}${ext}`)}
});
const upload=multer({storage,limits:{fileSize:uploadLimitMb*1024*1024,files:1},fileFilter:(_req,file,cb)=>{
 const allowed=new Set(['video/mp4','video/quicktime','video/x-matroska','video/webm','video/x-msvideo','video/mpeg']);
 if(!allowed.has(file.mimetype))return cb(new Error('Unsupported video type. Allowed: MP4, MOV, MKV, WEBM, AVI, MPEG.'));
 cb(null,true);
}});
const voiceStorage=multer.diskStorage({destination:async(_req,_file,cb)=>{try{await mkdir(voiceDir,{recursive:true});cb(null,voiceDir)}catch(e){cb(e as Error,voiceDir)}},filename:(_req,file,cb)=>{const ext=path.extname(file.originalname).slice(0,10).toLowerCase();cb(null,randomUUID()+ext)}});
const voiceUpload=multer({storage:voiceStorage,limits:{fileSize:30*1024*1024,files:1},fileFilter:(_req,file,cb)=>{const allowed=new Set(['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4','audio/x-m4a','audio/ogg','audio/webm','audio/aac','audio/flac']);if(!allowed.has(file.mimetype))return cb(new Error('Unsupported actor audio. Use MP3, WAV, M4A, OGG, WEBM, AAC or FLAC.'));cb(null,true)}});
const dialogueStorage=multer.diskStorage({destination:async(_req,_file,cb)=>{try{await mkdir(dialogueDir,{recursive:true});cb(null,dialogueDir)}catch(e){cb(e as Error,dialogueDir)}},filename:(_req,file,cb)=>{const ext=path.extname(file.originalname).slice(0,10).toLowerCase();cb(null,randomUUID()+ext)}});
const dialogueUpload=multer({storage:dialogueStorage,limits:{fileSize:30*1024*1024,files:1},fileFilter:(_req,file,cb)=>{const allowed=new Set(['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4','audio/x-m4a','audio/ogg','audio/webm','audio/aac','audio/flac']);if(!allowed.has(file.mimetype))return cb(new Error('Unsupported dialogue audio. Use MP3, WAV, M4A, OGG, WEBM, AAC or FLAC.'));cb(null,true)}});
const modes=new Set(['Cinematic','Dialogue Breakdown','Narrator Story','Full Deep Dive','Short Viral 60s']);
app.get('/api/health',(_req,res)=>res.json({ok:true,service:'AUREON AI API',version:'0.7.0',features:{projects:true,localUpload:true,durableJsonStore:true,mediaPreparation:true,aiGeneration:geminiStatus().configured,aiScriptGeneration:geminiStatus().configured,audioTranscription:geminiStatus().configured,burmeseTts:azureTtsStatus().configured,videoRendering:true,subtitlePersistence:true,oauthPublishing:false}}));
app.get('/api/voices',(_req,res)=>res.json({items:getVoiceProfiles().map(({path:_path,...item})=>({...item,audioUrl:`/api/voices/${item.id}/audio`}))}));
app.post('/api/voices',voiceUpload.single('audio'),async(req,res,next)=>{
 try{
  const name=typeof req.body?.name==='string'?req.body.name.trim():'';
  const character=typeof req.body?.character==='string'?req.body.character.trim():'';
  if(!name||name.length>60){if(req.file)await unlink(req.file.path).catch(()=>undefined);return res.status(400).json({error:'Voice profile name is required (maximum 60 characters).'})}
  if(!character||character.length>60){if(req.file)await unlink(req.file.path).catch(()=>undefined);return res.status(400).json({error:'Character or role name is required (maximum 60 characters).'})}
  if(req.body?.consent!=='true'){if(req.file)await unlink(req.file.path).catch(()=>undefined);return res.status(400).json({error:'Confirm that you own this recording or have the voice actor’s permission.'})}
  if(!req.file)return res.status(400).json({error:'Select an actor voice recording first.'});
  try{const probe=await execFileAsync('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=codec_type','-of','csv=p=0',req.file.path]);if(!probe.stdout.includes('audio'))throw new Error('No audio stream found.')}catch{await unlink(req.file.path).catch(()=>undefined);return res.status(415).json({error:'The uploaded file is not a valid playable audio recording.'})}
  const item=await addVoiceProfile({name,character,language:'my-MM',fileName:req.file.originalname.slice(0,180),path:path.relative(process.cwd(),req.file.path),mimeType:req.file.mimetype,size:req.file.size,consentConfirmed:true});
  res.status(201).json({item:{...item,path:undefined,audioUrl:`/api/voices/${item.id}/audio`},note:'Voice sample saved as a recorded actor reference. It is not a cloned or generated voice.'});
 }catch(e){next(e)}
});
app.get('/api/voices/:id/audio',(req,res)=>{
 const id=String(req.params.id);if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:'Invalid voice profile id.'});
 const item=getVoiceProfile(id);if(!item)return res.status(404).json({error:'Voice recording not found.'});
 res.type(item.mimeType).sendFile(path.resolve(process.cwd(),item.path),error=>{if(error&&!res.headersSent)res.status(404).json({error:'Voice recording file not found.'});});
});
app.get('/api/tts/status',(_req,res)=>res.json(azureTtsStatus()));
app.get('/api/ai/status',(_req,res)=>res.json(geminiStatus()));
app.post('/api/ai/recap-script',async(req,res,next)=>{
 try{
  const transcript=typeof req.body?.transcript==='string'?req.body.transcript.trim():'';
  const recapMode=typeof req.body?.recapMode==='string'?req.body.recapMode:'Cinematic';
  const title=typeof req.body?.title==='string'?req.body.title.trim().slice(0,120):undefined;
  if(!transcript||transcript.length>100000)return res.status(400).json({error:'Paste a transcript (maximum 100,000 characters).'});
  if(req.body?.consent!==true)return res.status(400).json({error:'Confirm the Google Gemini Free Tier data-use notice before sending this transcript.'});
  if(!modes.has(recapMode))return res.status(400).json({error:'Invalid recap mode.'});
  if(!geminiStatus().configured)return res.status(503).json({error:'AI recap is not configured. Add GEMINI_API_KEY to the private server environment.'});
  const result=await generateBurmeseRecap({transcript,mode:recapMode,title});
  res.status(201).json({item:result,note:'Draft generated from the transcript you provided. Review names and story details before using it.'});
 }catch(e){next(e)}
});
app.post('/api/tts/synthesize',async(req,res,next)=>{
 try{
  const text=typeof req.body?.text==='string'?req.body.text.trim():'';
  const voice=typeof req.body?.voice==='string'?req.body.voice:'Nilar';
  if(!text||text.length>4500)return res.status(400).json({error:'Myanmar narration text is required (maximum 4,500 characters per request).'});
  if(req.body?.consent!==true)return res.status(400).json({error:'Confirm that you agree to send this narration text to Azure Speech.'});
  if(voice!=='Nilar'&&voice!=='Thiha')return res.status(400).json({error:'Choose one of the supported Burmese voices.'});
  if(!azureTtsStatus().configured)return res.status(503).json({error:'Myanmar TTS is not configured. Add the Azure Speech F0 key and region to server environment settings.'});
  const result=await synthesizeBurmese(text,voice as BurmeseVoice);
  res.status(201).json({item:{...result,audioUrl:`/api/tts/audio/${result.id}`,language:'my-MM'}});
 }catch(e){next(e)}
});
app.get('/api/tts/audio/:id',(req,res)=>{
 const id=String(req.params.id);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({error:'Invalid audio id.'});
 res.type('audio/mpeg').sendFile(path.join(storageDirectory(),'tts',id+'.mp3'),error=>{if(error&&!res.headersSent)res.status(404).json({error:'Audio file not found.'});});
});
app.get('/api/projects',(_req,res)=>res.json({items:getProjects()}));
app.post('/api/projects',async(req,res,next)=>{
 try{const title=typeof req.body?.title==='string'?req.body.title.trim():'';const recapMode=typeof req.body?.recapMode==='string'?req.body.recapMode:'Cinematic';
 if(!title||title.length>120)return res.status(400).json({error:'Project title is required (maximum 120 characters).'});
 if(!modes.has(recapMode))return res.status(400).json({error:'Invalid recap mode.'});
 res.status(201).json({item:await addProject({title,recapMode})});}catch(e){next(e)}
});
app.get('/api/projects/:id/sources',(req,res)=>{if(!getProject(String(req.params.id)))return res.status(404).json({error:'Project not found.'});res.json({items:getSources(String(req.params.id))})});
app.post('/api/projects/:id/upload',upload.single('video'),async(req,res,next)=>{
 try{const project=getProject(String(req.params.id));if(!project)return res.status(404).json({error:'Project not found.'});
 if(!req.file)return res.status(400).json({error:'Select a supported video file.'});
 const item=await addSource({projectId:project.id,kind:'upload',name:req.file.originalname.slice(0,240),path:path.relative(process.cwd(),req.file.path),mimeType:req.file.mimetype,size:req.file.size,status:'stored'});
 res.status(201).json({item,note:'File saved to local storage. AI processing has not started.'});
 }catch(e){next(e)}
});
app.post('/api/projects/:id/url-source',async(req,res,next)=>{
 try{const project=getProject(String(req.params.id));if(!project)return res.status(404).json({error:'Project not found.'});
 const raw=typeof req.body?.url==='string'?req.body.url.trim():'';
 let parsed:URL;try{parsed=new URL(raw)}catch{return res.status(400).json({error:'Enter a valid public http(s) URL.'})}
 if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||!parsed.hostname||['localhost','127.0.0.1','::1'].includes(parsed.hostname.toLowerCase()))return res.status(400).json({error:'Only public http(s) URLs are accepted.'});
 const item=await addSource({projectId:project.id,kind:'url',name:parsed.hostname,url:parsed.toString(),status:'awaiting_review'});
 res.status(201).json({item,note:'URL saved for review only. This server does not download or process remote media yet.'});
 }catch(e){next(e)}
});
app.post('/api/projects/:id/recap-jobs',async(req,res,next)=>{
 try{const project=getProject(String(req.params.id));if(!project)return res.status(404).json({error:'Project not found.'});
 const source=getSources(project.id).filter(x=>x.kind==='upload'&&x.path).at(-1);
 if(!source)return res.status(400).json({error:'Upload a local video source before starting media preparation. URL sources are metadata-only.'});
 const item=await addJob(project.id,source.id);void enqueueMediaJob(item.id);res.status(202).json({item,note:'Media preparation job queued. AI recap generation has not started.'});
 }catch(e){next(e)}
});

app.get('/api/projects/:id/voice-assignments',(req,res)=>{
 const project=getProject(String(req.params.id));if(!project)return res.status(404).json({error:'Project not found.'});
 const items=getVoiceAssignments(project.id).map(item=>{const voice=getVoiceProfile(item.voiceProfileId);return {...item,voice:voice?{id:voice.id,name:voice.name,fileName:voice.fileName,audioUrl:'/api/voices/'+voice.id+'/audio'}:null};});
 res.json({items});
});
app.post('/api/projects/:id/voice-assignments',async(req,res,next)=>{
 try{
  const project=getProject(String(req.params.id));if(!project)return res.status(404).json({error:'Project not found.'});
  const voiceProfileId=typeof req.body?.voiceProfileId==='string'?req.body.voiceProfileId:'';
  const character=typeof req.body?.character==='string'?req.body.character.trim():'';
  if(!character||character.length>60)return res.status(400).json({error:'Character name is required (maximum 60 characters).'});
  const voice=getVoiceProfile(voiceProfileId);if(!voice)return res.status(404).json({error:'Actor voice profile not found.'});
  const item=await assignVoiceToCharacter({projectId:project.id,voiceProfileId,character});
  res.status(201).json({item:{...item,voice:{id:voice.id,name:voice.name,fileName:voice.fileName,audioUrl:'/api/voices/'+voice.id+'/audio'}},note:'Recorded voice sample assigned to this project character. This does not clone or synthesize speech.'});
 }catch(e){next(e)}
});

app.get('/api/projects/:id/dialogue-clips',(req,res)=>{const project=getProject(String(req.params.id));if(!project)return res.status(404).json({error:'Project not found.'});res.json({items:getDialogueClips(project.id).map(({path:_path,...item})=>({...item,audioUrl:`/api/dialogue-clips/${item.id}/audio`}))});});
app.post('/api/projects/:id/dialogue-clips',dialogueUpload.single('audio'),async(req,res,next)=>{try{const project=getProject(String(req.params.id));if(!project){if(req.file)await unlink(req.file.path).catch(()=>undefined);return res.status(404).json({error:'Project not found.'});}const character=typeof req.body?.character==='string'?req.body.character.trim():'';const startMs=Number(req.body?.startMs??0);const voiceAssignmentId=typeof req.body?.voiceAssignmentId==='string'&&req.body.voiceAssignmentId?req.body.voiceAssignmentId:undefined;if(!character||character.length>60){if(req.file)await unlink(req.file.path).catch(()=>undefined);return res.status(400).json({error:'Character name is required (maximum 60 characters).'});}if(!Number.isSafeInteger(startMs)||startMs<0||startMs>24*60*60*1000){if(req.file)await unlink(req.file.path).catch(()=>undefined);return res.status(400).json({error:'Start time must be a non-negative millisecond value within 24 hours.'});}if(!req.file)return res.status(400).json({error:'Select a dialogue audio clip.'});if(voiceAssignmentId){const assignment=getVoiceAssignments(project.id).find(x=>x.id===voiceAssignmentId);if(!assignment||assignment.character.toLocaleLowerCase()!==character.toLocaleLowerCase()){await unlink(req.file.path).catch(()=>undefined);return res.status(400).json({error:'Selected voice assignment must belong to this project and character.'});}}let durationSeconds=0;try{const probe=await execFileAsync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',req.file.path]);durationSeconds=Number(probe.stdout.trim());if(!Number.isFinite(durationSeconds)||durationSeconds<=0)throw new Error('Invalid duration');}catch{await unlink(req.file.path).catch(()=>undefined);return res.status(415).json({error:'The uploaded file is not a valid playable audio clip.'});}const item=await addDialogueClip({projectId:project.id,character,voiceAssignmentId,fileName:req.file.originalname.slice(0,180),path:path.relative(process.cwd(),req.file.path),mimeType:req.file.mimetype,size:req.file.size,durationSeconds,startMs});res.status(201).json({item:{...item,path:undefined,audioUrl:`/api/dialogue-clips/${item.id}/audio`},note:'Dialogue audio clip stored with character and timeline metadata. It is not yet mixed into a rendered video.'});}catch(e){next(e)}});
app.get('/api/dialogue-clips/:id/audio',(req,res)=>{const item=getDialogueClip(String(req.params.id));if(!item)return res.status(404).json({error:'Dialogue clip not found.'});res.type(item.mimeType).sendFile(path.resolve(process.cwd(),item.path),error=>{if(error&&!res.headersSent)res.status(404).json({error:'Dialogue clip file not found.'});});});

app.get('/api/projects/:id/subtitles',(req,res)=>{const project=getProject(String(req.params.id));if(!project)return res.status(404).json({error:'Project not found.'});res.json({item:getSubtitleTrack(project.id)});});
app.put('/api/projects/:id/subtitles',async(req,res,next)=>{try{const project=getProject(String(req.params.id));if(!project)return res.status(404).json({error:'Project not found.'});const cues=req.body?.cues;if(!Array.isArray(cues)||cues.length>10000)return res.status(400).json({error:'Subtitle cues must be an array with no more than 10,000 entries.'});const normalized=cues.map((cue:any,index:number)=>{const id=typeof cue?.id==='string'?cue.id.slice(0,80):`cue-${index+1}`;const start=typeof cue?.start==='string'?cue.start:'';const end=typeof cue?.end==='string'?cue.end:'';const myanmar=typeof cue?.myanmar==='string'?cue.myanmar:'';const english=typeof cue?.english==='string'?cue.english:'';const parse=(v:string)=>{const m=v.replace(',','.').match(/^(\\d{2}):(\\d{2}):(\\d{2})\\.(\\d{1,3})$/);if(!m)throw new Error('Invalid subtitle timestamp.');const [,h,mi,s,ms]=m;if(Number(mi)>59||Number(s)>59)throw new Error('Invalid subtitle timestamp.');return ((Number(h)*60+Number(mi))*60+Number(s))*1000+Number((ms+'000').slice(0,3));};if(!start||!end||(!myanmar.trim()&&!english.trim())||myanmar.length>5000||english.length>5000)throw new Error('Each subtitle cue needs valid timestamps and Myanmar or English text (max 5,000 characters per track).');if(parse(end)<=parse(start))throw new Error('Subtitle end time must be later than start time.');return {id,start,end,myanmar,english};});const item=await saveSubtitleTrack(project.id,normalized);res.json({item,note:'Myanmar and English subtitle tracks saved to project storage.'});}catch(e){next(e)}});
app.get('/api/projects/:id/renders', (req,res)=>{const project=getProject(String(req.params.id));if(!project)return res.status(404).json({error:'Project not found.'});res.json({items:getRenderJobs(project.id).map(x=>({...x,videoUrl:x.status==='completed'?`/api/renders/${x.id}/video`:undefined,outputPath:undefined}))});});
app.post('/api/projects/:id/renders',async(req,res,next)=>{try{const project=getProject(String(req.params.id));if(!project)return res.status(404).json({error:'Project not found.'});const source=getSources(project.id).filter(x=>x.kind==='upload'&&x.path).at(-1);if(!source)return res.status(400).json({error:'Upload a local video source before rendering.'});const options={includeDialogue:req.body?.includeDialogue!==false,includeMyanmar:req.body?.includeMyanmar!==false,includeEnglish:req.body?.includeEnglish!==false};const track=getSubtitleTrack(project.id);if(options.includeMyanmar&&!track.cues.some(x=>x.myanmar.trim()))options.includeMyanmar=false;if(options.includeEnglish&&!track.cues.some(x=>x.english.trim()))options.includeEnglish=false;if(!options.includeMyanmar&&!options.includeEnglish&&track.cues.length===0)options.includeMyanmar=false;const item=await addRenderJob({projectId:project.id,sourceId:source.id,...options});void enqueueRenderJob(item.id);res.status(202).json({item,note:'FFmpeg render queued. The output will contain the source video, optional dialogue clips and available soft subtitle tracks.'});}catch(e){next(e)}});
app.get('/api/renders/:id',(req,res)=>{const item=getRenderJob(String(req.params.id));if(!item)return res.status(404).json({error:'Render job not found.'});res.json({item:{...item,outputPath:undefined,videoUrl:item.status==='completed'?`/api/renders/${item.id}/video`:undefined}});});
app.get('/api/renders/:id/video',(req,res)=>{const item=getRenderJob(String(req.params.id));if(!item||item.status!=='completed'||!item.outputPath)return res.status(404).json({error:'Rendered video is not ready.'});res.type('video/mp4').download(path.resolve(process.cwd(),item.outputPath),`aureon-${item.id}.mp4`);});

app.get('/api/jobs',(_req,res)=>res.json({items:getJobs()}));
app.get('/api/jobs/:id',(req,res)=>{const item=getJob(String(req.params.id));if(!item)return res.status(404).json({error:'Job not found.'});res.json({item});});
app.post('/api/jobs/:id/transcribe',async(req,res,next)=>{
 try{
  const id=String(req.params.id);const job=getJob(id);
  if(!job)return res.status(404).json({error:'Job not found.'});
  if(req.body?.consent!==true)return res.status(400).json({error:'Confirm the Google Gemini Free Tier audio data-use notice before sending audio.'});
  if(!geminiStatus().configured)return res.status(503).json({error:'Audio transcription is not configured. Add GEMINI_API_KEY to the private server environment.'});
  if(job.status==='transcribed')return res.json({item:job,note:'This job already has a transcript.'});
  if(!job.outputDir||!['media_ready','failed','transcribing'].includes(job.status))return res.status(409).json({error:'Complete media preparation before starting audio transcription.'});
  await updateJob(id,{status:'transcribing',stage:'transcription_queued',transcriptionConsentAt:job.transcriptionConsentAt||new Date().toISOString(),error:undefined,note:'Audio transcription queued. Completed chunks will be reused.'});
  void enqueueTranscriptionJob(id);
  res.status(202).json({item:getJob(id),note:'Audio transcription queued. The video audio will be sent to Google Gemini under the consent you confirmed.'});
 }catch(e){next(e)}
});
app.use(express.static(path.resolve(process.cwd(),'dist')));
app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
 const err=error as Error & {code?:string};
 if(err instanceof multer.MulterError)return res.status(err.code==='LIMIT_FILE_SIZE'?413:400).json({error:err.code==='LIMIT_FILE_SIZE'?`File exceeds ${uploadLimitMb} MB upload limit.`:err.message});
 if(err.message.startsWith('Unsupported video type')||err.message.startsWith('Unsupported actor audio')||err.message.startsWith('Unsupported dialogue audio'))return res.status(415).json({error:err.message});
 if(err.message.startsWith('AI recap is not configured'))return res.status(503).json({error:err.message});
 if(err.message.startsWith('Gemini request failed')||err.message.startsWith('Gemini transcription failed'))return res.status(502).json({error:err.message});
 if(err.message.startsWith('Myanmar TTS is not configured'))return res.status(503).json({error:err.message});
 if(err.message.startsWith('Azure Speech request failed'))return res.status(502).json({error:err.message});
 res.status(500).json({error:err.message||'Internal server error.'});
});
await initializeStore();
await mkdir(uploadsDir,{recursive:true});
await resumePendingMediaJobs();
await resumePendingTranscriptionJobs();
await resumePendingRenderJobs();
app.listen(port,host,()=>console.log(`AUREON API listening on http://${host}:${port}`));
