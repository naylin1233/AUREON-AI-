export type SubtitleCue = { id:string; start:string; end:string; myanmar:string; english:string };
function timestampToMs(value:string):number{
 const match=value.trim().replace(',','.').match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\.(\d{1,3})$/);
 if(!match)throw new Error(`Invalid subtitle timestamp: ${value}`);
 const hours=Number(match[1]||0),minutes=Number(match[2]),seconds=Number(match[3]),millis=Number((match[4]+'000').slice(0,3));
 if(minutes>59||seconds>59)throw new Error(`Invalid subtitle timestamp: ${value}`);
 return ((hours*60+minutes)*60+seconds)*1000+millis;
}
function msToTimestamp(value:number,separator:','|'.'=','):string{
 const ms=Math.max(0,Math.round(value));const hours=Math.floor(ms/3600000);const minutes=Math.floor(ms%3600000/60000);const seconds=Math.floor(ms%60000/1000);const millis=ms%1000;
 return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}${separator}${String(millis).padStart(3,'0')}`;
}
export function normalizeTimestamp(value:string){return msToTimestamp(timestampToMs(value));}
export function parseSubtitleFile(input:string,language:'myanmar'|'english'='myanmar'):SubtitleCue[]{
 const normalized=input.replace(/^\uFEFF/,'').replace(/\r/g,'').replace(/^WEBVTT[^\n]*\n/i,'');
 const blocks=normalized.split(/\n{2,}/);const cues:SubtitleCue[]=[];
 for(const block of blocks){
  const lines=block.split('\n').map(x=>x.trimEnd());if(!lines.length||/^(NOTE|STYLE|REGION)(\s|$)/.test(lines[0].trim()))continue;
  const timingIndex=lines.findIndex(x=>x.includes('-->'));if(timingIndex<0)continue;
  const parts=lines[timingIndex].split('-->');if(parts.length!==2)continue;
  const start=normalizeTimestamp(parts[0].trim());const endToken=parts[1].trim().split(/\s+/)[0];const end=normalizeTimestamp(endToken);
  if(timestampToMs(end)<=timestampToMs(start))throw new Error('Subtitle end time must be later than start time.');
  const text=lines.slice(timingIndex+1).join('\n').trim();if(!text)continue;
  cues.push({id:`cue-${cues.length+1}`,start,end,myanmar:language==='myanmar'?text:'',english:language==='english'?text:''});
 }
 return cues;
}
export function serializeSubtitles(cues:SubtitleCue[],language:'myanmar'|'english',format:'srt'|'vtt'='srt'):string{
 const filtered=cues.filter(c=>(language==='myanmar'?c.myanmar:c.english).trim());
 const blocks=filtered.map((cue,index)=>{
  const start=msToTimestamp(timestampToMs(cue.start),format==='srt'?',':'.');
  const end=msToTimestamp(timestampToMs(cue.end),format==='srt'?',':'.');
  return `${format==='srt'?index+1:''}${format==='srt'?'\n':''}${start} --> ${end}\n${(language==='myanmar'?cue.myanmar:cue.english).trim()}`;
 });
 return (format==='vtt'?'WEBVTT\n\n':'')+blocks.join('\n\n')+'\n';
}
export function createSubtitleCue(id:string,start='00:00:00,000',end='00:00:03,000'):SubtitleCue{
 return {id,start,end,myanmar:'',english:''};
}

export function addSecondsToTimestamp(value:string,seconds:number){return msToTimestamp(timestampToMs(value)+seconds*1000);}
