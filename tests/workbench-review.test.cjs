// 产出 Agent：Codex。独立审查反例的事件级回归。
const test=require('node:test'),assert=require('node:assert/strict');
const {app,D,Seed,Store,Element,memory}=require('./helpers/app.cjs');
const customer={id:'C001',role:'customer'},agent={id:'lin',role:'agent'};
function sessionState(withAi=false){
 let state=Seed.create(Date.now(),false),clock=Date.now()-60000;
 const run=(who,type,data)=>{const out=D.execute(state,who,type,data,++clock);state=out.state;return out.value;};
 const id=run(customer,'newConversation',{});run(customer,'requestHuman',{id});run(agent,'claimConversation',{id});
 if(withAi){run(customer,'say',{id,body:'退货规则'});run(agent,'setAiAssist',{id,enabled:true});}
 return {state,id};
}
for(const readingHistory of [true,false])test(`AI received during a phone modal becomes visible on close and respects scroll position (readingHistory=${readingHistory})`,()=>{
 const {state,id}=sessionState(true),a=app({state,hash:'#mobile',controlledTimers:true});
 assert.equal(a.timers.count(1000),1);assert.equal(D.get(a.state(),'conversations',id).messages.some(m=>m.aiAssist),false);
 a.input('customer-say','body','保持手机未发送草稿');const oldMessages=a.one('#customer-messages');
 // Deterministic geometry exercises the render branch; real geometry remains a browser check.
 Object.defineProperties(oldMessages,{scrollHeight:{value:1000,configurable:true},clientHeight:{value:300,configurable:true}});
 oldMessages.scrollTop=readingHistory?120:700;
 const priorHeight=Object.getOwnPropertyDescriptor(Element.prototype,'scrollHeight');
 Object.defineProperty(Element.prototype,'scrollHeight',{get(){return 1200;},configurable:true});
 try{
  a.click('mobile-orders');a.timers.runNext(1000);
  const sent=D.get(a.state(),'conversations',id).messages.filter(m=>m.aiAssist);assert.equal(sent.length,1);
  assert.equal(a.one('#dialog').open,true);assert.equal(a.one('#customer-messages'),oldMessages);
  assert.ok(!oldMessages.textContent.includes(sent[0].body));
  a.click('close-modal');assert.equal(a.one('#dialog').open,false);assert.notEqual(a.one('#customer-messages'),oldMessages);
  assert.ok(a.one('#customer-messages').textContent.includes(sent[0].body));assert.equal(a.doc.querySelectorAll('.ai-assist-label').length,1);
  assert.equal(a.one('#customer-messages').scrollTop,readingHistory?120:1200);assert.equal(a.value('customer-say','body'),'保持手机未发送草稿');
  assert.ok(a.one('.phone-screen').children.filter(x=>!x.classList.contains('phone-overlay-host')).every(x=>!x.inert));
  a.timers.runNext(1000);assert.equal(D.get(a.state(),'conversations',id).messages.filter(m=>m.aiAssist).length,1);
  assert.equal(a.errors.length,0);
 }finally{if(priorHeight)Object.defineProperty(Element.prototype,'scrollHeight',priorHeight);else delete Element.prototype.scrollHeight;}
});

test('close history renders the saved node and callback snapshot after current plans and ownership change',()=>{
 let {state,id}=sessionState(),now=Date.now();const caseId=D.get(state,'conversations',id).caseIds[0],preview=D.closePreview(state,id,now),at=now+3600000;
 state=D.execute(state,agent,'closeWithSummary',{id,token:preview.token,reason:'客户离线',summary:'保存用于后续核查的接待小结',requestKey:'review-history',items:preview.items.map(i=>({caseId:i.caseId,nodeKey:i.nodeKey,action:'callback',reason:'关闭当时的安排说明',dueAt:now+7200000})),callbacks:[{caseId,purpose:'关闭时确认客户收到说明',at,note:'关闭时内部安排备注'}]},now).state;
 const ticket=state.tickets[0],snapshot=JSON.stringify(D.get(state,'conversations',id).closures);
 state=D.execute(state,agent,'saveCallback',{ticketId:ticket.id,purpose:'后续新增目的不属于历史',at:now+172800000,note:'后续新增备注不属于历史'},now+1).state;
 state=D.execute(state,{id:'manager',role:'manager'},'assignTicket',{id:ticket.id,ownerId:'zhou'},now+2).state;
 assert.equal(JSON.stringify(D.get(state,'conversations',id).closures),snapshot);
 const a=app({state,view:{workspace:'desk',deskFilter:'history',deskConversation:id},hash:'#desk/inbox'});a.click('close-history',id);
 const text=a.one('#dialog-body').textContent,original=JSON.parse(snapshot)[0];
 for(const value of ['保存用于后续核查的接待小结','当时的节点与后续安排','全部节点快照','当时的回访安排','关闭时确认客户收到说明','关闭时内部安排备注','关闭当时的安排说明','待处理',ticket.id,D.get(state,'staff','lin').name])assert.ok(text.includes(value),value);
 for(const value of ['后续新增目的不属于历史','后续新增备注不属于历史',D.get(state,'staff','zhou').name])assert.ok(!text.includes(value),value);
 const savedTime=new Date(original.callbacks[0].at+8*3600000).toISOString().slice(0,16).replace('T',' ');assert.ok(text.includes(savedTime+' UTC+08:00'));
 for(const node of original.sop[0])assert.ok(text.includes(node.title),node.title);
});

test('SOP reasons for the same node stay isolated by customer issue through cancel, reload and submit',()=>{
 let {state,id}=sessionState();state=D.execute(state,customer,'say',{id,body:'查询物流'}).state;const first=state.cases.find(c=>c.kind==='order'&&c.customerId==='C001').id;
 const other={id:'C002',role:'customer'};let out=D.execute(state,other,'newConversation');state=out.state;const secondConv=out.value;
 for(const [who,type,data] of [[other,'requestHuman',{id:secondConv}],[agent,'claimConversation',{id:secondConv}],[other,'say',{id:secondConv,body:'查询物流'}]])state=D.execute(state,who,type,data).state;
 const second=state.cases.find(c=>c.kind==='order'&&c.customerId==='C002').id;
 let a=app({state,view:{workspace:'desk',deskFilter:'mine',deskConversation:id},hash:'#desk/inbox'});
 function open(conv,caseId){a.click('select-conversation',conv);a.click('select-sop-case',caseId);const node=a.one('[data-sop-node="order"]');if(!node.classList.contains('expanded'))a.click('toggle-sop-node','order');a.click('sop-wait','order');assert.equal(a.one('form[data-form="sop-mark"]').dataset.id,caseId+':order');assert.equal(a.one('form[data-form="sop-mark"]').dataset.nodeKey,'order');}
 open(id,first);a.input('sop-mark','reason','客户一尚未提供订单');a.click('close-modal');
 open(secondConv,second);assert.equal(a.value('sop-mark','reason'),'');a.input('sop-mark','reason','客户二需要核实购买渠道');a.click('close-modal');
 a=a.reload();open(id,first);assert.equal(a.value('sop-mark','reason'),'客户一尚未提供订单');a.submit('sop-mark');
 assert.equal(D.get(a.state(),'cases',first).workflow.overrides.order.reason,'客户一尚未提供订单');assert.equal(D.get(a.state(),'cases',second).workflow?.overrides?.order,undefined);
 open(secondConv,second);assert.equal(a.value('sop-mark','reason'),'客户二需要核实购买渠道');a.submit('sop-mark');
 assert.equal(D.get(a.state(),'cases',second).workflow.overrides.order.reason,'客户二需要核实购买渠道');assert.equal(a.errors.length,0);
});


test('a failed pause save suppresses the next AI timer and stays suppressed after reload without claiming a persisted pause',()=>{
 const {state,id}=sessionState(true),raw=JSON.stringify(state),local=memory({[Store.KEY]:raw}),write=local.setItem;let failedWrites=0;
 local.setItem=(key,value)=>{if(key===Store.KEY && failedWrites===0){failedWrites++;throw Error('quota: first pause save fails');}write(key,value);};
 let a=app({local,view:{workspace:'desk',deskFilter:'mine',deskConversation:id},hash:'#desk/inbox',controlledTimers:true});
 a.input('reply','body','客服正在编辑，不能由 AI 抢发');
 assert.equal(failedWrites,1);assert.ok(a.one('#toast').textContent.includes('quota'));
 assert.equal(local.getItem(Store.KEY),raw);assert.equal(D.get(a.state(),'conversations',id).aiAssist.enabled,true);
 assert.equal(a.value('reply','body'),'客服正在编辑，不能由 AI 抢发');
 assert.ok(JSON.parse(a.session.getItem('qinghe-support-view')).aiInputSuppressed.includes(id));
 a.timers.runNext(1000);assert.equal(local.getItem(Store.KEY),raw);assert.equal(D.get(a.state(),'conversations',id).messages.some(m=>m.aiAssist),false);
 a=a.reload();assert.equal(a.value('reply','body'),'客服正在编辑，不能由 AI 抢发');a.timers.runNext(1000);
 assert.equal(local.getItem(Store.KEY),raw);assert.equal(D.get(a.state(),'conversations',id).messages.some(m=>m.aiAssist),false);
 // The UI must require a successful explicit authorization cycle to clear the local guard.
 a.click('ai-toggle',id);assert.equal(D.get(a.state(),'conversations',id).aiAssist.enabled,false);
 assert.ok(JSON.parse(a.session.getItem('qinghe-support-view')).aiInputSuppressed.includes(id));
 a.click('ai-toggle',id);assert.equal(D.get(a.state(),'conversations',id).aiAssist.enabled,true);
 assert.ok(!JSON.parse(a.session.getItem('qinghe-support-view')).aiInputSuppressed.includes(id));assert.equal(a.errors.length,0);
});
