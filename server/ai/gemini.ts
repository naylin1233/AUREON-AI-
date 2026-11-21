export const GEMINI_MODEL='gemini-3.8-flash';
export function geminiStatus(){
 return {configured:Boolean(process.env.GEMINI_API_KEY),model:GEMINI_MODEL,provider:'Google Gemini Interactions API',freeTierOnly:true};
}
export async function generateBurmeseRecap(input:{transcript:string;mode:string;title?:string}){
 const key=process.env.GEMINI_API_KEY;
 if(!key)throw new Error('AI recap is not configured. Add GEMINI_API_KEY to the private server environment.');
 const model=GEMINI_MODEL;
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
 const response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
  method:'POST',
  headers:{'x-goog-api-key':key,'Content-Type':'application/json'},
  body:JSON.stringify({model,input:prompt,store:false}),
  signal:AbortSignal.timeout(120000)
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok){
  const detail=typeof data?.error?.message==='string'?data.error.message:'HTTP '+response.status;
  throw new Error('Gemini request failed ('+response.status+'): '+detail.slice(0,400));
 }
 const output=Array.isArray(data.steps)?data.steps.filter((step:any)=>step?.type==='model_output').flatMap((step:any)=>Array.isArray(step.content)?step.content:[]).filter((part:any)=>part?.type==='text'&&typeof part.text==='string').map((part:any)=>part.text).join('\n').trim():'';
 if(!output)throw new Error('Gemini returned no recap script text.');
 return {script:output,model:typeof data.model==='string'?data.model:model,interactionId:typeof data.id==='string'?data.id:undefined,usage:data.usage||undefined};
}