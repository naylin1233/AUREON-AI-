import { aiProvidersStatus, generateOpenRouterFreeText, isTransientAiStatus } from './providers.js';

export function geminiStatus(){
 return aiProvidersStatus();
}

function geminiOutput(data:any){
 return Array.isArray(data.steps)?data.steps.filter((step:any)=>step?.type==='model_output').flatMap((step:any)=>Array.isArray(step.content)?step.content:[]).filter((part:any)=>part?.type==='text'&&typeof part.text==='string').map((part:any)=>part.text).join('\n').trim():'';
}

export async function generateBurmeseRecap(input:{transcript:string;mode:string;title?:string}){
 if(!input.transcript.trim()||input.transcript.length>100000)throw new Error('Provide a transcript (maximum 100,000 characters).');
 const prompt=[
  'You are the Burmese-language script editor for AUREON AI.',
  'Create an original Myanmar-language recap script based ONLY on the supplied transcript.',
  'Do not invent scenes, character names, motivations, events, dialogue, or endings not supported by the transcript.',
  'If the transcript is incomplete or ambiguous, clearly mark the uncertain parts and do not fill gaps with guesses.',
  'Paraphrase in original wording. Do not reproduce long verbatim passages from the source.',
  'Write natural, fluent Burmese suitable for spoken narration. Avoid English fallback except proper nouns that have no established Burmese form.',
  'Return these sections in Burmese: 1) ဇာတ်လမ်းအကျဉ်း 2) အဓိကဇာတ်ကောင်များ 3) ဇာတ်ကြောင်းပြော Script 4) မသေချာသေးသောအချက်များ.',
  'Keep dialogue short and paraphrased. Do not claim that this is a complete recap if the transcript is partial.',
  '',
  'RECAP MODE: '+input.mode,
  'PROJECT TITLE: '+(input.title||'Untitled'),
  'SOURCE TRANSCRIPT:',
  input.transcript
 ].join('\n');
 const geminiKey=process.env.GEMINI_API_KEY;
 if(!geminiKey){
  if(!process.env.OPENROUTER_API_KEY)throw new Error('AI recap is not configured. Add GEMINI_API_KEY or OPENROUTER_API_KEY to the private server environment.');
  return {script:await generateOpenRouterFreeText(prompt),model:'openrouter/free'};
 }
 const response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
  method:'POST',
  headers:{'x-goog-api-key':geminiKey,'Content-Type':'application/json'},
  body:JSON.stringify({model:'gemini-3.8-flash',input:prompt,store:false}),
  signal:AbortSignal.timeout(120000)
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok){
  const detail=typeof data?.error?.message==='string'?data.error.message:'HTTP '+response.status;
  if(isTransientAiStatus(response.status)&&process.env.OPENROUTER_API_KEY){
   return {script:await generateOpenRouterFreeText(prompt),model:'openrouter/free'};
  }
  throw new Error('Gemini request failed ('+response.status+'): '+detail.slice(0,400));
 }
 const output=geminiOutput(data);
 if(!output)throw new Error('Gemini returned no recap script text.');
 return {script:output,model:typeof data.model==='string'?data.model:'gemini-3.8-flash',interactionId:typeof data.id==='string'?data.id:undefined,usage:data.usage||undefined};
}
