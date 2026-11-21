export const OPENROUTER_FREE_MODEL='openrouter/free';
export const GROQ_TRANSCRIPTION_MODEL='whisper-large-v3-turbo';

export function aiProvidersStatus(){
 const gemini=Boolean(process.env.GEMINI_API_KEY);
 const openrouter=Boolean(process.env.OPENROUTER_API_KEY);
 const groq=Boolean(process.env.GROQ_API_KEY)&&process.env.GROQ_TRANSCRIPTION_ENABLED==='true';
 return {
  configured:gemini||openrouter,
  provider:gemini?'Google Gemini'+(openrouter?' with OpenRouter free fallback':''):openrouter?'OpenRouter Free Models':'Not configured',
  model:gemini?'gemini-3.8-flash':OPENROUTER_FREE_MODEL,
  transcriptionConfigured:gemini||groq,
  transcriptionProvider:gemini?'Google Gemini'+(groq?' with optional Groq fallback':''):groq?'Groq Whisper':'Not configured',
  providers:[
   {id:'gemini',name:'Google Gemini',configured:gemini,role:'text + transcription',cost:'Existing configured tier'},
   {id:'openrouter',name:'OpenRouter Free Models',configured:openrouter,role:'text generation fallback',model:OPENROUTER_FREE_MODEL,cost:'Free-model routing only; provider rate limits apply'},
   {id:'groq',name:'Groq Whisper',configured:groq,role:'audio transcription fallback',model:GROQ_TRANSCRIPTION_MODEL,cost:'Metered; disabled unless explicitly enabled'}
  ]
 };
}

export function isTransientAiStatus(status:number){
 return [408,429,500,502,503,504].includes(status);
}

export async function generateOpenRouterFreeText(prompt:string,timeoutMs=120000){
 const key=process.env.OPENROUTER_API_KEY;
 if(!key)throw new Error('OpenRouter free fallback is not configured.');
 const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
  method:'POST',
  headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','X-Title':'AUREON AI'},
  body:JSON.stringify({model:OPENROUTER_FREE_MODEL,messages:[{role:'user',content:prompt}],temperature:0.4}),
  signal:AbortSignal.timeout(timeoutMs)
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok){
  const detail=typeof data?.error?.message==='string'?data.error.message:'HTTP '+response.status;
  throw new Error('OpenRouter free model failed ('+response.status+'): '+detail.slice(0,300));
 }
 const content=data?.choices?.[0]?.message?.content;
 const output=typeof content==='string'?content:Array.isArray(content)?content.filter((part:any)=>part?.type==='text'&&typeof part.text==='string').map((part:any)=>part.text).join('\n').trim():'';
 if(!output)throw new Error('OpenRouter free model returned no text.');
 return output;
}
