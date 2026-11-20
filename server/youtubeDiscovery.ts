import { addDailyTopic, addReferenceSource, getDailyTopics, getProjects } from './store.js';

type SearchItem = {
  id?: { kind?: string; videoId?: string; channelId?: string };
  snippet?: { title?: string; channelTitle?: string; channelId?: string; publishedAt?: string };
};
type SearchResponse = { items?: SearchItem[]; error?: { message?: string } };
type VideoDetail = {id:string;snippet?:{title?:string;channelTitle?:string;publishedAt?:string};statistics?:{viewCount?:string}};
type VideoListResponse = {items?:VideoDetail[];error?:{message?:string}};
const topicCategories = [
  {category:'Anime',query:'popular anime recap'},
  {category:'Foreign Movie',query:'foreign movie recap'},
  {category:'3D Animation',query:'3D animated movie recap'},
  {category:'Donghua',query:'Chinese donghua recap'}
];
let topicStatusMessage = 'Daily topic has not been selected yet.';

const defaultQueries = ['popular anime recap', 'foreign movie recap', '3D animation movie recap', 'Chinese donghua recap'];
let lastRunAt: string | null = null;
let lastRunSummary = 'Not run yet';
let lastManualRunMs = 0;
let scheduled = false;

export function youtubeReferenceDiscoveryStatus() {
  return {
    configured: Boolean(process.env.YOUTUBE_API_KEY),
    provider: 'YouTube Data API v3',
    schedule: '06:15 Asia/Bangkok daily',
    lastRunAt,
    lastRunSummary,
    queryCount: configuredQueries().length
  };
}

function configuredQueries() {
  const raw = process.env.YOUTUBE_REFERENCE_QUERIES;
  const values = raw ? raw.split(';') : defaultQueries;
  return [...new Set(values.map(x => x.trim()).filter(Boolean))].slice(0, 4);
}

async function search(kind: 'video' | 'channel', query: string): Promise<SearchItem[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YouTube discovery is not configured. Add YOUTUBE_API_KEY to the private server environment.');
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.search = new URLSearchParams({
    part: 'snippet',
    type: kind,
    q: query,
    maxResults: '5',
    order: kind === 'video' ? 'viewCount' : 'relevance',
    safeSearch: 'strict',
    relevanceLanguage: 'en',
    regionCode: 'US',
    key
  }).toString();
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  const data = await response.json() as SearchResponse;
  if (!response.ok) throw new Error(data.error?.message || `YouTube search failed (${response.status}).`);
  return Array.isArray(data.items) ? data.items : [];
}

export async function discoverYouTubeReferences(projectIds: string[], customQueries?: string[]) {
  if (!process.env.YOUTUBE_API_KEY) throw new Error('YouTube discovery is not configured. Add YOUTUBE_API_KEY to the private server environment.');
  const ids = [...new Set(projectIds)].filter(Boolean);
  if (!ids.length) throw new Error('Create or select a project before discovering references.');
  const queries = [...new Set((customQueries?.length ? customQueries : configuredQueries()).map(x => x.trim()).filter(Boolean))].slice(0, 4);
  if (!queries.length) throw new Error('Add at least one discovery keyword.');
  const found = new Map<string, { kind: 'channel' | 'video'; url: string; title: string; channelName: string; language: string; notes: string }>();
  for (const query of queries) {
    for (const kind of ['channel', 'video'] as const) {
      const items = await search(kind, query);
      for (const item of items) {
        const snippet = item.snippet || {};
        const id = kind === 'video' ? item.id?.videoId : item.id?.channelId || snippet.channelId;
        if (!id) continue;
        const url = kind === 'video'
          ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`
          : `https://www.youtube.com/channel/${encodeURIComponent(id)}`;
        found.set(url, {
          kind,
          url,
          title: (snippet.title || '').slice(0, 160),
          channelName: ((kind === 'channel' ? snippet.title : snippet.channelTitle) || '').slice(0, 100),
          language: 'Unknown',
          notes: `Automatically discovered from keyword: ${query}. Video search is ordered by YouTube view count; channel search is relevance-ranked. Metadata only; review the source and its rights before using any material.`
        });
      }
    }
  }
  let saved = 0;
  for (const projectId of ids) {
    for (const item of found.values()) {
      await addReferenceSource({ projectId, ...item, rightsStatus: 'reference_only' });
      saved++;
    }
  }
  lastRunAt = new Date().toISOString();
  lastRunSummary = `${found.size} unique YouTube references found; ${saved} project reference records saved.`;
  return { found: found.size, saved, queries, note: lastRunSummary };
}

export async function discoverReferencesManually(projectId: string, customQueries?: string[]) {
  if (Date.now() - lastManualRunMs < 60_000) throw new Error('Please wait one minute before starting another YouTube search.');
  lastManualRunMs = Date.now();
  return discoverYouTubeReferences([projectId], customQueries);
}

function msUntilBangkok0615() {
  const now = new Date();
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  let targetUtc = Date.UTC(bangkok.getUTCFullYear(), bangkok.getUTCMonth(), bangkok.getUTCDate(), 6, 15) - 7 * 60 * 60 * 1000;
  if (targetUtc <= now.getTime()) targetUtc += 24 * 60 * 60 * 1000;
  return targetUtc - now.getTime();
}

export function startDailyYouTubeReferenceDiscovery() {
  if (scheduled) return;
  scheduled = true;
  const scheduleNext = () => setTimeout(async () => {
    try {
      const projectIds = getProjects().map(project => project.id);
      if (projectIds.length && process.env.YOUTUBE_API_KEY) {
        const result = await discoverYouTubeReferences(projectIds);
        console.log('[YouTube reference discovery]', result.note);
      }
    } catch (error) {
      lastRunAt = new Date().toISOString();
      lastRunSummary = error instanceof Error ? error.message : 'Automatic YouTube discovery failed.';
      console.error('[YouTube reference discovery]', lastRunSummary);
    } finally {
      scheduleNext();
    }
  }, msUntilBangkok0615());
  scheduleNext();
}

function bangkokDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date());}
export function dailyTopicStatus(){const history=getDailyTopics();return {configured:Boolean(process.env.YOUTUBE_API_KEY),schedule:'06:00 Asia/Bangkok daily',latest:history[0]||null,history:history.slice(0,30),message:topicStatusMessage};}
async function fetchTopicCandidates(){
 const key=process.env.YOUTUBE_API_KEY;if(!key)throw new Error('YouTube discovery is not configured. Add YOUTUBE_API_KEY to the private server environment.');
 const publishedAfter=new Date(Date.now()-30*24*60*60*1000).toISOString();
 const candidates=new Map<string,{id:string;category:string}>();
 for(const item of topicCategories){
  const url=new URL('https://www.googleapis.com/youtube/v3/search');
  url.search=new URLSearchParams({part:'snippet',type:'video',q:item.query,maxResults:'5',order:'viewCount',publishedAfter,safeSearch:'strict',relevanceLanguage:'en',regionCode:'US',key}).toString();
  const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
  const data=await response.json() as SearchResponse;
  if(!response.ok)throw new Error(data.error?.message||'YouTube trend search failed.');
  for(const result of data.items||[]){const id=result.id?.videoId;if(id&&!candidates.has(id))candidates.set(id,{id,category:item.category});}
 }
 if(!candidates.size)return [];
 const url=new URL('https://www.googleapis.com/youtube/v3/videos');
 url.search=new URLSearchParams({part:'snippet,statistics',id:[...candidates.keys()].join(','),maxResults:'50',key}).toString();
 const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
 const data=await response.json() as VideoListResponse;
 if(!response.ok)throw new Error(data.error?.message||'YouTube video statistics request failed.');
 return (data.items||[]).map(video=>({...video,category:candidates.get(video.id)?.category||'Animation'}));
}
export async function selectDailyTopic(){
 const today=bangkokDate();const history=getDailyTopics();const existing=history.find(x=>x.date===today);if(existing)return {item:existing,note:'Today’s topic was already selected.'};
 const recent=history.filter(x=>Date.now()-Date.parse(x.selectedAt)<=30*24*60*60*1000);
 const usedIds=new Set(recent.map(x=>x.videoId));const usedTitles=new Set(recent.map(x=>x.title.trim().toLocaleLowerCase()));
 const candidates=await fetchTopicCandidates();
 const eligible=candidates.filter(x=>!usedIds.has(x.id)&&!usedTitles.has((x.snippet?.title||'').trim().toLocaleLowerCase()));
 eligible.sort((a,b)=>Number(b.statistics?.viewCount||0)-Number(a.statistics?.viewCount||0));
 const chosen=eligible[0];
 if(!chosen){topicStatusMessage='No eligible non-repeating trend topic was returned by YouTube. No topic was invented.';return {item:null,note:topicStatusMessage};}
 const item=await addDailyTopic({date:today,videoId:chosen.id,title:(chosen.snippet?.title||'Untitled YouTube video').slice(0,200),channelName:(chosen.snippet?.channelTitle||'Unknown channel').slice(0,120),url:'https://www.youtube.com/watch?v='+encodeURIComponent(chosen.id),category:(chosen as VideoDetail & {category:string}).category,viewCount:Number(chosen.statistics?.viewCount||0),publishedAt:chosen.snippet?.publishedAt||''});
 topicStatusMessage='Selected from recent YouTube videos by observed view count; reference metadata only.';
 return {item,note:topicStatusMessage};
}
let topicScheduled=false;
function msUntilBangkok0600(){const now=new Date();const local=new Date(now.getTime()+7*60*60*1000);let target=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate(),6,0)-7*60*60*1000;if(target<=now.getTime())target+=86400000;return target-now.getTime();}
export function startDailyTopicSelection(){if(topicScheduled)return;topicScheduled=true;const schedule=()=>setTimeout(async()=>{try{if(process.env.YOUTUBE_API_KEY){const result=await selectDailyTopic();console.log('[Daily recap topic]',result.note);}}catch(error){topicStatusMessage=error instanceof Error?error.message:'Daily topic selection failed.';console.error('[Daily recap topic]',topicStatusMessage);}finally{schedule();}},msUntilBangkok0600());schedule();}
