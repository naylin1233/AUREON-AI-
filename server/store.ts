import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type Project = { id:string; title:string; recapMode:string; createdAt:string; sourceIds:string[] };
export type Source = { id:string; projectId:string; kind:'upload'|'url'; name:string; path?:string; url?:string; mimeType?:string; size?:number; status:'stored'|'awaiting_review'; createdAt:string };
export type VoiceAssignment = {id:string;projectId:string;voiceProfileId:string;character:string;createdAt:string};
export type DialogueClip = {id:string;projectId:string;character:string;voiceAssignmentId?:string;fileName:string;path:string;mimeType:string;size:number;durationSeconds:number;startMs:number;createdAt:string};
export type VoiceProfile = {id:string;name:string;character:string;language:'my-MM';fileName:string;path:string;mimeType:string;size:number;consentConfirmed:true;createdAt:string};
export type JobStatus = 'queued'|'processing'|'media_ready'|'transcribing'|'transcribed'|'failed'|'awaiting_pipeline';
export type Job = { id:string; projectId:string; sourceId?:string; kind:'recap'; status:JobStatus; stage:string; progress:number; note:string; error?:string; outputDir?:string; durationSeconds?:number; chunkCount?:number; transcript?:string; transcriptChunks?:string[]; transcriptionConsentAt?:string; transcribedChunkCount?:number; transcriptionTotalChunks?:number; createdAt:string; updatedAt:string };
type State = { projects:Project[]; sources:Source[]; jobs:Job[]; voices:VoiceProfile[]; voiceAssignments:VoiceAssignment[]; dialogueClips:DialogueClip[] };
const empty = ():State => ({projects:[],sources:[],jobs:[],voices:[],voiceAssignments:[],dialogueClips:[]});
const dataDir = path.resolve(process.env.AUREON_DATA_DIR || './storage/data');
const statePath = path.join(dataDir,'state.json');
let state:State = empty();
let writeChain = Promise.resolve();

export async function initializeStore(){
 await mkdir(dataDir,{recursive:true});
 try { const parsed=JSON.parse(await readFile(statePath,'utf8')) as Partial<State>; state={projects:Array.isArray(parsed.projects)?parsed.projects:[],sources:Array.isArray(parsed.sources)?parsed.sources:[],jobs:Array.isArray(parsed.jobs)?parsed.jobs:[],voices:Array.isArray(parsed.voices)?parsed.voices:[],voiceAssignments:Array.isArray(parsed.voiceAssignments)?parsed.voiceAssignments:[],dialogueClips:Array.isArray(parsed.dialogueClips)?parsed.dialogueClips:[]}; }
 catch(error){ if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error; await persist(); }
}
async function persist(){
 const snapshot=JSON.stringify(state,null,2);
 const temp=statePath+'.tmp';
 writeChain=writeChain.then(async()=>{await writeFile(temp,snapshot,'utf8');await rename(temp,statePath);});
 await writeChain;
}
export function getProjects(){return [...state.projects].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export function getProject(id:string){return state.projects.find(x=>x.id===id);}
export function getSources(projectId?:string){return state.sources.filter(x=>!projectId||x.projectId===projectId);}
export function getSource(id:string){return state.sources.find(x=>x.id===id);}
export function getJobs(projectId?:string){return state.jobs.filter(x=>!projectId||x.projectId===projectId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export function getJob(id:string){return state.jobs.find(x=>x.id===id);}
export async function addProject(input:{title:string;recapMode:string}){
 const item:Project={id:randomUUID(),title:input.title,recapMode:input.recapMode,createdAt:new Date().toISOString(),sourceIds:[]};
 state.projects.push(item);await persist();return item;
}
export async function addSource(input:Omit<Source,'id'|'createdAt'>){
 const item:Source={...input,id:randomUUID(),createdAt:new Date().toISOString()};
 state.sources.push(item);const project=getProject(input.projectId);if(project)project.sourceIds.push(item.id);
 await persist();return item;
}
export async function addJob(projectId:string,sourceId:string){
 const now=new Date().toISOString();
 const item:Job={id:randomUUID(),projectId,sourceId,kind:'recap',status:'queued',stage:'queued',progress:0,note:'Waiting for local media preparation worker.',createdAt:now,updatedAt:now};
 state.jobs.push(item);await persist();return item;
}
export async function updateJob(id:string,patch:Partial<Omit<Job,'id'|'projectId'|'createdAt'>>){
 const item=getJob(id);if(!item)return undefined;
 Object.assign(item,patch,{updatedAt:new Date().toISOString()});await persist();return item;
}
export function storageDirectory(){return dataDir;}

export function getVoiceProfiles(){return [...state.voices].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export function getVoiceProfile(id:string){return state.voices.find(x=>x.id===id);}
export async function addVoiceProfile(input:Omit<VoiceProfile,'id'|'createdAt'>){
 const item:VoiceProfile={...input,id:randomUUID(),createdAt:new Date().toISOString()};
 state.voices.push(item);await persist();return item;
}

export function getDialogueClips(projectId:string){return state.dialogueClips.filter(x=>x.projectId===projectId).sort((a,b)=>a.startMs-b.startMs||a.createdAt.localeCompare(b.createdAt));}
export function getDialogueClip(id:string){return state.dialogueClips.find(x=>x.id===id);}
export async function addDialogueClip(input:Omit<DialogueClip,'id'|'createdAt'>){const item:DialogueClip={...input,id:randomUUID(),createdAt:new Date().toISOString()};state.dialogueClips.push(item);await persist();return item;}

export function getVoiceAssignments(projectId:string){return state.voiceAssignments.filter(x=>x.projectId===projectId).sort((a,b)=>a.character.localeCompare(b.character));}
export async function assignVoiceToCharacter(input:{projectId:string;voiceProfileId:string;character:string}){const existing=state.voiceAssignments.find(x=>x.projectId===input.projectId&&x.character.toLocaleLowerCase()===input.character.toLocaleLowerCase());if(existing){existing.voiceProfileId=input.voiceProfileId;await persist();return existing;}const item:VoiceAssignment={...input,id:randomUUID(),createdAt:new Date().toISOString()};state.voiceAssignments.push(item);await persist();return item;}
