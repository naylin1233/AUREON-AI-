export type Project = {id:string;title:string;recapMode:string;createdAt:string;sourceIds:string[]};
export type Source = {id:string;projectId:string;kind:'upload'|'url';name:string;path?:string;url?:string;mimeType?:string;size?:number;status:'stored'|'awaiting_review';createdAt:string};
export type ReferenceSource = {id:string;projectId:string;kind:'channel'|'video';url:string;title:string;channelName:string;language:string;notes:string;rightsStatus:'reference_only'|'authorized_for_use';createdAt:string};
export type TtsVoice = 'Nilar'|'Thiha';
export type ActorVoiceProfile = {id:string;name:string;character:string;language:'my-MM';fileName:string;mimeType:string;size:number;consentConfirmed:true;createdAt:string;audioUrl:string};
export type VoiceAssignment = {id:string;projectId:string;voiceProfileId:string;character:string;createdAt:string;voice:{id:string;name:string;fileName:string;audioUrl:string}|null};
export type DialogueClip = {id:string;projectId:string;character:string;voiceAssignmentId?:string;fileName:string;mimeType:string;size:number;durationSeconds:number;startMs:number;createdAt:string;audioUrl:string};
export type SubtitleCue = {id:string;start:string;end:string;myanmar:string;english:string};
export type SubtitleTrack = {projectId:string;cues:SubtitleCue[];updatedAt:string};
export type RenderJob = {id:string;projectId:string;sourceId:string;status:'queued'|'rendering'|'completed'|'failed';progress:number;note:string;includeDialogue:boolean;includeMyanmar:boolean;includeEnglish:boolean;durationSeconds?:number;error?:string;createdAt:string;updatedAt:string;videoUrl?:string};
export type RecapScript = {script:string;model:string;interactionId?:string;usage?:{total_tokens?:number;total_input_tokens?:number;total_output_tokens?:number}};
export type DailyTopic = {id:string;date:string;videoId:string;title:string;channelName:string;url:string;category:string;viewCount:number;publishedAt:string;selectedAt:string};
export type DailyTopicStatus = {configured:boolean;schedule:string;latest:DailyTopic|null;history:DailyTopic[];message:string};
export type PlatformPack = {youtube:{title:string;description:string;script:string;tags:string[]};facebook:{title:string;caption:string;script:string;tags:string[]};tiktok:{hook:string;caption:string;script:string;cta:string;tags:string[]}};
export type Job = {id:string;projectId:string;sourceId?:string;kind:'recap';status:'queued'|'processing'|'media_ready'|'transcribing'|'transcribed'|'failed'|'awaiting_pipeline';stage:string;progress:number;note:string;error?:string;outputDir?:string;chunkCount?:number;durationSeconds?:number;transcript?:string;recapScript?:string;recapScriptModel?:string;recapScriptGeneratedAt?:string;transcriptChunks?:string[];transcribedChunkCount?:number;transcriptionTotalChunks?:number;createdAt:string;updatedAt:string};
const API_BASE_URL='https://aureon-ai-backend-stz0.onrender.com';
async function request<T>(url:string,init?:RequestInit):Promise<T>{
 const response=await fetch(`${API_BASE_URL}${url}`,{...init,credentials:init?.credentials??'include'});
 const data=await response.json().catch(()=>({error:'Invalid API response'}));
 if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);
 return data as T;
}
export const api={
 authStatus:()=>request<{configured:boolean;authenticated:boolean}>('/api/auth/status'),
 login:(password:string)=>request<{authenticated:boolean}>('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})}),
 logout:()=>request<{authenticated:boolean}>('/api/auth/logout',{method:'POST'}),
 health:()=>request<{ok:boolean;service:string;features:Record<string,boolean>}>('/api/health'),
 projects:()=>request<{items:Project[]}>('/api/projects'),
 createProject:(title:string,recapMode:string)=>request<{item:Project}>('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,recapMode})}),
 sources:(id:string)=>request<{items:Source[]}>(`/api/projects/${id}/sources`),
 references:(id:string)=>request<{items:ReferenceSource[]}>(`/api/projects/${id}/references`),
 referenceDiscoveryStatus:()=>request<{configured:boolean;provider:string;schedule:string;lastRunAt:string|null;lastRunSummary:string;queryCount:number}>('/api/reference-discovery/status'),
 dailyTopicStatus:()=>request<DailyTopicStatus>('/api/daily-topic/status'),
 selectDailyTopic:()=>request<{item:DailyTopic|null;note:string;status:DailyTopicStatus}>('/api/daily-topic/select',{method:'POST'}),
 discoverReferences:(id:string,queries?:string)=>request<{item:{found:number;saved:number;queries:string[];note:string};items:ReferenceSource[];status:{configured:boolean;provider:string;schedule:string;lastRunAt:string|null;lastRunSummary:string;queryCount:number}}>(`/api/projects/${id}/references/discover`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({queries})}),
 addReference:(id:string,input:{url:string;title:string;channelName:string;language:string;notes:string;authorizedForUse:boolean})=>request<{item:ReferenceSource;note:string}>(`/api/projects/${id}/references`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),
 upload:(id:string,file:File)=>{const body=new FormData();body.append('video',file);return request<{item:Source;note:string}>(`/api/projects/${id}/upload`,{method:'POST',body})},
 addUrl:(id:string,url:string)=>request<{item:Source;note:string}>(`/api/projects/${id}/url-source`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})}),
 createJob:(id:string)=>request<{item:Job;note:string}>(`/api/projects/${id}/recap-jobs`,{method:'POST'}),
 job:(id:string)=>request<{item:Job}>(`/api/jobs/${id}`),
 transcribeJob:(id:string,consent:boolean)=>request<{item:Job;note:string}>(`/api/jobs/${id}/transcribe`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent})}),
 generateJobRecapScript:(id:string,consent:boolean)=>request<{item:Job;note:string}>(`/api/jobs/${id}/recap-script`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent})}),
 jobs:()=>request<{items:Job[]}>('/api/jobs'),
 aiStatus:()=>request<{configured:boolean;provider:string;model:string;transcriptionConfigured:boolean;transcriptionProvider:string;providers:{id:string;name:string;configured:boolean;role:string;cost:string;model?:string}[]}>('/api/ai/status'),
 generateRecapScript:(transcript:string,recapMode:string,title:string,consent:boolean)=>request<{item:RecapScript;note:string}>('/api/ai/recap-script',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript,recapMode,title,consent})}),
 generatePlatformPack:(title:string,recapScript:string,date:string,consent:boolean)=>request<{item:PlatformPack;model:string;note:string}>('/api/ai/platform-pack',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,recapScript,date,consent})}),
 subtitles:(projectId:string)=>request<{item:SubtitleTrack}>(`/api/projects/${projectId}/subtitles`),
 saveSubtitles:(projectId:string,cues:SubtitleCue[])=>request<{item:SubtitleTrack;note:string}>(`/api/projects/${projectId}/subtitles`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({cues})}),
 renders:(projectId:string)=>request<{items:RenderJob[]}>(`/api/projects/${projectId}/renders`),
 createRender:(projectId:string,options:{includeDialogue:boolean;includeMyanmar:boolean;includeEnglish:boolean})=>request<{item:RenderJob;note:string}>(`/api/projects/${projectId}/renders`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(options)}),
 render:(id:string)=>request<{item:RenderJob}>(`/api/renders/${id}`),
 voices:()=>request<{items:ActorVoiceProfile[]}>('/api/voices'),
 voiceAssignments:(projectId:string)=>request<{items:VoiceAssignment[]}>('/api/projects/'+projectId+'/voice-assignments'),
 dialogueClips:(projectId:string)=>request<{items:DialogueClip[]}>(`/api/projects/${projectId}/dialogue-clips`),
 addDialogueClip:(projectId:string,character:string,startMs:number,file:File,voiceAssignmentId?:string)=>{const body=new FormData();body.append('character',character);body.append('startMs',String(startMs));if(voiceAssignmentId)body.append('voiceAssignmentId',voiceAssignmentId);body.append('audio',file);return request<{item:DialogueClip;note:string}>(`/api/projects/${projectId}/dialogue-clips`,{method:'POST',body})},
 assignVoice:(projectId:string,voiceProfileId:string,character:string)=>request<{item:VoiceAssignment;note:string}>('/api/projects/'+projectId+'/voice-assignments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voiceProfileId,character})}),
 addVoice:(name:string,character:string,file:File,consent:boolean)=>{const body=new FormData();body.append('name',name);body.append('character',character);body.append('consent',String(consent));body.append('audio',file);return request<{item:ActorVoiceProfile;note:string}>('/api/voices',{method:'POST',body})},
 ttsStatus:()=>request<{configured:boolean;language:string;voices:{label:TtsVoice;id:string}[]}>('/api/tts/status'),
 synthesize:(text:string,voice:TtsVoice,consent:boolean)=>request<{item:{id:string;bytes:number;voice:string;audioUrl:string;language:string}}>('/api/tts/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,voice,consent})})
};
