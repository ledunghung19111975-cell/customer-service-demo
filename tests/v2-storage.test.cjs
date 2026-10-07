// 产出 Agent：Codex
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(process.env.V2_TEST_ROOT||path.join(__dirname,'..'));
const M=require(path.join(root,'src/v2/model.js'));
const S=require(path.join(root,'src/v2/service.js'));
const P=require(path.join(root,'src/v2/sop.js'));
const KEY='support-ecommerce-v2';
const NOW=Date.parse('2026-10-06T12:00:00Z');
const filename=path.join(root,'src/v2/app.js');
const originalSource=fs.readFileSync(filename,'utf8');
const closing=/\}\)\(\);\s*$/;
assert.match(originalSource,closing,'app.js must remain a standalone closure');
// Observe the real app closure without replacing persistence or business behavior.
const source=originalSource.replace(closing,'window.__storageTest={run,state:()=>state,corrupt:()=>corrupt,storageAvailable:()=>storageAvailable};\n})();');

function memory(raw=JSON.stringify(M.createState(NOW))){
  const store={raw,reads:0,writes:0,getError:null,setError:null,dropWrites:false};
  store.storage={
    getItem(key){assert.equal(key,KEY);store.reads++;if(store.getError)throw store.getError;return store.raw;},
    setItem(key,value){assert.equal(key,KEY);store.writes++;if(store.setError)throw store.setError;if(!store.dropWrites)store.raw=String(value);}
  };
  return store;
}

// Storage-layer regressions receive independent immediate permission, avoiding lock-layer interference.
const permittedNavigator=()=>({locks:{request:(name,options,callback)=>Promise.resolve(callback({name,mode:'exclusive'}))}});
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function lockService({defer=false}={}){
  const holders=new Map(),pending=[],requests=[];
  return {
    requests,
    navigator(owner){return {locks:{request(name,options,callback){
      requests.push({owner,name,options});
      return new Promise((resolve,reject)=>{
        const attempt=()=>{
          try {
            if(holders.has(name)){resolve(callback(null));return;}
            holders.set(name,owner);
            Promise.resolve(callback({name,mode:'exclusive'})).then(value=>{
              if(holders.get(name)===owner)holders.delete(name);
              resolve(value);
            },err=>{
              if(holders.get(name)===owner)holders.delete(name);
              reject(err);
            });
          }catch(err){if(holders.get(name)===owner)holders.delete(name);reject(err);}
        };
        if(defer)pending.push(attempt);else queueMicrotask(attempt);
      });
    }}};},
    grant(){for(const attempt of pending.splice(0))queueMicrotask(attempt);},
    holder(name=KEY){return holders.get(name);},
    // The browser releases held Web Locks when the owning document is destroyed.
    unload(owner){for(const [name,holder] of holders)if(holder===owner)holders.delete(name);}
  };
}

function makeTab(store,{navigator=permittedNavigator()}={}){
  const nodes=new Map(),listeners=new Map();
  // Rendering is intentionally shallow; these nodes only permit initialization and error messages.
  function node(selector){
    if(selector==='.messages')return null;
    if(!nodes.has(selector))nodes.set(selector,{
      innerHTML:'',hidden:false,open:false,textContent:'',className:'',
      addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}
    });
    return nodes.get(selector);
  }
  const window={SupportV2Model:M,SupportV2Service:S,SupportV2Sop:P,navigator,addEventListener:(name,listener)=>listeners.set(name,listener)};
  const document={querySelector:node,addEventListener(){}};
  class Clock extends Date{constructor(...args){super(...(args.length?args:[NOW+60000]));}static now(){return NOW+60000;}}
  vm.runInNewContext(source,{window,document,navigator,localStorage:store.storage,Date:Clock,Error,setTimeout:()=>1,clearTimeout(){}},{filename});
  assert.ok(window.__storageTest,'the observation hook must be installed');
  return {
    app:window.__storageTest,
    node,
    storageEvent(newValue=store.raw,key=KEY){
      assert.ok(listeners.has('storage'),'the app must handle storage changes');
      listeners.get('storage')({key,newValue,storageArea:store.storage});
    }
  };
}

const snapshot=tab=>JSON.stringify(tab.app.state());
const say=(tab,body='杯子怎么清洗')=>tab.app.run('say',{conversationId:'CONV001',body});
const customerMessages=state=>state.conversations.find(c=>c.id==='CONV001').messages.filter(m=>m.role==='customer').map(m=>m.body);

test('an absent key starts a seed workspace and persists the first operation',()=>{
  const store=memory(null),tab=makeTab(store);
  assert.equal(tab.app.corrupt(),null);assert.equal(tab.app.storageAvailable(),true);
  say(tab);
  assert.equal(tab.app.state().revision,1);
  assert.equal(store.raw,snapshot(tab));
  assert.equal(JSON.parse(store.raw).cases.length,1);
});

test('existing saved history loads without replacing its original bytes',()=>{
  const state=S.execute(M.createState(NOW),{id:'C001',role:'customer'},'say',{conversationId:'CONV001',body:'已保存的客户咨询'},NOW+1).state;
  const raw=' '+JSON.stringify(state)+'\n',store=memory(raw),tab=makeTab(store);
  assert.equal(store.raw,raw);assert.equal(store.writes,0);
  assert.equal(tab.app.state().revision,1);
  assert.ok(customerMessages(tab.app.state()).includes('已保存的客户咨询'));
});

test('a delayed storage event cannot let a same-baseline tab overwrite the first save',()=>{
  const store=memory(),a=makeTab(store),b=makeTab(store),beforeB=snapshot(b);
  say(a);
  const savedA=store.raw,writes=store.writes;
  assert.throws(()=>say(b,'你好'));
  assert.equal(store.raw,savedA);assert.equal(store.writes,writes);
  assert.equal(snapshot(b),beforeB);
  assert.equal(JSON.parse(store.raw).cases.length,1);
  assert.deepEqual(customerMessages(JSON.parse(store.raw)),['杯子怎么清洗']);
});

test('changed original bytes reject a stale write even when the revision is unchanged',()=>{
  const store=memory(),tab=makeTab(store),before=snapshot(tab);
  store.raw+=' ';
  const changed=store.raw,writes=store.writes;
  assert.throws(()=>say(tab));
  assert.equal(store.raw,changed);assert.equal(store.writes,writes);
  assert.equal(snapshot(tab),before);
});

for(const raw of ['null','false','','""','{}','{broken'])test('damaged existing storage blocks editing and preserves '+JSON.stringify(raw),()=>{
  const store=memory(raw),tab=makeTab(store);
  assert.ok(tab.app.corrupt());assert.equal(tab.app.state(),null);
  assert.match(tab.node('#app').innerHTML,/本地记录需要检查/);
  assert.throws(()=>say(tab));
  assert.equal(store.raw,raw);assert.equal(store.writes,0);
});

test('unavailable storage explicitly permits temporary memory mode',()=>{
  const store=memory(null);store.getError=new Error('SecurityError: storage disabled');
  const tab=makeTab(store);
  assert.equal(tab.app.corrupt(),null);assert.equal(tab.app.storageAvailable(),false);
  assert.match(tab.node('#app').innerHTML,/未启用本地保存/);
  say(tab);
  assert.equal(tab.app.state().revision,1);assert.equal(tab.app.state().cases.length,1);
  assert.equal(store.raw,null);assert.equal(store.writes,0);
});

test('a quota exception leaves saved bytes and current memory unchanged',()=>{
  const store=memory(),tab=makeTab(store),before=snapshot(tab),raw=store.raw;
  store.setError=new Error('QuotaExceededError');
  assert.throws(()=>say(tab));
  assert.equal(snapshot(tab),before);assert.equal(store.raw,raw);
});

test('a silent failed write is detected before current memory advances',()=>{
  const store=memory(),tab=makeTab(store),before=snapshot(tab),raw=store.raw;
  store.dropWrites=true;
  assert.throws(()=>say(tab));
  assert.equal(snapshot(tab),before);assert.equal(store.raw,raw);
});

test('a valid storage event rebases the page and permits the next operation',()=>{
  const store=memory(),a=makeTab(store),b=makeTab(store);
  say(a);
  b.storageEvent();
  assert.equal(snapshot(b),store.raw);assert.equal(b.app.corrupt(),null);
  say(b,'你好');
  assert.equal(JSON.parse(store.raw).revision,2);
  assert.equal(store.raw,snapshot(b));assert.equal(JSON.parse(store.raw).cases.length,1);
  assert.deepEqual(customerMessages(JSON.parse(store.raw)),['杯子怎么清洗','你好']);
});

test('a same-revision external change requires refresh and cannot authorize a stale write',()=>{
  const store=memory(),tab=makeTab(store),before=snapshot(tab);
  const external=JSON.parse(store.raw);external.conversations[0].messages.push({id:'EXTERNAL-001',role:'customer',body:'另一窗口的同版本记录',at:NOW});
  assert.equal(S.validateState(external),true);
  store.raw=JSON.stringify(external)+' ';
  const changed=store.raw,writes=store.writes;
  tab.storageEvent();
  assert.equal(snapshot(tab),before);
  assert.throws(()=>say(tab,'你好'));
  assert.equal(store.raw,changed);assert.equal(store.writes,writes);
  assert.equal(snapshot(tab),before);
});

test('a delayed valid event reads the latest stored record before rebasing',()=>{
  const store=memory(),a=makeTab(store),b=makeTab(store);
  say(a);
  const delayedValue=store.raw;
  say(a,'谢谢');
  const latest=store.raw;
  b.storageEvent(delayedValue);
  assert.equal(snapshot(b),latest);
  say(b,'你好');
  assert.equal(JSON.parse(store.raw).revision,3);
  assert.deepEqual(customerMessages(JSON.parse(store.raw)),['杯子怎么清洗','谢谢','你好']);
});

for(const [name,key,raw] of [['removed key',KEY,null],['cleared storage',null,null],['damaged value',KEY,'{broken']])test('a '+name+' event prevents the old page from overwriting storage',()=>{
  const store=memory(),tab=makeTab(store);
  store.raw=raw;
  tab.storageEvent(raw,key);
  const writes=store.writes;
  assert.throws(()=>say(tab));
  assert.equal(store.raw,raw);assert.equal(store.writes,writes);
});

test('an unrelated storage event leaves this workspace editable',()=>{
  const store=memory(),tab=makeTab(store),before=snapshot(tab);
  tab.storageEvent('{broken','unrelated-workspace');
  assert.equal(snapshot(tab),before);assert.equal(tab.app.corrupt(),null);
  say(tab);
  assert.equal(store.raw,snapshot(tab));assert.equal(JSON.parse(store.raw).revision,1);
});

test('a shared exclusive lock leaves the other tab read-only while its view stays synchronized',async()=>{
  const store=memory(),locks=lockService(),a=makeTab(store,{navigator:locks.navigator('A')}),b=makeTab(store,{navigator:locks.navigator('B')});
  await settle();
  assert.equal(locks.requests.length,2);
  for(const request of locks.requests){assert.equal(request.name,KEY);assert.equal(request.options.mode,'exclusive');assert.equal(request.options.ifAvailable,true);}
  assert.equal(locks.holder(),'A');
  const beforeB=snapshot(b),raw=store.raw;
  assert.throws(()=>say(b,'你好'),/查看|编辑/);
  assert.equal(snapshot(b),beforeB);assert.equal(store.raw,raw);assert.equal(store.writes,0);
  assert.match(b.node('#app').innerHTML,/仅供查看/);
  say(a);
  const savedA=store.raw,writes=store.writes;
  b.storageEvent();
  assert.equal(snapshot(b),savedA);
  assert.throws(()=>say(b,'你好'),/查看|编辑/);
  assert.equal(snapshot(b),savedA);assert.equal(store.raw,savedA);assert.equal(store.writes,writes);
  assert.equal(locks.holder(),'A');
});

test('pending lock permission blocks editing until the asynchronous grant completes',async()=>{
  const store=memory(),locks=lockService({defer:true}),tab=makeTab(store,{navigator:locks.navigator('A')}),before=snapshot(tab),raw=store.raw;
  assert.equal(locks.requests.length,1);
  assert.throws(()=>say(tab),/查看|编辑/);
  assert.equal(snapshot(tab),before);assert.equal(store.raw,raw);assert.equal(store.writes,0);
  locks.grant();
  await settle();
  assert.equal(locks.holder(),'A');
  say(tab);
  assert.equal(JSON.parse(store.raw).revision,1);assert.equal(store.raw,snapshot(tab));
});

test('available storage without native locks remains explicitly read-only',()=>{
  const store=memory(),tab=makeTab(store,{navigator:{}}),before=snapshot(tab),raw=store.raw;
  assert.equal(tab.app.storageAvailable(),true);assert.equal(tab.app.corrupt(),null);
  assert.match(tab.node('#app').innerHTML,/仅供查看/);
  assert.throws(()=>say(tab),/查看|安全编辑|浏览器/);
  assert.equal(snapshot(tab),before);assert.equal(store.raw,raw);assert.equal(store.writes,0);
});

test('a rejected lock request preserves memory and storage while reporting unavailable edit permission',async()=>{
  const store=memory();let requests=0;
  const navigator={locks:{request(){requests++;return Promise.reject(new Error('lock permission denied'));}}};
  const tab=makeTab(store,{navigator}),before=snapshot(tab),raw=store.raw;
  await settle();
  assert.equal(requests,1);
  assert.match(tab.node('#toast').textContent,/无法取得编辑权限/);
  assert.throws(()=>say(tab),/查看|编辑/);
  assert.equal(snapshot(tab),before);assert.equal(store.raw,raw);assert.equal(store.writes,0);
});

test('the edit lock lasts for the document lifetime and a new tab can edit after unload',async()=>{
  const store=memory(),locks=lockService(),a=makeTab(store,{navigator:locks.navigator('A')});
  await settle();
  assert.equal(locks.holder(),'A');
  say(a);
  await settle();
  assert.equal(locks.holder(),'A');
  locks.unload('A');
  assert.equal(locks.holder(),undefined);
  const c=makeTab(store,{navigator:locks.navigator('C')});
  await settle();
  assert.equal(locks.holder(),'C');
  say(c,'你好');
  assert.equal(JSON.parse(store.raw).revision,2);
  assert.deepEqual(customerMessages(JSON.parse(store.raw)),['杯子怎么清洗','你好']);
  assert.equal(store.raw,snapshot(c));
});
