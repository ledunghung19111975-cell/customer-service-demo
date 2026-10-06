// 产出 Agent：Codex；返修回退及说法类别边界。
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../src/domain.js'),Seed=require('../src/seed.js');
const now=Date.parse('2026-10-06T09:00:00Z'),who={id:'C001',role:'customer'},order='EC-SO20261005001';
for(const commerce of [false,true])for(const body of ['88','8886','回头见','下次见啦','谢谢亲','多谢小姐姐呀','感谢客服小哥哥','行','行呀','早呀','早啊','嗨','嗨呀','回头见，谢谢亲'])test(`续修 social ${commerce}: ${body}`,()=>{
  let s=commerce?Seed.createCommerce(now):Seed.create(now,false);
  let r=D.execute(s,who,'newConversation',{},now);s=r.state;const id=r.value,before=D.copy(s);
  s=D.execute(s,who,'say',{id,body},now+1).state;
  assert.equal(D.get(s,'conversations',id).state,'bot');
  assert.deepEqual(s.cases,before.cases);assert.deepEqual(s.gaps,before.gaps);assert.deepEqual(s.tickets,before.tickets);
  assert.deepEqual(s.commerce?.aftersales,before.commerce?.aftersales);
});
for(const body of [`查物流 ${order}`,`查支付 ${order}`,`查下订单 ${order}`,`嗨，查下订单 ${order}，谢谢亲`,`早呀，查下包裹 ${order}，回头见`])test(`续修 query: ${body}`,()=>{
  const rows=D.classify(Seed.createCommerce(now),body,who.id,now);
  assert.equal(rows.length,1);assert.equal(rows[0].kind,'order');assert.equal(rows[0].order.id,order);
  assert.equal(rows[0].commerce.packages.length,2);
});
for(const body of ['杯子坏了能退吗','杯子破损能退货吗','嗨，保温杯裂了能退吗，谢谢亲'])test(`续修 policy: ${body}`,()=>{
  const rows=D.classify(Seed.createCommerce(now),body,who.id,now);
  assert.equal(rows.length,1);assert.equal(rows[0].kind,'answer');
  assert.match(rows[0].knowledge.answer,/129\.00/);assert.ok(rows[0].knowledge.ruleRefs.length);
});
for(const body of ['行，我要人工','早呀，帮我退货','谢谢亲，我的包裹没到','嗨，礼品卡能分次用吗','回头见，我的钱扣了两次','杯子坏了能退吗，袋子没到'])test(`续修 keep business: ${body}`,()=>{
  const rows=D.classify(Seed.createCommerce(now),body,who.id,now);
  assert.ok(rows.some(r=>['handoff','gap','intake'].includes(r.kind)));
  assert.ok(!rows.some(r=>r.kind==='social'));
});
test('续修 numeric goodbye does not strip order suffix',()=>{
  const s=Seed.createCommerce(now);s.orders[0].id='EC-SO8888';
  for(const table of ['items','payments','packages'])for(const row of s.commerce[table])if(row.orderId===order)row.orderId='EC-SO8888';
  const rows=D.classify(s,'查物流 EC-SO8888',who.id,now);
  assert.equal(rows[0].kind,'order');assert.equal(rows[0].order.id,'EC-SO8888');
});
for(const body of ['谢啦亲','谢了老板','好哇','好咧','谢谢你们','再会'])test(`审查 social: ${body}`,()=>{
  assert.equal(D.classify(Seed.createCommerce(now),body,who.id,now)[0].kind,'social');
});
for(const body of ['保温杯破损怎么退，卡上扣了两笔钱','保温杯破损怎么退，我的钱被扣了两次','保温杯破损怎么退，退款还没到账','保温杯破损怎么退，包裹没收到而且杯子坏了','保温杯退货规则，订单地址错了','保温杯怎么退，你们几点开门'])test(`审查 mixed policy: ${body}`,()=>{
  let r=D.execute(Seed.createCommerce(now),who,'newConversation',{},now);const id=r.value;
  r=D.execute(r.state,who,'say',{id,body},now+1);
  assert.equal(D.get(r.state,'conversations',id).state,'queued');
  assert.ok(r.state.cases.some(c=>c.status!=='completed'));
});
for(const suffix of ['20261005OK','HI','HELLO'])test(`审查 intact alphanumeric ID: ${suffix}`,()=>{
  const s=Seed.createCommerce(now),id='EC-SO'+suffix;s.orders[0].id=id;
  for(const table of ['items','payments','packages'])for(const row of s.commerce[table])if(row.orderId===order)row.orderId=id;
  const rows=D.classify(s,`嗨，查物流 ${id}，谢谢亲`,who.id,now);
  assert.equal(rows[0].kind,'order');assert.equal(rows[0].order.id,id);assert.equal(rows[0].commerce.packages.length,2);
});
test('审查 greeting with address preserves lookup',()=>{
  assert.equal(D.classify(Seed.createCommerce(now),`你好客服，查物流 ${order}`,who.id,now)[0].kind,'order');
});
for(const suffix of ['ok','okay','hi','hello'])test(`复验 separate English social suffix: ${suffix}`,()=>{
  const s=Seed.createCommerce(now);
  assert.deepEqual(D.classify(s,`嗨，查物流 ${order}，${suffix}`,who.id,now),D.classify(s,`查物流 ${order}`,who.id,now));
});
test('复验 declining human preserves pure policy',()=>{
  assert.equal(D.classify(Seed.createCommerce(now),'不要转人工，我只问退货规则',who.id,now)[0].kind,'answer');
});
