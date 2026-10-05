// 产出 Agent：Codex
const test=require('node:test');
const assert=require('node:assert/strict');
const Seed=require('../src/seed.js');
const Store=require('../src/store.js');
const {memory}=require('./helpers/app.cjs');
const NOW=Date.parse('2026-10-05T12:00:00Z');
const key='qinghe-support-ecommerce-v1';
const create=()=>Seed.createCommerce(NOW);
const open=storage=>Store.openCommerce(storage,create);

test('new commerce workspace persists independently without reading or writing old V4 data',()=>{
  const old='  {"broken V4":true}  ',storage=memory({[Store.KEY]:old,'qinghe-support-v4:before-copy-v1':'ORIGINAL-BACKUP'});
  const get=storage.getItem,read=[];storage.getItem=k=>{read.push(k);return get(k);};
  const store=open(storage);assert.equal(store.blocked,'');assert.equal(store.key,key);
  assert.ok(Store.validCommerce(store.state));assert.equal(JSON.parse(get(key)).schema,5);
  assert.equal(get(Store.KEY),old);assert.equal(get('qinghe-support-v4:before-copy-v1'),'ORIGINAL-BACKUP');
  assert.ok(!read.includes(Store.KEY));assert.ok(!read.includes('qinghe-support-view'));
});
test('existing commerce raw data wins over seed and roundtrips user history',()=>{
  const storage=memory(),store=open(storage);
  const id=store.dispatch({id:'C001',role:'customer'},'newConversation',{});
  store.dispatch({id:'C001',role:'customer'},'say',{id,body:'你好'});
  const raw=storage.getItem(key),loaded=Store.openCommerce(storage,()=>{throw Error('seed must not run');});
  assert.equal(loaded.blocked,'');assert.equal(storage.getItem(key),raw);
  assert.equal(loaded.state.conversations[0].messages.at(-2).body,'你好');
});
for(const raw of ['', '{broken', '{"schema":5}'])test('damaged existing commerce data is preserved: '+JSON.stringify(raw),()=>{
  const storage=memory({[key]:raw});const store=open(storage);
  assert.ok(store.blocked);assert.equal(store.state,null);assert.equal(store.original,raw);assert.equal(storage.getItem(key),raw);
});
test('initial save failure blocks entry without changing old data or inventing success',()=>{
  const storage=memory({[Store.KEY]:'UNCHANGED'});storage.setItem=()=>{throw Error('quota exceeded');};
  const store=open(storage);assert.match(store.blocked,/quota/);assert.equal(store.state,null);
  assert.equal(storage.getItem(Store.KEY),'UNCHANGED');assert.equal(storage.getItem(key),null);
});
test('initial readback failure preserves the newly written raw value for recovery',()=>{
  const storage=memory(),get=storage.getItem;let reads=0;
  storage.getItem=k=>k===key&&++reads===3?'CHANGED-BY-OTHER-TAB':get(k);
  const store=open(storage);assert.ok(store.blocked);assert.equal(store.state,null);
  assert.ok(get(key));assert.equal(store.original,'CHANGED-BY-OTHER-TAB');
});
test('an existing target appearing during initialization is never overwritten',()=>{
  const existing=JSON.stringify(create()),storage=memory(),get=storage.getItem;let reads=0;
  storage.getItem=k=>{if(k===key&&++reads===2)storage.setItem(k,existing);return get(k);};
  const store=open(storage);assert.ok(store.blocked);assert.equal(get(key),existing);
});
test('dispatch save failure and stale page both preserve current business state',()=>{
  const storage=memory(),store=open(storage),raw=storage.getItem(key),state=JSON.stringify(store.state),set=storage.setItem;
  storage.setItem=()=>{throw Error('denied');};
  assert.throws(()=>store.dispatch({id:'C001',role:'customer'},'newConversation',{}),/denied/);
  assert.equal(JSON.stringify(store.state),state);assert.equal(storage.getItem(key),raw);
  storage.setItem=set;storage.setItem(key,raw+' ');
  assert.throws(()=>store.dispatch({id:'C001',role:'customer'},'newConversation',{}),/其他页面/);
  assert.equal(JSON.stringify(store.state),state);
});
const invalid={
  'negative amount':s=>s.commerce.items[0].paidCents=-1,
  'fractional amount':s=>s.commerce.items[0].paidCents=1.5,
  'unsafe amount':s=>s.commerce.items[0].paidCents=Number.MAX_SAFE_INTEGER+1,
  'duplicate item':s=>s.commerce.items.push({...s.commerce.items[0]}),
  'cross-order allocation':s=>s.commerce.packages[0].allocations[0].itemId='EC-ITEM-009',
  'excess package quantity':s=>s.commerce.packages[0].allocations[0].quantity=2,
  'missing allocation':s=>s.commerce.packages[0].allocations=[],
  'payment amount mismatch':s=>s.commerce.payments[0].amountCents=1,
  'missing provenance':s=>delete s.commerce.payments[0].source,
  'unsupported currency':s=>s.commerce.items[0].currency='USD'
};
for(const [name,mutate] of Object.entries(invalid))test('commerce validation rejects '+name+' without resetting the saved value',()=>{
  const s=create();mutate(s);const raw=JSON.stringify(s),storage=memory({[key]:raw});
  assert.equal(Store.validCommerce(s),false);assert.ok(open(storage).blocked);assert.equal(storage.getItem(key),raw);
});
test('post-write read exception enters recovery and retains the bytes already saved',()=>{
  const storage=memory(),store=open(storage),get=storage.getItem;let written=false;
  const set=storage.setItem;storage.setItem=(k,v)=>{set(k,v);written=true;};
  storage.getItem=k=>{if(written&&k===key)throw Error('read denied');return get(k);};
  assert.throws(()=>store.dispatch({id:'C001',role:'customer'},'newConversation',{}),/回读|read denied/);
  assert.ok(store.blocked);assert.equal(store.state,null);assert.equal(store.original,get(key));
  assert.throws(()=>store.dispatch({id:'C001',role:'customer'},'newConversation',{}),/回读|read denied/);
});
