// 产出 Agent：Codex
const test=require('node:test');
const assert=require('node:assert/strict');
const Seed=require('../src/seed.js');
const D=require('../src/domain.js');
const NOW=Date.parse('2026-10-05T12:00:00Z');
const customer={id:'C001',role:'customer'};
const orderId='EC-SO20261005001';
const create=()=>Seed.createCommerce(NOW);

test('commerce sample has one customer order, two items and two separate packages',()=>{
  const s=create(),view=D.customerView(s,'C001');
  assert.equal(s.schema,5);assert.equal(view.orders.length,1);
  const facts=view.orders[0].commerce;
  assert.equal(facts.orderId,orderId);assert.equal(facts.items.length,2);
  assert.deepEqual(facts.items.map(x=>[x.name,x.quantity,x.paidCents]),[['原木便携保温杯',1,12900],['棉麻收纳袋',1,4900]]);
  assert.equal(facts.payment.status,'paid');assert.equal(facts.payment.amountCents,17800);
  assert.deepEqual(facts.packages.map(x=>x.status),['signed','in_transit']);
  assert.equal(facts.packages[0].allocations[0].itemId,facts.items[0].id);
  assert.equal(facts.packages[1].allocations[0].itemId,facts.items[1].id);
  assert.equal(s.tickets.length,0);assert.equal(s.cases.length,0);
});
test('payment and package queries have independent scopes and explicit fact provenance',()=>{
  const s=create(),payment=D.execute(s,customer,'queryCommerce',{orderId,scope:'payment'},NOW).value;
  assert.equal(payment.payment.amountCents,17800);assert.equal(payment.packages.length,0);
  assert.equal(payment.payment.simulated,true);assert.equal(payment.payment.version,1);
  assert.equal(payment.payment.source,'模拟支付服务');assert.equal(payment.payment.queriedAt,NOW);
  const packages=D.execute(s,customer,'queryCommerce',{orderId,scope:'packages'},NOW).value;
  assert.equal(packages.payment,null);assert.equal(packages.packages.length,2);
});
for(const id of ['EC-SO20261005009','NOT-FOUND'])test('customer cannot query foreign or missing commerce order: '+id,()=>{
  const s=create(),raw=JSON.stringify(s);
  assert.throws(()=>D.execute(s,customer,'queryCommerce',{orderId:id},NOW),/核对|无权/);
  assert.equal(JSON.stringify(s),raw);
});
test('item/package filters reject foreign references instead of guessing an object',()=>{
  const s=create(),foreign=s.commerce.items.find(x=>x.orderId!==orderId);
  assert.throws(()=>D.execute(s,customer,'queryCommerce',{orderId,itemId:foreign.id},NOW),/商品/);
  assert.throws(()=>D.execute(s,customer,'queryCommerce',{orderId,packageId:'MISSING'},NOW),/包裹/);
  assert.throws(()=>D.execute(s,customer,'queryCommerce',{orderId,scope:'refund'},NOW),/范围/);
});
test('querying one item leaves the other item and all business records unchanged',()=>{
  const s=create(),raw=JSON.stringify(s.commerce),itemId=s.commerce.items[1].id;
  const result=D.execute(s,customer,'queryCommerce',{orderId,itemId},NOW);
  assert.equal(result.value.items.length,1);assert.equal(result.value.packages.length,1);
  assert.equal(result.value.packages[0].status,'in_transit');
  assert.equal(JSON.stringify(result.state.commerce),raw);
  assert.equal(result.state.cases.length,0);assert.equal(result.state.tickets.length,0);
});
for(const queryStatus of ['failed','unknown'])test('payment '+queryStatus+' never becomes unpaid or a definite paid amount',()=>{
  const s=create();s.commerce.payments[0].queryStatus=queryStatus;
  const result=D.execute(s,customer,'queryCommerce',{orderId},NOW).value;
  assert.equal(result.payment.queryStatus,queryStatus);assert.equal(result.payment.status,null);
  assert.equal(result.payment.amountCents,null);assert.equal(result.totalPaidCents,null);
  assert.match(require('../src/commerce.js').summary(result),queryStatus==='failed'?/查询失败/:/结果未知/);
});
test('public projections do not include internal payment/package properties or another customer',()=>{
  const s=create();s.commerce.payments[0].internalText='INTERNAL-PAYMENT';s.commerce.packages[0].internalText='INTERNAL-PACKAGE';
  const raw=JSON.stringify(D.customerView(s,'C001'));
  assert.doesNotMatch(raw,/INTERNAL-|EC-SO20261005009|EC-ITEM-009/);
});
test('chat understands the independent commerce order prefix and explains both packages',()=>{
  let s=create();const id=s.conversations[0].id;
  s=D.execute(s,customer,'say',{id,body:'查物流 '+orderId},NOW).state;
  const conv=D.get(s,'conversations',id),last=conv.messages.at(-1);
  assert.match(last.body,/保温杯/);assert.match(last.body,/收纳袋/);
  assert.match(last.body,/已签收/);assert.match(last.body,/运输中/);assert.match(last.body,/178\.00/);
  assert.equal(conv.state,'bot');assert.equal(s.cases[0].result.evidence.kind,'simulated-commerce');
});
test('signed-but-not-received is an unresolved request even when tracking can be queried',()=>{
  const s=create(),id=s.conversations[0].id;
  const result=D.execute(s,customer,'say',{id,body:'查物流 '+orderId+'，杯子显示签收但没收到'},NOW).state;
  assert.equal(result.conversations[0].state,'queued');assert.equal(result.cases[0].status,'open');
  assert.equal(result.cases[0].result,null);
});
test('agents must own the actual customer conversation before querying commerce facts',()=>{
  let s=create();const id=s.conversations[0].id,agent={id:'lin',role:'agent'};
  assert.throws(()=>D.execute(s,agent,'queryCommerce',{orderId,conversationId:id},NOW),/领取|接管/);
  s=D.execute(s,customer,'requestHuman',{id},NOW).state;
  s=D.execute(s,agent,'claimConversation',{id},NOW).state;
  assert.equal(D.execute(s,agent,'queryCommerce',{orderId,conversationId:id},NOW).value.packages.length,2);
  assert.throws(()=>D.execute(s,agent,'queryCommerce',{orderId:'EC-SO20261005009',conversationId:id},NOW),/核对|无权/);
});
test('existing whole-order intake cannot register a commerce aftersale before the item flow exists',()=>{
  let s=create();const id=s.conversations[0].id;
  s=D.execute(s,customer,'say',{id,body:'申请退货 '+orderId},NOW).state;
  assert.equal(s.conversations[0].state,'queued');assert.equal(s.tickets.length,0);
});
for(const detail of ['显示签收但没有收到','杯子碎了','快递丢了','物流异常','支付失败','商品和描述不一样','卡上扣了两笔钱'])test('business exception cannot be completed by a generic tracking reply: '+detail,()=>{
  const s=create(),id=s.conversations[0].id,result=D.execute(s,customer,'say',{id,body:'查物流 '+orderId+'，'+detail},NOW).state;
  assert.equal(result.conversations[0].state,'queued');assert.equal(result.cases[0].status,'open');assert.equal(result.cases[0].result,null);
});
test('a simple polite payment query still returns verified commerce facts',()=>{
  const s=create(),id=s.conversations[0].id,result=D.execute(s,customer,'say',{id,body:'请帮我查询一下支付状态 '+orderId},NOW).state;
  assert.equal(result.conversations[0].state,'bot');assert.equal(result.cases[0].status,'completed');assert.match(result.conversations[0].messages.at(-1).body,/已支付/);
});
for(const body of ['查物流，物流异常','查支付，支付失败'])test('supplying an order in a later turn cannot erase the unresolved description: '+body,()=>{
  let s=create();const id=s.conversations[0].id;
  s=D.execute(s,customer,'say',{id,body},NOW).state;assert.equal(s.conversations[0].state,'queued');
  s=D.execute(s,customer,'say',{id,body:orderId},NOW+1).state;
  assert.equal(s.conversations[0].state,'queued');assert.ok(s.cases.every(c=>c.status==='open'&&c.result===null));
});
test('a plain query without an order can collect the order in a later turn',()=>{
  let s=create();const id=s.conversations[0].id;
  s=D.execute(s,customer,'say',{id,body:'查物流'},NOW).state;assert.equal(s.conversations[0].state,'bot');
  s=D.execute(s,customer,'say',{id,body:orderId},NOW+1).state;assert.equal(s.conversations[0].state,'bot');
  assert.ok(s.cases.some(c=>c.status==='completed'));assert.match(s.conversations[0].messages.at(-1).body,/包裹 2/);
});
function failedHuman(){
  let s=create();const id=s.conversations[0].id,agent={id:'lin',role:'agent'};
  s.commerce.packages[0].queryStatus='failed';
  s=D.execute(s,customer,'say',{id,body:'查物流 '+orderId},NOW).state;
  s=D.execute(s,agent,'claimConversation',{id},NOW).state;
  return {s,id,agent,caseId:s.cases[0].id};
}
test('AI continuation refuses incomplete commerce facts rather than replying from an order summary',()=>{
  const {s,id,agent}=failedHuman();
  const next=D.execute(s,agent,'setAiAssist',{id,enabled:true},NOW).state;
  assert.equal(D.aiPending(next,id,NOW+31000),null);
});
test('SOP logistics recognizes a successful commerce query and keeps failed queries unfinished',()=>{
  const s=create(),id=s.conversations[0].id,result=D.execute(s,customer,'say',{id,body:'查物流 '+orderId},NOW).state;
  assert.equal(D.sopView(result,id,result.cases[0].id,NOW).nodes.find(x=>x.key==='logistics').status,'done');
  const f=failedHuman(),queried=D.execute(f.s,f.agent,'queryOrder',{conversationId:f.id,caseId:f.caseId},NOW).state;
  assert.equal(D.sopView(queried,f.id,f.caseId,NOW).nodes.find(x=>x.key==='logistics').status,'todo');
});
test('commerce built-in regression uses actual sample IDs and the current intake boundary',()=>{
  const s=create(),rows=D.regression(s,NOW).rows;
  assert.ok(rows.every(x=>x.pass),JSON.stringify(rows.filter(x=>!x.pass)));
});
test('default V4 cannot pretend to answer a payment question with a logistics summary',()=>{
  let s=Seed.create(NOW,false),r=D.execute(s,customer,'newConversation',{},NOW);s=r.state;
  s=D.execute(s,customer,'say',{id:r.value,body:'查支付 SO20260926001'},NOW).state;
  assert.equal(s.conversations[0].state,'queued');assert.equal(s.cases[0].status,'open');assert.equal(s.cases[0].result,null);
});
test('commerce order reply snapshots include package facts and reject a stale copied reply',()=>{
  const f=failedHuman();f.s.commerce.packages[0].queryStatus='ok';
  const r=D.execute(f.s,f.agent,'queryOrder',{conversationId:f.id,caseId:f.caseId},NOW);
  assert.equal(r.value.order.commerce.packages[0].status,'signed');
  r.state.commerce.packages[0].version++;
  assert.throws(()=>D.execute(r.state,f.agent,'reply',{id:f.id,orderCaseId:f.caseId,orderSnapshot:r.value.order,body:r.value.body},NOW),/事实已变化/);
});
