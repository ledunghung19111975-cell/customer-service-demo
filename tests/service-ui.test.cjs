// 产出 Agent：Codex
const test=require('node:test');
const assert=require('node:assert/strict');
const {app,memory,Seed,D,Store}=require('./helpers/app.cjs');
const KEY='qinghe-support-ecommerce-v1',VIEW='qinghe-support-ecommerce-view-v1';
const ORDER='EC-SO20261005001';
const customer={id:'C001',role:'customer'},agent={id:'lin',role:'agent'},manager={id:'manager',role:'manager'},admin={id:'admin',role:'admin'};
const preview=options=>app({search:'?data=ecommerce',...options});
const state=a=>JSON.parse(a.local.getItem(KEY));
const services=a=>D.customerView(state(a),'C001').services;
function clickNode(a,selector){const target=a.one(selector);assert.equal(target.disabled,false);a.doc._dispatch('click',{target});}
function openApplication(a){a.click('commerce-aftersale',ORDER);a.input('aftersale-request','reason','保温杯杯身受损，需要退货退款');}
function sendApplication(a){openApplication(a);a.submit('aftersale-request');assert.ok(a.doc.querySelector('form[data-form="aftersale-confirm"]'),a.one('#dialog-error').textContent);a.submit('aftersale-confirm');assert.equal(state(a).commerce.aftersales.length,1);return services(a).find(d=>d.request);}
function acceptedState(){
  let s=Seed.createCommerce(),id=s.conversations[0].id;
  const data={conversationId:id,orderId:ORDER,itemId:s.commerce.items.find(i=>i.orderId===ORDER).id,quantity:1,serviceType:'return_refund',reason:'保温杯杯身受损，需要退货退款',evidenceRef:'DEMO-DAMAGE-001'};
  const p=D.execute(s,customer,'previewAftersale',data);s=p.state;
  const r=D.execute(s,customer,'confirmAftersale',{...data,token:p.value.token,requestId:'UI-SETUP',confirmed:true});s=r.state;
  const d=D.customerView(s,'C001').services.find(d=>d.request);
  s=D.execute(s,manager,'submitReview',{aftersaleId:d.request.id,decision:'approved',reason:'按商品及受损材料核对通过'}).state;
  return {s,id,caseId:d.caseId||d.id,aftersaleId:d.request.id};
}
function adminPage(a){a.click('workspace','ops');a.change('ops-role','admin');a.click('ops-page','data');}
function receipt(a,id,kind,reason='本地模拟回执'){
  clickNode(a,`[data-action="service-receipt"][data-id="${id}"][data-kind="${kind}"]`);
  a.input('service-receipt','reason',reason);a.submit('service-receipt');
  assert.equal(a.one('#dialog-error').hidden,true,a.one('#dialog-error').textContent);
}
test('actual query metric opens its saved business evidence',()=>{const a=preview();a.input('customer-say','body','查支付 '+ORDER);a.submit('customer-say');a.click('workspace','ops');a.click('service-metric','queries');const row=D.metrics(state(a)).service.metricCaseIds.queries[0];assert.ok(row);a.click('service-detail',row);assert.match(a.one('#dialog-body').textContent,/已支付|支付成功/);assert.doesNotMatch(a.one('#toast').textContent,/请选择商品服务事项/);assert.deepEqual(a.errors,[]);});
test('published knowledge can run actual whole workflow evaluation without a draft',()=>{const a=preview();a.click('workspace','ops');a.change('ops-role','operator');a.click('ops-page','knowledge');a.click('service-eval','KB001');const report=state(a).commerce.evaluations.at(-1);assert.equal(report.pass,true,JSON.stringify(report.rows.filter(r=>!r.pass)));assert.equal(report.rows.length,12);assert.deepEqual(a.errors,[]);});
test('manager can process an expired handoff through the real UI',()=>{let f=acceptedState();f.s=D.execute(f.s,agent,'claimConversation',{id:f.id}).state;const r=D.execute(f.s,agent,'proposeHandoff',{caseId:f.caseId,targetId:'zhou',reason:'续办',dueAt:Date.now()-1000},Date.now()-2000);f.s=r.state;const a=preview({local:memory({[KEY]:JSON.stringify(f.s)})});a.click('workspace','ops');a.click('service-expire-handoffs');assert.equal(state(a).commerce.handoffs[0].status,'expired');assert.equal(state(a).cases.find(c=>c.id===f.caseId).ownerId,'lin');assert.deepEqual(a.errors,[]);});

test('commerce application is attached to a selected item and requires a customer confirmation',()=>{
  const a=preview();const buttons=a.doc.querySelectorAll('[data-action="commerce-aftersale"]');
  assert.equal(buttons.length,2);assert.notEqual(buttons[0].dataset.item,buttons[1].dataset.item);
  openApplication(a);a.submit('aftersale-request');
  assert.equal(state(a).commerce.aftersales.length,0);assert.match(a.one('#dialog-body').textContent,/129\.00/);
  assert.doesNotMatch(a.one('#dialog-body').textContent,/178\.00/);
  a.click('close-modal');assert.equal(state(a).commerce.aftersales.length,0);
  openApplication(a);a.submit('aftersale-request');a.submit('aftersale-confirm');
  const d=services(a).find(d=>d.request);assert.equal(d.request.quantity,1);assert.equal(d.request.status,'awaiting_review');
  assert.equal(state(a).commerce.aftersales.length,1);assert.equal(d.refund?.status||'not_submitted','not_submitted');
  assert.deepEqual(a.errors,[]);
});
test('changing application fields requires another preview and preserves the reason',()=>{
  const a=preview();openApplication(a);a.submit('aftersale-request');a.click('aftersale-back');
  assert.match(a.value('aftersale-request','reason'),/杯身受损/);
  const badItem=state(a).commerce.items.find(i=>i.orderId!==ORDER).id;
  a.input('aftersale-request','itemId',badItem);a.submit('aftersale-request');
  assert.equal(a.one('#dialog-error').hidden,false);assert.ok(a.doc.querySelector('form[data-form="aftersale-request"]'));
  assert.equal(a.doc.querySelector('form[data-form="aftersale-confirm"]'),null);assert.equal(state(a).commerce.aftersales.length,0);
  assert.match(a.value('aftersale-request','reason'),/杯身受损/);
});
test('phone application failure stays inside the phone and restores its editable draft after reload',()=>{
  const a=preview({hash:'#mobile'});a.click('mobile-orders');a.click('commerce-aftersale',ORDER);
  a.input('aftersale-request','reason','保温杯破裂，保留这条未提交说明');a.input('aftersale-request','evidenceRef','');a.submit('aftersale-request');
  assert.equal(a.one('#dialog').parentElement.className,'phone-overlay-host');assert.equal(a.one('#dialog-error').hidden,false);
  assert.match(a.value('aftersale-request','reason'),/保留这条/);
  const b=a.reload();b.click('mobile-orders');b.click('commerce-aftersale',ORDER);
  assert.match(b.value('aftersale-request','reason'),/保留这条/);assert.equal(state(b).commerce.aftersales.length,0);
  assert.equal(b.one('#dialog').parentElement.className,'phone-overlay-host');
});
test('a failed formal save keeps the confirmation form and never claims that the application exists',()=>{
  let fail=false;const values=memory();const local={getItem:k=>values.getItem(k),setItem(k,v){if(fail)throw Error('模拟保存失败');values.setItem(k,v);}};
  const a=preview({local});openApplication(a);a.submit('aftersale-request');const raw=a.local.getItem(KEY);fail=true;a.submit('aftersale-confirm');
  assert.equal(a.local.getItem(KEY),raw);assert.equal(state(a).commerce.aftersales.length,0);
  assert.ok(a.doc.querySelector('form[data-form="aftersale-confirm"]'));assert.equal(a.one('#dialog-error').hidden,false);
  fail=false;a.submit('aftersale-confirm');assert.equal(state(a).commerce.aftersales.length,1);
});
test('customer progress counts independent matters and public detail hides the handoff summary',()=>{
  const a=preview();sendApplication(a);a.click('close-modal');a.input('customer-say','body','收纳袋没到，保温杯破了想退 '+ORDER);a.submit('customer-say');
  const list=services(a);assert.ok(list.length>=2);assert.equal(a.doc.querySelectorAll('.service-progress-card').length,list.length);
  const first=list.find(d=>d.request);a.click('service-detail',first.caseId||first.id);
  const text=a.one('#dialog-body').textContent;assert.match(text,/申请审批/);assert.match(text,/寄回验收/);assert.match(text,/退款执行/);assert.match(text,/下次反馈时间/);
  assert.equal(a.doc.querySelector('.service-handoff-summary'),null);assert.equal(a.doc.querySelector('form[data-form="service-review"]'),null);
  a.click('close-modal');a.click('workspace','mobile');a.click('mobile-progress');
  assert.equal(a.doc.querySelectorAll('#dialog-body .service-progress-card').length,list.length);
});
test('real UI events separate approval, return, warehouse, refund, notification and customer feedback',()=>{
  const a=preview();const d=sendApplication(a),caseId=d.caseId||d.id,aftersaleId=d.request.id,id=state(a).conversations[0].id;
  a.click('workspace','ops');a.click('service-detail',caseId);a.input('service-review','reason','受损材料与本商品核对通过');a.submit('service-review');
  assert.equal(services(a).find(d=>d.request).request.status,'approved');
  a.click('workspace','customer');a.click('service-detail',caseId);a.click('service-return',aftersaleId);
  a.input('service-return','trackingNumber','DEMO-RETURN-UI-001');a.submit('service-return');
  assert.equal(services(a).find(d=>d.request).return.status,'in_transit');
  adminPage(a);receipt(a,aftersaleId,'warehouse_received');receipt(a,aftersaleId,'warehouse_passed');
  a.click('workspace','customer');a.click('request-human',id);a.click('workspace','desk');a.click('claim-conversation',id);
  assert.ok(a.doc.querySelector('.service-handoff-summary'));a.click('service-refund',aftersaleId);a.submit('service-refund');
  let next=services(a).find(d=>d.request);const requestId=next.refund.requestId;
  assert.equal(next.refund.status,'pending');assert.equal(next.feedback,'pending');
  adminPage(a);receipt(a,aftersaleId,'refund_unknown');a.click('workspace','customer');a.click('service-detail',caseId);
  assert.match(a.one('#dialog-body').textContent,/结果未知/);assert.doesNotMatch(a.one('#dialog-body').textContent,/模拟退款成功/);
  a.click('workspace','desk');a.click('service-query-refund',aftersaleId);assert.equal(services(a).find(d=>d.request).refund.requestId,requestId);
  adminPage(a);receipt(a,aftersaleId,'refund_succeeded');receipt(a,aftersaleId,'notification_sent');
  a.click('workspace','customer');a.click('service-detail',caseId);next=services(a).find(d=>d.request);
  assert.equal(next.refund.status,'succeeded');assert.equal(next.notification.status,'sent');assert.equal(next.feedback,'pending');
  assert.match(a.one('#dialog-body').textContent,/模拟退款成功/);a.click('confirm-case',caseId);
  assert.equal(services(a).find(d=>d.request).feedback,'confirmed');
  a.click('service-detail',caseId);a.click('service-dispute',caseId);a.input('service-dispute','reason','需要继续核对到账情况');a.submit('service-dispute');
  assert.equal(state(a).commerce.aftersales.length,1);assert.equal(services(a).find(d=>d.request).feedback,'disputed');
  assert.deepEqual(a.errors,[]);
});
test('return and supplement forms retain rejected input while the customer can continue the original matter',()=>{
  const {s,caseId,aftersaleId}=acceptedState(),a=preview({local:memory({[KEY]:JSON.stringify(s)})});
  a.click('service-detail',caseId);a.click('service-return',aftersaleId);a.input('service-return','trackingNumber','');a.submit('service-return');
  assert.equal(a.one('#dialog-error').hidden,false);assert.ok(a.doc.querySelector('form[data-form="service-return"]'));
  a.input('service-return','trackingNumber','DEMO-RETURN-002');a.submit('service-return');assert.equal(services(a).find(d=>d.request).return.trackingNumber,'DEMO-RETURN-002');
  a.click('service-supplement',aftersaleId);a.input('service-supplement','body','新增寄回包装照片与说明');a.submit('service-supplement');
  assert.equal(state(a).commerce.aftersales.length,1);assert.match(JSON.stringify(services(a)),/新增寄回包装照片/);
});
test('commerce service drafts leave the default V4 record and draft cache byte unchanged',()=>{
  const v4=JSON.stringify(Seed.create()),oldDraft='{"draftScopes":{"customer:C001":{"KEEP":"V4"}}}',local=memory({[Store.KEY]:v4}),session=memory({'qinghe-support-view':oldDraft});
  const a=preview({local,session});sendApplication(a);
  assert.equal(local.getItem(Store.KEY),v4);assert.equal(session.getItem('qinghe-support-view'),oldDraft);assert.ok(session.getItem(VIEW));
});
test('handoff is visible to its target while the source keeps ownership until acceptance',()=>{
  let {s,id,caseId}=acceptedState();if(s.conversations.find(c=>c.id===id).state==='bot')s=D.execute(s,customer,'requestHuman',{id}).state;s=D.execute(s,agent,'claimConversation',{id}).state;
  const local=memory({[KEY]:JSON.stringify(s)}),session=memory({[VIEW]:JSON.stringify({deskFilter:'mine',deskConversation:id})});
  let a=preview({local,session,hash:'#desk/inbox'});a.click('service-handoff',caseId);a.input('service-handoff','reason','需客服02继续跟进仓库核实');a.submit('service-handoff');
  const handoff=state(a).commerce.handoffs.at(-1);assert.equal(handoff.targetId,'zhou');assert.equal(handoff.status,'pending');
  assert.equal(state(a).cases.find(c=>c.id===caseId).ownerId,'lin');
  a.click('close-modal');a.change('agent','zhou');assert.ok(a.doc.querySelector('.service-incoming-panel'));
  a.click('service-detail',caseId);assert.ok(a.doc.querySelector('.service-handoff-summary'));
  assert.equal(a.doc.querySelector('[data-action="service-refund"]'),null);a.click('service-accept',handoff.id);
  assert.equal(state(a).cases.find(c=>c.id===caseId).ownerId,'zhou');assert.equal(state(a).commerce.handoffs.at(-1).status,'accepted');
  assert.deepEqual(a.errors,[]);
});
test('the service ticket pool acquires matter responsibility and keeps conversation ownership separate',()=>{
  const a=preview(),d=sendApplication(a),caseId=d.caseId||d.id,ticketId=state(a).tickets.find(t=>t.caseId===caseId).id;a.click('workspace','desk');a.click('desk-page','tickets');
  a.click('claim-ticket',ticketId);const next=state(a);assert.equal(next.cases.find(c=>c.id===caseId).ownerId,'lin');
  assert.equal(next.tickets.find(t=>t.caseId===caseId).ownerId,'lin');assert.equal(next.conversations[0].ownerId,'');
  a.click('service-detail',caseId);assert.ok(a.doc.querySelector('.service-panel'));assert.deepEqual(a.errors,[]);
});
