export type Project = {id:string;title:string;recapMode:string;createdAt:string;sourceIds:string[]};
export type Source = {id:string;projectId:string;kind:'upload'|'url';name:string;path?:string;url?:string;mimeType?:string;size?:number;status:'stored'|'awaiting_review';createdAt:string};
export type TtsVoice = 'Nilar'|'Thiha';
export type ActorVoiceProfile = {id:string;name:string;character:string;language:'my-MM';fileName:string;mimeType:string;size:number;consentConfirmed:true;createdAt:string;audioUrl:string};
export type RecapScript = {script:string;model:string;interactionId?:string;usage?:{total_tokens?:number;total_input_tokens?:number;total_output_tokens?:number}};
export type Job = {id:string;projectId:string;sourceId?:string;kind:'recap';status:'queued'|'processing'|'media_ready'|'transcribing'|'transcribed'|'failed'|'awaiting_pipeline';stage:string;progress:number;note:string;error?:string;outputDir?:string;chunkCount?:number;durationSeconds?:number;transcript?:string;transcriptChunks?:string[];transcribedChunkCount?:number;transcriptionTotalChunks?:number;createdAt:string;updatedAt:string};
async function request<T>(url:string,init?:RequestInit):Promise<T>{
 const response=await fetch(url,init);
 const data=await response.json().catch(()=>({error:'Invalid API response'}));
 if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);
 return data as T;
}
export const api={
 health:()=>request<{ok:boolean;service:string;features:Record<string,boolean>}>('/api/health'),
 projects:()=>request<{items:Project[]}>('/api/projects'),
 createProject:(title:string,recapMode:string)=>request<{item:Project}>('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,recapMode})}),
 sources:(id:string)=>request<{items:Source[]}>(`/api/projects/${id}/sources`),
 upload:(id:string,file:File)=>{const body=new FormData();body.append('video',file);return request<{item:Source;note:string}>(`/api/projects/${id}/upload`,{method:'POST',body})},
 addUrl:(id:string,url:string)=>request<{item:Source;note:string}>(`/api/projects/${id}/url-source`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})}),
 createJob:(id:string)=>request<{item:Job;note:string}>(`/api/projects/${id}/recap-jobs`,{method:'POST'}),
 job:(id:string)=>request<{item:Job}>(`/api/jobs/${id}`),
 transcribeJob:(id:string,consent:boolean)=>request<{item:Job;note:string}>(`/api/jobs/${id}/transcribe`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent})}),
 jobs:()=>request<{items:Job[]}>('/api/jobs'),
 aiStatus:()=>request<{configured:boolean;model:string;provider:string}>('/api/ai/status'),
 generateRecapScript:(transcript:string,recapMode:string,title:string,consent:boolean)=>request<{item:RecapScript;note:string}>('/api/ai/recap-script',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript,recapMode,title,consent})}),
 voices:()=>request<{items:ActorVoiceProfile[]}>('/api/voices'),
 addVoice:(name:string,character:string,file:File,consent:boolean)=>{const body=new FormData();body.append('name',name);body.append('character',character);body.append('consent',String(consent));body.append('audio',file);return request<{item:ActorVoiceProfile;note:string}>('/api/voices',{method:'POST',body})},
 ttsStatus:()=>request<{configured:boolean;language:string;voices:{label:TtsVoice;id:string}[]}>('/api/tts/status'),
 synthesize:(text:string,voice:TtsVoice,consent:boolean)=>request<{item:{id:string;bytes:number;voice:string;audioUrl:string;language:string}}>('/api/tts/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,voice,consent})})
};
