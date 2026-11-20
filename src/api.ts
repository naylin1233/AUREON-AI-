export type Project = {id:string;title:string;recapMode:string;createdAt:string;sourceIds:string[]};
export type Source = {id:string;projectId:string;kind:'upload'|'url';name:string;path?:string;url?:string;mimeType?:string;size?:number;status:'stored'|'awaiting_review';createdAt:string};
export type Job = {id:string;projectId:string;sourceId?:string;kind:'recap';status:'queued'|'processing'|'media_ready'|'failed'|'awaiting_pipeline';stage:string;progress:number;note:string;error?:string;chunkCount?:number;durationSeconds?:number;createdAt:string;updatedAt:string};
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
 jobs:()=>request<{items:Job[]}>('/api/jobs')
};
