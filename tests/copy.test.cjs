'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Copy=require('../src/copy.js');
const Seed=require('../src/seed.js');
const Store=require('../src/store.js');
const Domain=require('../src/domain.js');
const NOW=Date.parse('2026-10-02T12:00:00Z');
const legacy=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/previous-defaults.json'),'utf8'));
const memory=(raw)=>{const m=new Map(raw===undefined?[]:[[Store.KEY,raw]]);return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v))};};
const banned=/知序|青禾|小夏|小林|小周|把日子过得简单一点|从一个问题开始/;

test('new defaults use neutral identities and greeting',()=>{
 const s=Seed.create(NOW);assert.ok(!banned.test(JSON.stringify(s)));
 assert.equal(s.customers[0].name,'客户 001');assert.equal(s.staff[0].name,'客服 01');
 assert.equal(s.conversations[0].messages[0].body,Copy.greeting);
});
test('fresh customer greeting has no made-up personal salutation',()=>{
 let s=Seed.create(NOW,false);const result=Domain.execute(s,{id:'C001',role:'customer'},'newConversation',{},NOW);
 assert.equal(result.state.conversations[0].messages[0].body,Copy.greeting);
});
test('legacy defaults update without mutating the input',()=>{
 const old=legacy(),raw=JSON.stringify(old),result=Copy.upgrade(old);
 assert.equal(JSON.stringify(old),raw);assert.equal(result.changed,true);assert.ok(Store.valid(result.state));
 assert.equal(result.state.customers[0].name,'客户 001');assert.equal(result.state.staff[1].name,'客服 02');
 assert.equal(result.state.copyVersion,Copy.VERSION);assert.equal(result.state.revision,old.revision+1);
 assert.ok(!banned.test(JSON.stringify(result.state)));
});
test('copy update preserves record identities, ownership, timestamps and statuses',()=>{
 const old=legacy(),s=Copy.upgrade(old).state;
 for(const table of ['conversations','cases','tickets','gaps','orders']){
  assert.deepEqual(s[table].map(x=>[x.id,x.customerId,x.ownerId,x.createdAt,x.status,x.state,x.caseId,x.caseIds,x.requestKey]),old[table].map(x=>[x.id,x.customerId,x.ownerId,x.createdAt,x.status,x.state,x.caseId,x.caseIds,x.requestKey]));
 }
 assert.equal(s.sequence,old.sequence);assert.deepEqual(s.orders,old.orders);
});
test('customer and staff text is never globally replaced',()=>{
 const old=legacy(),conv=old.conversations[0];
 const text='你好，小夏。我在青禾生活咨询，知序是我自己输入的名称。';
 conv.messages.push({id:'CUSTOM-COPY',role:'customer',body:text,visibility:'public',at:NOW});
 conv.messages.push({id:'PRIVATE-COPY',role:'agent',body:text,author:'客服小林',visibility:'internal',at:NOW});
 old.tickets[0].description=text;old.tickets[0].history[0].internalText=text;
 const s=Copy.upgrade(old).state;
 assert.equal(s.conversations[0].messages.at(-2).body,text);assert.equal(s.conversations[0].messages.at(-1).body,text);
 assert.equal(s.tickets[0].description,text);assert.equal(s.tickets[0].history[0].internalText,text);
});
test('only first bot welcome is replaced, not quoted or authored copies',()=>{
 const old=legacy(),conv=old.conversations[0],body=conv.messages[0].body;
 conv.messages.push({id:'USER-WELCOME',role:'customer',body,visibility:'public',at:NOW});
 conv.messages.push({id:'BOT-QUOTE',role:'bot',body,visibility:'public',at:NOW});
 const result=Copy.upgrade(old).state.conversations[0];
 assert.equal(result.messages[0].body,Copy.greeting);assert.equal(result.messages.at(-2).body,body);assert.equal(result.messages.at(-1).body,body);
});
test('custom names, email, knowledge drafts and sources are preserved',()=>{
 const old=legacy();old.customers[0].name='自定义客户';old.customers[0].email='custom@example.test';old.staff[0].name='接待专员';
 old.knowledge[0].draft={title:'知序政策',source:'青禾生活 / 售后服务政策',answer:'我手动写的内容'};
 const draft=JSON.stringify(old.knowledge[0].draft);old.knowledge[1].live.version=2;
 const s=Copy.upgrade(old).state;
 assert.equal(s.customers[0].name,'自定义客户');assert.equal(s.customers[0].email,'custom@example.test');assert.equal(s.staff[0].name,'接待专员');
 assert.equal(JSON.stringify(s.knowledge[0].draft),draft);assert.equal(s.knowledge[1].live.source,old.knowledge[1].live.source);
});
test('non-bundled customer records are not relabeled',()=>{
 const old=legacy();old.customers.push({id:'C099',name:'林小夏',email:'mine@example.test'});
 const s=Copy.upgrade(old).state;assert.deepEqual(s.customers.at(-1),old.customers.at(-1));
});
test('copy upgrade is idempotent and preserves current seeds',()=>{
 const s=Copy.upgrade(legacy()).state,result=Copy.upgrade(s);assert.equal(result.changed,false);assert.equal(result.state,s);
 const fresh=Seed.create(NOW);assert.equal(Copy.upgrade(fresh).changed,false);
});
test('default knowledge source changes invalidate affected cached publish tests',()=>{
 const old=legacy();old.knowledge[0].validation={passed:true,fingerprint:'old'};old.flow.validation={passed:true,fingerprint:'old'};
 const s=Copy.upgrade(old).state;assert.equal(s.knowledge[0].validation,null);assert.equal(s.flow.validation,null);
 assert.equal(s.knowledge[0].live.source,'售后服务政策');assert.equal(s.knowledge[0].live.answer,old.knowledge[0].live.answer);
});
test('store preserves a byte-exact backup before updating saved defaults',()=>{
 const raw=JSON.stringify(legacy()),m=memory(raw),s=Store.open(m,()=>Seed.create(NOW));
 assert.equal(s.blocked,'');assert.equal(m.getItem(Store.COPY_BACKUP_KEY),raw);assert.equal(s.state.customers[0].name,'客户 001');
 assert.equal(JSON.parse(m.getItem(Store.KEY)).copyVersion,Copy.VERSION);
 const r=s.state.revision;assert.equal(Store.open(m,()=>Seed.create(NOW)).state.revision,r);
});
test('backup failure blocks migration without replacing existing records',()=>{
 const raw=JSON.stringify(legacy()),m=memory(raw),set=m.setItem;
 m.setItem=(k,v)=>{if(k===Store.COPY_BACKUP_KEY)throw Error('backup denied');set(k,v);};
 const s=Store.open(m,()=>Seed.create(NOW));assert.match(s.blocked,/backup denied/);assert.equal(m.getItem(Store.KEY),raw);assert.equal(s.state,null);
});
test('save failure retains original state and backup',()=>{
 const raw=JSON.stringify(legacy()),m=memory(raw),set=m.setItem;
 m.setItem=(k,v)=>{if(k===Store.KEY)throw Error('quota exceeded');set(k,v);};
 const s=Store.open(m,()=>Seed.create(NOW));assert.match(s.blocked,/quota exceeded/);assert.equal(m.getItem(Store.KEY),raw);assert.equal(m.getItem(Store.COPY_BACKUP_KEY),raw);
});
test('a conflicting tab change prevents migration overwrite',()=>{
 const raw=JSON.stringify(legacy()),other=JSON.stringify({...legacy(),revision:999}),m=memory(raw),get=m.getItem;let count=0;
 m.getItem=k=>{if(k===Store.KEY&&++count===2)m.setItem(Store.KEY,other);return get(k);};
 const s=Store.open(m,()=>Seed.create(NOW));assert.ok(s.blocked);assert.equal(get(Store.KEY),other);
});
test('unrelated storage and draft keys are not touched',()=>{
 const m=memory(JSON.stringify(legacy()));m.setItem('qinghe-support-view','draft 原文 知序 青禾生活');m.setItem('zhixu-customer-demo-v3.1','old unrelated');
 Store.open(m,()=>Seed.create(NOW));assert.equal(m.getItem('qinghe-support-view'),'draft 原文 知序 青禾生活');assert.equal(m.getItem('zhixu-customer-demo-v3.1'),'old unrelated');
});
test('runtime templates contain no old branding or fake salutations',()=>{
 for(const name of ['index.html','src/app.js','src/domain.js','src/seed.js','src/views/shared.js','src/views/customer.js','src/views/desk.js','src/views/operations.js']){
  const body=fs.readFileSync(path.join(__dirname,'..',name),'utf8');assert.ok(!banned.test(body),name);
 }
});

test('retry after a failed migration backs up the latest original without replacing an earlier backup',()=>{
 const first=JSON.stringify(legacy()),m=memory(first),set=m.setItem;
 m.setItem=(k,v)=>{if(k===Store.KEY)throw Error('quota');set(k,v);};
 assert.ok(Store.open(m,()=>Seed.create(NOW)).blocked);
 const later=legacy();later.revision+=2;later.conversations[0].messages.push({id:'NEW-USER-TEXT',role:'customer',body:'迁移失败后补充的新内容',visibility:'public',at:NOW});
 const raw=JSON.stringify(later);m.setItem=set;m.setItem(Store.KEY,raw);
 const opened=Store.open(m,()=>Seed.create(NOW));assert.equal(opened.blocked,'');
 assert.equal(m.getItem(Store.COPY_BACKUP_KEY),first);
 assert.equal(m.getItem(Store.COPY_BACKUP_KEY+':1'),raw);
 assert.equal(opened.state.conversations[0].messages.at(-1).body,'迁移失败后补充的新内容');
});

test('same-name custom identities retain their audit attribution and ambiguous labels are preserved',()=>{
 const old=legacy();old.customers.push({id:'C099',name:'林小夏',email:'custom@example.test'});
 old.events.push({id:'CUSTOM-EVENT',actorId:'C099',actor:'林小夏',type:'say'});
 old.events.push({id:'BUILTIN-EVENT',actorId:'C001',actor:'林小夏',type:'say'});
 old.tickets[0].history.push({at:NOW,actor:'林小夏',publicText:'无身份标识的历史说明'});
 const s=Copy.upgrade(old).state;
 assert.equal(s.events.at(-2).actor,'林小夏');assert.equal(s.events.at(-1).actor,'客户 001');
 assert.equal(s.tickets[0].history.at(-1).actor,'林小夏');
});

test('changing bundled knowledge dependencies invalidates other article checks without editing drafts',()=>{
 const old=legacy(),custom=structuredClone(old.knowledge[0]);
 custom.id='KB-CUSTOM';custom.live.version=2;custom.live.source='独立维护的来源';
 custom.draft={...custom.live,answer:'手写知识草稿'};
 custom.validation={passed:true,fingerprint:Domain.fingerprint(old)};old.knowledge.push(custom);
 const s=Copy.upgrade(old).state;
 assert.equal(s.knowledge.at(-1).validation,null);
 assert.deepEqual(s.knowledge.at(-1).draft,custom.draft);
});

test('custom author names matching object properties survive serialization',()=>{
 const old=legacy();
 for(const author of ['constructor','toString','__proto__']){
  old.conversations[0].messages.push({id:'AUTHOR-'+author,role:'agent',author,body:'手写回复',visibility:'public',at:NOW});
  old.tickets[0].history.push({at:NOW,actor:author,publicText:'手写说明'});
 }
 const s=JSON.parse(JSON.stringify(Copy.upgrade(old).state));
 assert.deepEqual(s.conversations[0].messages.slice(-3).map(m=>m.author),['constructor','toString','__proto__']);
 assert.deepEqual(s.tickets[0].history.slice(-3).map(h=>h.actor),['constructor','toString','__proto__']);
});
