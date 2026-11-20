import { useState } from 'react';
import type { ComponentType } from 'react';
import { Activity, AudioLines, Clapperboard, Clock3, FileVideo, Film, Globe2, LayoutDashboard, Menu, Settings, ShieldCheck, Subtitles, Youtube, Facebook, Video, Plus, ChevronRight, Sparkles, Languages, CloudUpload, X, CircleAlert, CircleCheck } from 'lucide-react';

type Section = 'overview'|'recap'|'library'|'captions'|'voice'|'automation'|'settings';
type IconType = ComponentType<{size?: number}>;
const nav: {id:Section;label:string;icon:IconType}[] = [
 {id:'overview',label:'ခြုံငုံသုံးသပ်ချက်',icon:LayoutDashboard},
 {id:'recap',label:'Donghua Recap Studio',icon:Clapperboard},
 {id:'library',label:'Video Library',icon:Film},
 {id:'captions',label:'Subtitle Studio',icon:Subtitles},
 {id:'voice',label:'Myanmar Voice Studio',icon:AudioLines},
 {id:'automation',label:'Auto Publishing',icon:Clock3},
 {id:'settings',label:'Settings',icon:Settings}
];
export default function App(){
 const [section,setSection]=useState<Section>('overview');
 const [mobileOpen,setMobileOpen]=useState(false);
 const [notice,setNotice]=useState('');
 const [url,setUrl]=useState('');
 const [mode,setMode]=useState('Cinematic');
 const [fileName,setFileName]=useState('');
 const title=nav.find(x=>x.id===section)?.label??'Dashboard';
 const notify=(message:string)=>setNotice(message);
 return <div className="shell">
  <aside className={mobileOpen?'sidebar open':'sidebar'}>
   <div className="brand"><div className="brand-mark">A</div><div><b>AUREON <span>AI</span></b><small>PREMIUM GOLD EDITION</small></div><button className="close-menu" onClick={()=>setMobileOpen(false)} aria-label="Close menu"><X size={18}/></button></div>
   <div className="nav-label">MEDIA WORKSPACE</div>
   <nav>{nav.map(item=>{const I=item.icon;return <button key={item.id} className={section===item.id?'nav-item active':'nav-item'} onClick={()=>{setSection(item.id);setMobileOpen(false)}}><I size={18}/><span>{item.label}</span></button>})}</nav>
   <div className="sidebar-bottom"><div className="plan"><Sparkles size={17}/><b>Gold Studio</b><p>ဖန်တီးမှုအားလုံးကို တစ်နေရာတည်းမှာ စီမံပါ။</p><small>FOUNDATION BUILD · 0.1.0</small></div><div className="profile"><div className="avatar">A</div><div><b>Studio Owner</b><small>Local workspace</small></div></div></div>
  </aside>
  {mobileOpen&&<button className="scrim" onClick={()=>setMobileOpen(false)} aria-label="Close navigation"/>}
  <main className="main">
   <header className="topbar"><div className="crumb"><button className="menu-button" onClick={()=>setMobileOpen(true)} aria-label="Open menu"><Menu/></button>AUREON AI <ChevronRight size={14}/><b>{title}</b></div><span className="system-status">● SYSTEM ONLINE</span></header>
   <div className="content">
    <div className="welcome"><div><div className="eyebrow"><Sparkles size={14}/> YOUR WORLD. YOUR AI.</div><h1>{section==='overview'?'မင်္ဂလာပါ၊ AUREON Studio မှ ကြိုဆိုပါတယ်။':title}</h1><p>{section==='overview'?'သင့်ရဲ့ AI Media Production ကို တစ်နေရာတည်းမှာ စီမံခန့်ခွဲလိုက်ပါ။':'Media Production လုပ်ငန်းစဉ်များကို စီမံနိုင်ပါတယ်။'}</p></div><button className="gold-button" onClick={()=>setSection('recap')}><Plus size={17}/> New Recap Project</button></div>
    {section==='overview'?<Overview setSection={setSection}/>:<section className="panel">
      <div className="panel-heading"><Sparkles size={18}/><b>{title}</b><span className="pill">NOT CONNECTED</span></div>
      {section==='recap'&&<><p className="muted">သင်ပိုင်ဆိုင်သော သို့မဟုတ် အသုံးပြုခွင့်ရှိသော Video များကိုသာ ထည့်သွင်းပါ။</p><div className="form-grid"><label>Video URL<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Authorized video URL (optional)"/></label><label>Recap Mode<select value={mode} onChange={e=>setMode(e.target.value)}>{['Cinematic','Dialogue Breakdown','Narrator Story','Full Deep Dive','Short Viral 60s'].map(x=><option key={x}>{x}</option>)}</select></label></div><label className="upload"><CloudUpload size={28}/><b>{fileName||'Video ဖိုင်ရွေးချယ်ရန်'}</b><small>MP4, MOV, MKV · Backend မချိတ်ဆက်ရသေးပါ</small><input type="file" accept="video/*" onChange={e=>setFileName(e.target.files?.[0]?.name??'')}/></label><button className="gold-button" onClick={()=>notify('Processing backend မချိတ်ဆက်ရသေးပါ။ ဒီအဆင့်မှာ UI သာ အသင့်ဖြစ်ပါတယ်။')}>Prepare Recap <ChevronRight size={16}/></button></>}
      {section==='library'&&<Empty icon={Film} title="Video Library အလွတ်ဖြစ်နေပါတယ်" text="Upload နှင့် asset storage backend ကို နောက်အဆင့်မှာ ချိတ်ဆက်ပါမယ်။"/>}
      {section==='captions'&&<Empty icon={Languages} title="Subtitle Studio" text="Myanmar + English subtitle generation, timing နှင့် SRT/VTT export ကို backend ချိတ်ဆက်ပြီးမှ အသုံးပြုနိုင်ပါမယ်။"/>}
      {section==='voice'&&<><Empty icon={AudioLines} title="Myanmar Voice Engine မချိတ်ဆက်ရသေးပါ" text="မြန်မာအသံ အမှန်တကယ် ထုတ်ပေးနိုင်သော provider ကို စမ်းသပ်အတည်ပြုပြီးမှ ဖွင့်ပါမယ်။ English fallback မသုံးပါ။"/><p className="muted">TTS status: Not configured — no sample audio is fabricated.</p></>}
      {section==='automation'&&<><div className="platforms"><Platform icon={Youtube} name="YouTube"/><Platform icon={Facebook} name="Facebook"/><Platform icon={Video} name="TikTok"/></div><div className="form-grid"><label>Daily start time<input type="time" defaultValue="06:00"/></label><label>Timezone<select defaultValue="Asia/Bangkok"><option>Asia/Bangkok</option></select></label></div><Empty icon={ShieldCheck} title="OAuth ချိတ်ဆက်မှု မရှိသေးပါ" text="Platform ခွင့်ပြုချက်ရပြီး preview/review ပြီးမှသာ publish လုပ်နိုင်မည်ဖြစ်သည်။"/></>}
      {section==='settings'&&<><div className="setting-row"><span>Theme</span><b>Premium Gold Edition</b></div><div className="setting-row"><span>Language</span><b>မြန်မာ / English</b></div><div className="setting-row"><span>Default timezone</span><b>Asia/Bangkok</b></div><div className="setting-row"><span>Paid services</span><b className="good">Disabled by default</b></div></>}
    </section>}
    <footer>© 2026 AUREON AI <span>Premium Gold Edition</span><small>Stage 1 · UI foundation only</small></footer>
   </div>
  </main>
  {notice&&<div className="toast"><CircleAlert size={17}/>{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss">×</button></div>}
 </div>
}
function Overview({setSection}:{setSection:(s:Section)=>void}){
 const stats=[{label:'Projects',value:'0',desc:'စတင်ဖန်တီးရန် အသင့်ဖြစ်ပါပြီ',icon:Clapperboard},{label:'Video Assets',value:'0',desc:'Upload လုပ်ထားသော Video မရှိသေးပါ',icon:FileVideo},{label:'Narration',value:'Not configured',desc:'Myanmar voice setup လိုအပ်သည်',icon:AudioLines},{label:'Scheduled Posts',value:'0',desc:'Publishing မချိတ်ဆက်ရသေးပါ',icon:Clock3}];
 const actions=[{title:'Donghua Recap Studio',desc:'Video အကြောင်းအရာကို ခွဲခြမ်းစိတ်ဖြာပြီး မြန်မာ Recap Script ပြင်ဆင်ရန်။',icon:Clapperboard,to:'recap' as Section,button:'Open Studio'},{title:'Subtitle Studio',desc:'Myanmar + English Subtitle နှင့် SRT Export အတွက်။',icon:Subtitles,to:'captions' as Section,button:'Manage subtitles'},{title:'Myanmar Voice Studio',desc:'မြန်မာ Narration အသံရင်းမြစ်ကို စီစဉ်သတ်မှတ်ရန်။',icon:AudioLines,to:'voice' as Section,button:'Configure voice'},{title:'Auto Publishing',desc:'YouTube, Facebook, TikTok Schedule နှင့် OAuth ချိတ်ရန်။',icon:Globe2,to:'automation' as Section,button:'Setup automation'}];
 return <><div className="stats">{stats.map(s=>{const I=s.icon;return <div className="stat-card" key={s.label}><div className="stat-top"><span>{s.label}</span><I size={19}/></div><strong className={s.value==='Not configured'?'small-value':''}>{s.value}</strong><small>{s.desc}</small></div>})}</div><div className="section-heading"><div><h2>Production Workspace</h2><p>သင့်ရဲ့ အဓိကလုပ်ငန်းစဉ်များ</p></div><span className="pill">READY TO SET UP</span></div><div className="action-grid">{actions.map(a=>{const I=a.icon;return <article className="action-card" key={a.to}><I size={22}/><h3>{a.title}</h3><p>{a.desc}</p><button onClick={()=>setSection(a.to)}>{a.button} <ChevronRight size={15}/></button></article>})}</div><div className="bottom-grid"><div className="panel"><div className="panel-heading"><Activity size={18}/><b>System Readiness</b><span className="pill warning">SETUP REQUIRED</span></div><Readiness label="Web application shell" value="Complete" done/><Readiness label="Myanmar TTS engine" value="Not configured"/><Readiness label="Video rendering pipeline" value="Not configured"/><Readiness label="Social platform OAuth" value="Not connected"/></div><div className="panel"><div className="panel-heading"><ShieldCheck size={18}/><b>Usage & Safety</b></div><p className="safety"><CircleCheck size={16}/> Free-tier-first configuration</p><p className="safety"><CircleCheck size={16}/> No paid billing enabled</p><p className="safety"><CircleCheck size={16}/> Authorized content only</p><p className="muted">AI generation နှင့် publishing ကို အမှန်တကယ် စမ်းသပ်အောင်မြင်မှသာ အသုံးပြုနိုင်ကြောင်း ပြသပါမည်။</p></div></div></>
}
function Readiness({label,value,done}:{label:string;value:string;done?:boolean}){return <div className="readiness"><span>{label}</span><small className={done?'good':''}>{done?'●':'○'} {value}</small></div>}
function Empty({icon:Icon,title,text}:{icon:IconType;title:string;text:string}){return <div className="empty"><Icon size={28}/><h3>{title}</h3><p>{text}</p></div>}
function Platform({icon:Icon,name}:{icon:IconType;name:string}){return <div className="platform"><Icon size={21}/><b>{name}</b><small>Not connected</small></div>}
