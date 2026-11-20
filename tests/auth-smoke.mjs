import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir=await mkdtemp(path.join(os.tmpdir(),'aureon-auth-test-'));
const port=Number(process.env.AUREON_AUTH_TEST_PORT||8881);
const base=`http://127.0.0.1:${port}`;
const password='Aureon-Test-Password-2026';
const secret='test-session-secret-that-is-at-least-32-bytes-long';
let child;
async function start(){
 child=spawn(process.execPath,['--import','tsx','server/index.ts'],{
  env:{...process.env,HOST:'127.0.0.1',PORT:String(port),AUREON_DATA_DIR:dataDir,AUREON_ADMIN_PASSWORD:password,AUREON_SESSION_SECRET:secret,YOUTUBE_API_KEY:'',AZURE_SPEECH_KEY:'',AZURE_SPEECH_REGION:''},
  stdio:'ignore'
 });
 for(let i=0;i<80;i++){
  if(child.exitCode!==null)throw new Error('Auth test API exited before startup');
  try{const response=await fetch(base+'/api/auth/status');if(response.ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,150));
 }
 throw new Error('Auth test API did not become ready');
}
async function stop(){
 if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
}
try{
 await start();
 const health=await fetch(base+'/api/health');assert.equal(health.status,200);
 const status=await (await fetch(base+'/api/auth/status')).json();assert.equal(status.configured,true);assert.equal(status.authenticated,false);
 const blocked=await fetch(base+'/api/projects');assert.equal(blocked.status,401);
 const wrong=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'incorrect-password'})});assert.equal(wrong.status,401);
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie');assert.ok(cookie);assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=Strict/i);
 const sessionCookie=cookie.split(';')[0];
 const authenticated=await fetch(base+'/api/auth/status',{headers:{Cookie:sessionCookie}});assert.equal((await authenticated.json()).authenticated,true);
 const projects=await fetch(base+'/api/projects',{headers:{Cookie:sessionCookie}});assert.equal(projects.status,200);
 const logout=await fetch(base+'/api/auth/logout',{method:'POST',headers:{Cookie:sessionCookie}});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie')||'',/Max-Age=0/);
 const blockedAgain=await fetch(base+'/api/projects',{headers:{Cookie:sessionCookie}});assert.equal(blockedAgain.status,401);
 console.log('AUREON auth smoke test passed: public health, protected API, wrong-password rejection, signed HttpOnly SameSite session, authenticated API access and logout.');
}finally{
 await stop();
 await rm(dataDir,{recursive:true,force:true});
}
