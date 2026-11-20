import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir=await mkdtemp(path.join(os.tmpdir(),'aureon-api-test-'));
const port=Number(process.env.AUREON_TEST_PORT||8879);
const base=`http://127.0.0.1:${port}`;
let child;
async function start(){
 child=spawn(process.execPath,['--import','tsx','server/index.ts'],{
  env:{...process.env,HOST:'127.0.0.1',PORT:String(port),AUREON_DATA_DIR:dataDir,AUREON_MAX_UPLOAD_MB:'8'},
  stdio:'ignore'
 });
 for(let i=0;i<80;i++){
  if(child.exitCode!==null)throw new Error('API process exited before startup');
  try{const response=await fetch(base+'/api/health');if(response.ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,150));
 }
 throw new Error('API did not become healthy within 12 seconds');
}
async function stop(){
 if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
}
try{
 await start();
 const health=await (await fetch(base+'/api/health')).json();
 assert.equal(health.ok,true);
 assert.equal(health.features.aiGeneration,false);

 const projectResponse=await fetch(base+'/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Smoke Test Project',recapMode:'Cinematic'})});
 assert.equal(projectResponse.status,201);
 const project=(await projectResponse.json()).item;
 assert.ok(project.id);

 const urlResponse=await fetch(base+`/api/projects/${project.id}/url-source`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://example.com/authorized-video.mp4'})});
 assert.equal(urlResponse.status,201);
 assert.equal((await urlResponse.json()).item.status,'awaiting_review');

 const form=new FormData();
 form.append('video',new Blob(['fake-video-bytes'],{type:'video/mp4'}),'sample.mp4');
 const uploadResponse=await fetch(base+`/api/projects/${project.id}/upload`,{method:'POST',body:form});
 assert.equal(uploadResponse.status,201);
 assert.equal((await uploadResponse.json()).item.status,'stored');

 const jobResponse=await fetch(base+`/api/projects/${project.id}/recap-jobs`,{method:'POST'});
 assert.equal(jobResponse.status,202);
 assert.equal((await jobResponse.json()).item.status,'awaiting_pipeline');

 await stop();
 await start();
 const persisted=await (await fetch(base+'/api/projects')).json();
 assert.equal(persisted.items.length,1);
 assert.equal(persisted.items[0].title,'Smoke Test Project');
 console.log('AUREON API smoke test passed: health, project, URL intake, upload, job record, persistence.');
}finally{
 await stop();
 await rm(dataDir,{recursive:true,force:true});
}
