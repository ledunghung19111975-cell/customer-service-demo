// 产出 Agent：Codex
const test=require('node:test');
const assert=require('node:assert/strict');
const {app,memory,Store,Seed,D}=require('./helpers/app.cjs');
const key='qinghe-support-ecommerce-v1',viewKey='qinghe-support-ecommerce-view-v1';
const orderId='EC-SO20261005001';
const preview=options=>app({search:'?data=ecommerce',...options});
test('commerce customer shows a single order with item amounts, paid status and two packages',()=>{
  const a=preview();assert.equal(a.doc.querySelectorAll('.commerce-order-card').length,1);
  const text=a.one('.commerce-order-card').textContent;
  assert.match(text,/129\.00/);assert.match(text,/49\.00/);assert.match(text,/178\.00/);
  assert.match(text,/已支付/);assert.match(text,/已签收/);assert.match(text,/运输中/);
  assert.equal(a.doc.querySelectorAll('[data-action="order-return"]').length,0);
});
test('desktop facts modal gives the selected package/item and never another customer',()=>{
  const a=preview();a.click('commerce-query',orderId);
  assert.equal(a.one('#dialog').open,true);const text=a.one('#dialog-body').textContent;
  assert.match(text,/保温杯/);assert.match(text,/收纳袋/);assert.match(text,/模拟支付服务/);
  assert.doesNotMatch(text,/EC-SO20261005009|EC-ITEM-009/);assert.deepEqual(a.errors,[]);
});
test('mobile and desktop query the same order and the mobile dialog stays inside the phone',()=>{
  const a=preview({hash:'#mobile'});a.click('mobile-orders');a.click('commerce-query',orderId);
  assert.equal(a.one('#dialog').parentElement.className,'phone-overlay-host');
  assert.match(a.one('#dialog-body').textContent,/178\.00/);assert.match(a.one('#dialog-body').textContent,/包裹 2/);
  const raw=a.local.getItem(key);a.click('close-modal');a.click('workspace','customer');
  assert.match(a.one('.commerce-order-card').textContent,/棉麻收纳袋/);assert.equal(a.local.getItem(key),raw);
});
test('commerce entry never alters old V4 raw data or old draft cache',()=>{
  const old=JSON.stringify(Seed.create()),draft='{"draftScopes":{"customer:C001":{"unsent":"KEEP-ME"}}}';
  const local=memory({[Store.KEY]:old}),session=memory({'qinghe-support-view':draft});
  const a=preview({local,session});a.input('customer-say','body','电商未发送草稿');
  assert.equal(local.getItem(Store.KEY),old);assert.equal(session.getItem('qinghe-support-view'),draft);
  assert.match(session.getItem(viewKey),/电商未发送草稿/);
  const reloaded=a.reload();assert.equal(reloaded.one('#customer-input').value,'电商未发送草稿');
});
test('broken commerce raw value has a recovery screen instead of replacing it with samples',()=>{
  const local=memory({[key]:'{broken'}),a=preview({local});
  assert.match(a.one('h1').textContent,/暂时无法读取/);assert.equal(local.getItem(key),'{broken');
  assert.ok(a.doc.querySelector('[data-action="export-broken"]'));
});
test('system administrator can find the byte-preserving V4 export',()=>{
  const a=preview({hash:'#ops/data',session:memory({[viewKey]:'{"opsRole":"admin"}'})});
  assert.ok(a.doc.querySelector('[data-action="export-v4"]'));
  assert.match(a.one('.workspace-content').textContent,/V4/);
});
test('agent adopts and sends the actual commerce query snapshot through the real UI events',()=>{
  let s=Seed.createCommerce(),id=s.conversations[0].id;const customer={id:'C001',role:'customer'},agent={id:'lin',role:'agent'};
  s.commerce.packages[0].queryStatus='failed';
  s=D.execute(s,customer,'say',{id,body:'查物流 '+orderId}).state;
  s=D.execute(s,agent,'claimConversation',{id}).state;s.commerce.packages[0].queryStatus='ok';
  const caseId=s.cases[0].id,local=memory({[key]:JSON.stringify(s)}),session=memory({[viewKey]:JSON.stringify({deskFilter:'mine',deskConversation:id})});
  const a=preview({local,session,hash:'#desk/inbox'});a.click('toggle-sop-node','logistics');a.click('sop-query-order',caseId);a.click('sop-insert-order',caseId);
  const body=a.value('reply','body');assert.match(body,/包裹 1/);assert.match(body,/包裹 2/);assert.match(body,/178\.00/);
  a.submit('reply');const next=JSON.parse(local.getItem(key)),reply=next.conversations[0].messages.at(-1);
  assert.equal(reply.role,'agent');assert.equal(reply.caseId,caseId);assert.equal(reply.body,body);assert.deepEqual(a.errors,[]);
});
