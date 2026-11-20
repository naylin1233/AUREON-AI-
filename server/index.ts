import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { addJob, addProject, addSource, getJobs, getProjects, getProject, getSource, getSources, getJob, initializeStore, storageDirectory } from './store.js';
import { enqueueMediaJob, resumePendingMediaJobs } from './mediaWorker.js';

const app=express();
const port=Number(process.env.PORT||8787);
const host=process.env.HOST||'127.0.0.1';
const uploadLimitMb=Math.max(1,Number(process.env.AUREON_MAX_UPLOAD_MB||1024));
const uploadsDir=path.join(storageDirectory(),'uploads');
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
 destination:async(_req,_file,cb)=>{try{await mkdir(uploadsDir,{recursive:true});cb(null,uploadsDir)}catch(e){cb(e as Error,uploadsDir)}},
 filename:(_req,file,cb)=>{const ext=path.extname(file.originalname).slice(0,12).toLowerCase();cb(null,`${randomUUID()}${ext}`)}
});
const upload=multer({storage,limits:{fileSize:uploadLimitMb*1024*1024,files:1},fileFilter:(_req,file,cb)=>{
 const allowed=new Set(['video/mp4','video/quicktime','video/x-matroska','video/webm','video/x-msvideo','video/mpeg']);
 if(!allowed.has(file.mimetype))return cb(new Error('Unsupported video type. Allowed: MP4, MOV, MKV, WEBM, AVI, MPEG.'));
 cb(null,true);
}});
const modes=new Set(['Cinematic','Dialogue Breakdown','Narrator Story','Full Deep Dive','Short Viral 60s']);
app.get('/api/health',(_req,res)=>res.json({ok:true,service:'AUREON AI API',version:'0.3.0',features:{projects:true,localUpload:true,durableJsonStore:true,mediaPreparation:true,aiGeneration:false,burmeseTts:false,videoRendering:false,oauthPublishing:false}}));
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
app.get('/api/jobs',(_req,res)=>res.json({items:getJobs()}));
app.get('/api/jobs/:id',(req,res)=>{const item=getJob(String(req.params.id));if(!item)return res.status(404).json({error:'Job not found.'});res.json({item});});
app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
 const err=error as Error & {code?:string};
 if(err instanceof multer.MulterError)return res.status(err.code==='LIMIT_FILE_SIZE'?413:400).json({error:err.code==='LIMIT_FILE_SIZE'?`File exceeds ${uploadLimitMb} MB upload limit.`:err.message});
 res.status(500).json({error:err.message||'Internal server error.'});
});
await initializeStore();
await mkdir(uploadsDir,{recursive:true});
await resumePendingMediaJobs();
app.listen(port,host,()=>console.log(`AUREON API listening on http://${host}:${port}`));
