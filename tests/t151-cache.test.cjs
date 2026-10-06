// 产出 Agent：Codex；真实启动 run.py，8770 仅用于隔离验收。
const test=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),http=require('node:http'),path=require('node:path');
function request(resource,headers={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:8770,path:resource,method:'HEAD',headers},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,headers:res.headers}));});
    req.setTimeout(2000,()=>req.destroy(new Error('server timeout')));req.on('error',reject);req.end();
  });
}
test('返修 run.py sends no-store on successful, conditional and missing resources',async()=>{
  const proc=spawn('python3',['-u','run.py','--port','8770','--no-open'],{cwd:path.resolve(__dirname,'..')}),logs=[];
  const stopped=new Promise(resolve=>proc.once('close',resolve));
  try{
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('run.py start timeout')),5000);
      proc.stdout.on('data',b=>{logs.push(b.toString());if(logs.join('').includes('智能客服：http')){clearTimeout(timer);resolve();}});
      proc.stderr.on('data',b=>logs.push(b.toString()));proc.once('error',e=>{clearTimeout(timer);reject(e);});
      proc.once('exit',code=>{clearTimeout(timer);reject(new Error(`run.py exited ${code}: ${logs.join('')}`));});
    });
    const ok=await request('/src/app.js');assert.equal(ok.status,200);assert.equal(ok.headers['cache-control'],'no-store');
    const conditional=await request('/src/app.js',{'If-Modified-Since':ok.headers['last-modified']});
    assert.equal(conditional.status,304);assert.equal(conditional.headers['cache-control'],'no-store');
    const missing=await request('/t151-no-such-file');assert.equal(missing.status,404);assert.equal(missing.headers['cache-control'],'no-store');
  }finally{proc.kill('SIGINT');await stopped;}
});
