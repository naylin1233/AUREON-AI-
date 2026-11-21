import { generateOpenRouterFreeText, isTransientAiStatus } from './providers.js';

export type PlatformPack = {
  youtube: { title: string; description: string; script: string; tags: string[] };
  facebook: { title: string; caption: string; script: string; tags: string[] };
  tiktok: { hook: string; caption: string; script: string; cta: string; tags: string[] };
};

export async function generatePlatformPack(input:{title:string;recapScript:string;date:string}) {
  if(!input.recapScript.trim()||input.recapScript.length>60000)throw new Error('Provide a recap script (maximum 60,000 characters).');
  const prompt=[
    'You are AUREON AI, a Burmese-first editorial producer.',
    'Create THREE genuinely different, original platform adaptations from the supplied recap draft. Do not copy the same video across platforms.',
    'Use natural spoken Burmese. Do not invent story facts, scenes, character names, or outcomes absent from the draft. Do not copy source dialogue or another creator’s wording.',
    'YOUTUBE: make a full long-form recap plan/script with an engaging but accurate title, useful description, structured narration script, and relevant tags. Aim for a complete story explanation, not a teaser.',
    'FACEBOOK: create a separately paced mid-length recap for Facebook viewers, with its own title, caption, narration script, and tags. Do not reuse the YouTube opening verbatim.',
    'TIKTOK: create a vertical short teaser, about 30–60 seconds when spoken, with an immediate hook, concise original recap, caption, CTA directing viewers to the YouTube full recap, and tags. Do not pretend a YouTube link exists; use a placeholder [YOUTUBE FULL VIDEO LINK] in the CTA.',
    'Keep each platform’s wording, opening, pacing and purpose distinct. Output valid JSON only with keys youtube, facebook, tiktok. All text values must be Burmese except platform labels, proper nouns, tags and the placeholder.',
    'YOUTUBE shape: {title,description,script,tags:string[]}. FACEBOOK shape: {title,caption,script,tags:string[]}. TIKTOK shape: {hook,caption,script,cta,tags:string[]}.',
    'CONTENT DATE: '+input.date,
    'RECAP TITLE: '+input.title,
    'RECAP DRAFT:',
    input.recapScript
  ].join('\n');
  let raw='';
  let model='gemini-3.8-flash';
  const key=process.env.GEMINI_API_KEY;
  if(!key){
   if(!process.env.OPENROUTER_API_KEY)throw new Error('AI platform pack is not configured. Add GEMINI_API_KEY or OPENROUTER_API_KEY to the private server environment.');
   raw=await generateOpenRouterFreeText(prompt);model='openrouter/free';
  }else{
   const response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
    method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},
    body:JSON.stringify({model,input:prompt,store:false}),
    signal:AbortSignal.timeout(120000)
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok){
    const detail=typeof data?.error?.message==='string'?data.error.message:'HTTP '+response.status;
    if(isTransientAiStatus(response.status)&&process.env.OPENROUTER_API_KEY){
     raw=await generateOpenRouterFreeText(prompt);model='openrouter/free';
    }else throw new Error('Gemini request failed ('+response.status+'): '+detail.slice(0,300));
   }else{
    raw=Array.isArray(data.steps)?data.steps.filter((s:any)=>s?.type==='model_output').flatMap((s:any)=>Array.isArray(s.content)?s.content:[]).filter((p:any)=>p?.type==='text'&&typeof p.text==='string').map((p:any)=>p.text).join('\n').trim():'';
    if(typeof data.model==='string')model=data.model;
   }
  }
  if(!raw)throw new Error('AI provider returned no platform content.');
  const cleaned=raw.replace(/^\u0060{3}(?:json)?\s*/i,'').replace(/\s*\u0060{3}$/,'');
  let parsed:PlatformPack;
  try{parsed=JSON.parse(cleaned) as PlatformPack;}catch{throw new Error('AI provider response was not valid platform-pack JSON. Please retry.');}
  const valid=(v:any)=>v&&typeof v==='object'&&typeof v.script==='string'&&Array.isArray(v.tags);
  if(!valid(parsed.youtube)||!valid(parsed.facebook)||!valid(parsed.tiktok)||typeof parsed.youtube.title!=='string'||typeof parsed.facebook.title!=='string'||typeof parsed.tiktok.hook!=='string'||typeof parsed.tiktok.cta!=='string')throw new Error('AI provider returned an incomplete platform pack. Please retry.');
  return {item:parsed,model};
}
