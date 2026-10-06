// 产出 Agent：Codex
const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../src/domain.js'),Seed=require('../src/seed.js');
const {app,memory,Store}=require('./helpers/app.cjs');
const NOW=Date.parse('2026-10-06T09:00:00Z'),who={id:'C001',role:'customer'},orderId='EC-SO20261005001';
function say(commerce,body){
  let state=commerce?Seed.createCommerce(NOW):Seed.create(NOW,false);
  const ex=(type,data)=>{const out=D.execute(state,who,type,data,NOW+1);state=out.state;return out.value;};
  const id=ex('newConversation'),before=D.copy(state);ex('say',{id,body});
  return {state,conv:D.get(state,'conversations',id),before};
}
for(const commerce of [false,true])for(const body of ['好嘞','谢啦','好滴','哈喽','拜拜','再见','没事了','不用了谢谢','您好哟','谢谢您啦','多谢哈','明白啦','知道啦','嗯嗯，好哒','再见咯','拜拜啦','不需要了，谢谢','没问题，谢谢呀'])test(`返修 social ${commerce?'commerce':'v4'}: ${body}`,()=>{
  const r=say(commerce,body);assert.equal(r.conv.state,'bot');assert.equal(r.conv.messages.at(-1).role,'bot');
  assert.deepEqual(r.state.cases,r.before.cases);assert.deepEqual(r.state.gaps,r.before.gaps);assert.deepEqual(r.state.tickets,r.before.tickets);
  assert.deepEqual(r.state.commerce?.aftersales,r.before.commerce?.aftersales);
});
for(const [body,bare] of [
  ['你好，我的快递到哪了','我的快递到哪了'],['您好，包裹到哪了','包裹到哪了'],
  ['你好，查一下我的订单','查一下我的订单'],[`你好，查一下包裹 ${orderId}`,`查一下包裹 ${orderId}`],
  [`哈喽呀，请查物流 ${orderId}，谢谢啦`,`请查物流 ${orderId}`],
  [`谢谢您，查一下我的订单 ${orderId}，再见`,`查一下我的订单 ${orderId}`]
])test(`返修 mixed lookup: ${body}`,()=>{
  const s=Seed.createCommerce(NOW);assert.deepEqual(D.classify(s,body,who.id,NOW),D.classify(s,bare,who.id,NOW));
  const r=say(true,body);assert.equal(r.conv.state,'bot');assert.equal(r.state.gaps.length,r.before.gaps.length);
  assert.equal(r.conv.messages.at(-1).body,say(true,bare).conv.messages.at(-1).body);
});
for(const body of ['保温杯破损怎么退','签收后发现杯子破了可以退吗','杯子坏了能不能退货','保温杯破损退货流程','保温杯碎了如何退货'])test(`返修 policy: ${body}`,()=>{
  const r=say(true,body),reply=r.conv.messages.at(-1);assert.equal(r.conv.state,'bot');assert.match(reply.body,/规则/);
  assert.match(reply.body,/129\.00/);assert.match(reply.body,/经理.*审核/);assert.ok(reply.citation.ruleRefs.length);
  assert.equal(r.state.commerce.aftersales.length,r.before.commerce.aftersales.length);
  assert.ok(r.state.cases.every(c=>!c.service));assert.equal(r.state.gaps.length,r.before.gaps.length);
});
for(const body of ['你好，我要人工','好嘞，请转人工客服','谢谢，礼品卡可以分多次使用吗？','你好，包裹没收到','谢啦，我的包裹停滞了'])test(`返修 preserve handoff: ${body}`,()=>{
  const r=say(true,body);assert.equal(r.conv.state,'queued');assert.equal(r.state.gaps.length-r.before.gaps.length,body.includes('礼品卡')?1:0);
});
for(const body of ['我要退货，杯子碎了','保温杯破损，我想退货怎么申请','帮我退货，保温杯坏了','申请保温杯退货流程'])test(`返修 preserve intake: ${body}`,()=>{
  const r=say(true,body);assert.equal(r.conv.state,'queued');assert.ok(r.state.cases.some(c=>c.service));
  assert.equal(r.state.commerce.aftersales.length,0);
});
test('返修 farewells preserve queued/human/closed states and completed records',()=>{
  for(const stage of ['queued','human','closed']){
    let s=Seed.create(NOW,false),id;
    const ex=(actor,type,data)=>{const r=D.execute(s,actor,type,data,NOW+1);s=r.state;return r.value;};
    id=ex(who,'newConversation');ex(who,'requestHuman',{id});
    if(stage!=='queued')ex({id:'lin',role:'agent'},'claimConversation',{id});
    if(stage==='closed')ex(who,'closeConversation',{id});
    const before=D.copy(s),cv=D.copy(D.get(s,'conversations',id));ex(who,'say',{id,body:'不用了谢谢，拜拜啦'});
    assert.equal(D.get(s,'conversations',id).state,stage);assert.equal(D.get(s,'conversations',id).ownerId,cv.ownerId);
    assert.deepEqual(s.cases,before.cases);assert.deepEqual(s.tickets,before.tickets);assert.deepEqual(s.gaps,before.gaps);
  }
});
const key='qinghe-support-ecommerce-v1',viewKey='qinghe-support-ecommerce-view-v1';
for(const search of ['', '?rev=repair', '?data=ecommerce'])test(`返修 ecommerce mode without V4 reads: ${search||'default'}`,()=>{
  const raw=JSON.stringify(Seed.create(NOW)),draft='{"draftScopes":{"customer:C001":{"unsent":"OLD-DRAFT"}}}';
  const local=memory({[Store.KEY]:raw}),session=memory({'qinghe-support-view':draft}),reads=[];
  const get=local.getItem;local.getItem=name=>{reads.push(name);return get(name);};
  const a=app({search,local,session});assert.match(a.one('.commerce-order-card').textContent,new RegExp(orderId));
  assert.ok(get(key));assert.ok(!reads.includes(Store.KEY));assert.equal(get(Store.KEY),raw);
  a.input('customer-say','body','电商未发送草稿');assert.equal(session.getItem('qinghe-support-view'),draft);
  assert.match(session.getItem(viewKey),/电商未发送草稿/);assert.deepEqual(a.errors,[]);
});
test('返修 explicit V4 entry shows old sample and leaves ecommerce value unchanged',()=>{
  const commerce=JSON.stringify(Seed.createCommerce(NOW)),local=memory({[key]:commerce});
  const a=app({search:'?data=v4',local});assert.match(a.one('.customer-home').textContent,/SO20260926001/);
  assert.equal(a.doc.querySelectorAll('.commerce-order-card').length,0);assert.equal(local.getItem(key),commerce);
});
for(const [search,mode] of [['','ecommerce'],['?data=v4','v4'],['?data=ecommerce','ecommerce']])test(`返修 independent customer link keeps ${mode}: ${search}`,()=>{
  const a=app({search}),href=a.one('[aria-label="打开独立客户页"]').getAttribute('href');
  const u=new URL(href,'http://127.0.0.1:8770/');assert.equal(u.searchParams.get('data'),mode);
  const b=app({search:u.search,hash:u.hash});assert.equal(b.doc.querySelectorAll('.workspace-tabs').length,0);
  assert.equal(b.doc.querySelectorAll('.commerce-order-card').length,mode==='ecommerce'?1:0);
});
test('返修 policy reply provides a working application entry without creating an application',()=>{
  const a=app({search:'?data=ecommerce'});a.input('customer-say','body','保温杯破损怎么退');a.submit('customer-say');
  assert.match(a.one('.messages').textContent,/规则/);const entry=a.one('.message [data-action="commerce-aftersale"]');
  entry.focus();a.doc._dispatch('click',{target:entry});assert.equal(a.one('#dialog').open,true);
  assert.match(a.one('#dialog-body').textContent,/保温杯/);assert.equal(JSON.parse(a.local.getItem(key)).commerce.aftersales.length,0);
});
for(const body of ['哈喽哈喽','哈喽，哈喽','你好，哈喽'])test(`返修 supported social composition: ${body}`,()=>{
  for(const commerce of [false,true]){const r=say(commerce,body);assert.equal(r.conv.state,'bot');assert.deepEqual(r.state.cases,r.before.cases);assert.deepEqual(r.state.gaps,r.before.gaps);}
});
for(const [body,bare] of [[`你好，${orderId}，谢谢`,orderId],[`你好，哈喽，查物流 ${orderId}`,`查物流 ${orderId}`],['你好，物流','物流']])test(`返修 lookup intent before edge normalization: ${body}`,()=>{
  const s=Seed.createCommerce(NOW);assert.deepEqual(D.classify(s,body,who.id,NOW),D.classify(s,bare,who.id,NOW));
});
for(const body of [`不用查物流 ${orderId}`,`不需要查支付 ${orderId}`])test(`返修 preserve negated query: ${body}`,()=>{
  const r=say(true,body);assert.ok(!r.state.cases.some(c=>c.kind==='order'&&c.status==='completed'));
});
for(const body of [`查询支付 ${orderId}，我钱被扣两次了，保温杯破损怎么退`,'物流一直没更新，保温杯破损怎么退','收纳袋没到，保温杯破损怎么退'])test(`返修 mixed policy keeps independent issue unresolved: ${body}`,()=>{
  const r=say(true,body);assert.equal(r.conv.state,'queued');assert.ok(r.state.cases.some(c=>c.status!=='completed'));
});
