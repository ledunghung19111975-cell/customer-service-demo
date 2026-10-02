const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../src/domain.js'),Seed=require('../src/seed.js'),Store=require('../src/store.js');
const NOW=Date.parse('2026-10-02T12:00:00Z');
const roles={c:{id:'C001',role:'customer'},c2:{id:'C002',role:'customer'},lin:{id:'lin',role:'agent'},zhou:{id:'zhou',role:'agent'},mgr:{id:'manager',role:'manager'},ops:{id:'operator',role:'operator'},admin:{id:'admin',role:'admin'}};
function rig(pop=false){let state=Seed.create(NOW,pop),clock=NOW;return {get s(){return state;},set s(v){state=v;},do(who,type,data={}){const r=D.execute(state,roles[who],type,data,++clock);state=r.state;return r.value;},conv(who='c'){return this.do(who,'newConversation');},case(id){return D.get(state,'cases',D.get(state,'conversations',id).caseIds.at(-1));}};}
function human(r,who='c'){const id=r.conv(who);r.do(who,'say',{id,body:'我要人工客服'});r.do('lin','claimConversation',{id});return id;}
function ticket(r){const id=r.conv();r.do('c','say',{id,body:'申请退货 SO20260926001'});const caseId=r.case(id).id;const data={caseId,title:'退货申请',description:'商品包装受损，请核对',confirmed:true,requestKey:'fixed-1'};const t=r.do('c','createTicket',data);return {id,caseId,ticketId:t.id,data};}
function edit(r,id='KB002',patch={}){const k=D.get(r.s,'knowledge',id);return r.do('ops','saveKnowledge',{id,...k.live,keywords:k.live.keywords.join(','),...patch});}
function memory(initial={}){const values=new Map(Object.entries(initial));return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};}

for (const closed of [false, true]) test(`new request after an agent result remains actionable (closed=${closed})`,()=>{
  const r=rig(),id=human(r),previous=r.case(id).id;
  r.do('lin','completeCase',{id:previous,conversationId:id,conclusion:'已说明保养方式',evidence:'核对说明书'});
  const result=structuredClone(D.get(r.s,'cases',previous).result);
  if(closed)r.do('lin','closeConversation',{id});
  r.do('c','say',{id,body:'另外，包装缺少配件，请核查'});
  if(closed)r.do('lin','claimConversation',{id});
  const next=r.case(id);
  assert.notEqual(next.id,previous);
  assert.equal(next.status,'open');
  assert.equal(next.humanTouched,true);
  assert.deepEqual(D.get(r.s,'cases',previous).result,result);
  assert.throws(()=>r.do('lin','closeConversation',{id}),/未完成/);
  r.do('lin','completeCase',{id:next.id,conversationId:id,conclusion:'已核实配件清单',evidence:'查阅包装清单'});
  r.do('lin','closeConversation',{id});
});

for(const answer of ['SO20260926001','申请退货 SO20260926001'])test(`collected order reuses original aftersales issue and ticket: ${answer}`,()=>{
  const r=rig(),first=ticket(r),createdAt=r.s.tickets[0].createdAt,id=r.conv();
  r.do('c','say',{id,body:'我要退货'});
  const pending=r.case(id).id;
  r.do('c','say',{id,body:answer});
  const conversation=D.get(r.s,'conversations',id);
  assert.deepEqual(conversation.caseIds,[first.caseId]);
  assert.equal(conversation.pendingCaseId,'');
  assert.ok(!r.s.cases.some(c=>c.id===pending));
  assert.ok(conversation.messages.every(m=>m.caseId!==pending));
  const again=r.do('c','createTicket',{...first.data,caseId:first.caseId,requestKey:'second-request'});
  assert.deepEqual(again,{id:first.ticketId,created:false});
  assert.equal(r.s.tickets.length,1);
  assert.equal(r.s.tickets[0].createdAt,createdAt);
  assert.ok(Store.valid(r.s));
});

test('seed and empty workspaces are valid',()=>{assert.ok(Store.valid(Seed.create(NOW)));assert.ok(Store.valid(Seed.create(NOW,false)));});
test('broken or foreign pending case references block loading without replacing saved data',()=>{
  const r=rig(),id=r.conv();r.do('c','say',{id,body:'查物流'});
  for(const pendingCaseId of ['MISSING',r.case(id).id]){
    const s=structuredClone(r.s),conv=D.get(s,'conversations',id);
    conv.pendingCaseId=pendingCaseId;
    if(pendingCaseId!=='MISSING')D.get(s,'cases',pendingCaseId).customerId='C002';
    const raw=JSON.stringify(s),mem=memory({[Store.KEY]:raw});
    assert.ok(Store.open(mem,()=>Seed.create(NOW)).blocked);
    assert.equal(mem.getItem(Store.KEY),raw);
  }
});
test('ticket command rejects a second active aftersales case for the same customer order',()=>{
  const r=rig(),first=ticket(r),duplicate=structuredClone(D.get(r.s,'cases',first.caseId));
  duplicate.id='SC-DUPLICATE';r.s.cases.push(duplicate);
  const before=JSON.stringify(r.s);
  assert.throws(()=>r.do('c','createTicket',{...first.data,caseId:duplicate.id,requestKey:'duplicate-key'}),/已有办理中的售后/);
  assert.equal(JSON.stringify(r.s),before);
});
for(const operation of ['completeCase','createTicket'])test(`order collection stops after agent ${operation}`,()=>{
  const r=rig(),id=r.conv();r.do('c','say',{id,body:'我要退货'});const issue=r.case(id).id;
  r.do('c','requestHuman',{id});r.do('lin','claimConversation',{id});
  if(operation==='completeCase')r.do('lin',operation,{id:issue,conversationId:id,conclusion:'核对后提供办理方式',evidence:'客户暂未提供订单'});
  else r.do('lin',operation,{caseId:issue,conversationId:id,title:'待核实订单售后',description:'需继续联系客户',confirmed:true});
  assert.equal(D.get(r.s,'conversations',id).pendingCaseId,'');
  r.do('c','closeConversation',{id});r.do('c','requestHuman',{id});r.do('c','cancelQueue',{id});
  r.do('c','say',{id,body:'SO20260926001'});
  assert.equal(D.get(r.s,'cases',issue).orderId,'');
  if(operation==='createTicket')assert.equal(r.s.tickets[0].orderId,'');
});
test('deterministic regression reports 12 real checks passing',()=>{const x=D.regression(Seed.create(NOW),NOW);assert.equal(x.rows.length,12);assert.ok(x.passed);});
test('FAQ completes a case without making a ticket or fabricating customer confirmation',()=>{const r=rig(),id=r.conv();r.do('c','say',{id,body:'保温杯怎么清洗？'});assert.equal(r.s.tickets.length,0);assert.equal(r.case(id).status,'completed');assert.equal(r.case(id).feedback,'pending');assert.equal(D.metrics(r.s).confirmed,0);});
test('customer explicitly confirms FAQ separately',()=>{const r=rig(),id=r.conv();r.do('c','say',{id,body:'保温杯怎么清洗？'});r.do('c','feedback',{id:r.case(id).id,confirmed:true});assert.equal(D.metrics(r.s).confirmed,1);assert.equal(D.metrics(r.s).botConfirmed,1);});
test('declining human handoff is not routed to a human',()=>{const r=rig(),id=r.conv();r.do('c','say',{id,body:'不要转人工，我只问退货规则'});assert.equal(r.s.conversations[0].state,'bot');assert.equal(r.s.conversations[0].runs[0].steps[0],'answer');});
test('explicit handoff has precedence over order lookup',()=>{const r=rig(),id=r.conv();r.do('c','say',{id,body:'我要人工，查物流 SO20260926001'});assert.equal(r.s.conversations[0].state,'queued');assert.deepEqual(r.s.conversations[0].runs[0].steps,['handoff']);});
test('keyword compounds are not mistaken for handoff intent',()=>{const r=rig();assert.equal(D.intentions('人工智能保温杯是什么？',r.s.flow.live).human,false);});
test('multiple requests create separate issues but no unconfirmed ticket',()=>{const r=rig(),id=r.conv();r.do('c','say',{id,body:'查物流 SO20260926001，再申请退货'});assert.deepEqual(r.s.cases.map(x=>x.kind).sort(),['aftersales','order']);assert.equal(r.s.tickets.length,0);});
test('requests for different orders require manual matching instead of binding both to the first',()=>{
  const r=rig(),id=r.conv();r.do('c','say',{id,body:'查物流 SO20260926001，再申请退货 SO20260926002'});
  assert.equal(D.get(r.s,'conversations',id).state,'queued');
  assert.ok(r.s.cases.every(c=>!c.orderId));
  assert.equal(r.s.tickets.length,0);
  assert.match(D.get(r.s,'conversations',id).handoffReason,/多个订单/);
});
test('order lookup can continue after a knowledge interruption',()=>{const r=rig(),id=r.conv();r.do('c','say',{id,body:'查物流'});const pending=r.case(id).id;r.do('c','say',{id,body:'保温杯怎么清洗？'});r.do('c','say',{id,body:'SO20260926001'});assert.equal(D.get(r.s,'cases',pending).status,'completed');assert.equal(r.s.cases.filter(c=>c.kind==='order').length,1);});
test('aftersales order collection continues after knowledge interruption',()=>{const r=rig(),id=r.conv();r.do('c','say',{id,body:'我要退货'});const pending=r.case(id).id;r.do('c','say',{id,body:'保温杯怎么清洗？'});r.do('c','say',{id,body:'SO20260926001'});assert.equal(D.get(r.s,'cases',pending).orderId,'SO20260926001');assert.ok(r.s.conversations[0].messages.at(-1).intake);});
test('other customer orders are denied, not exposed',()=>{const r=rig(),id=r.conv();r.do('c','say',{id,body:'查物流 SO20260926009'});assert.equal(r.s.conversations[0].state,'queued');assert.ok(!JSON.stringify(D.customerView(r.s,'C001')).includes('桌面收纳盒'));});
test('read-only test faults return orderFailure without business mutation',()=>{const r=rig(),before=JSON.stringify(r.s);assert.equal(D.classify(r.s,'查物流 SO20260926001','C001',NOW,r.s.flow.live,{orderFailure:true})[0].kind,'orderFailure');assert.equal(JSON.stringify(r.s),before);});
test('ambiguous competing knowledge escalates, not random selection',()=>{const r=rig();const k=D.copy(r.s.knowledge[0]);k.id='KB999';k.live.answer='相反的规则';r.s.knowledge.push(k);assert.equal(D.classify(r.s,'退货规则是什么？','C001',NOW)[0].kind,'conflict');});
test('expired knowledge cannot answer',()=>{const r=rig();r.s.knowledge[0].live.expiresAt=new Date(NOW-1).toISOString();assert.equal(D.retrieve(r.s,'退货规则是什么？',NOW),null);});
test('unpublished knowledge cannot answer',()=>{const r=rig();edit(r,'KB002',{question:'保温杯怎么清洗？',answer:'尚未发布的答案'});assert.notEqual(D.retrieve(r.s,'保温杯怎么清洗？',NOW).answer,'尚未发布的答案');});
test('no robot replies once human owns the conversation',()=>{const r=rig(),id=human(r);const n=r.s.conversations[0].messages.filter(m=>m.role==='bot').length;r.do('c','say',{id,body:'退货规则是什么？'});assert.equal(r.s.conversations[0].messages.filter(m=>m.role==='bot').length,n);});
test('queued messages remain available without robot interference',()=>{const r=rig(),id=r.conv();r.do('c','requestHuman',{id});const n=r.s.conversations[0].messages.length;r.do('c','say',{id,body:'补充：订单外盒破损'});assert.equal(r.s.conversations[0].messages.length,n+1);});
test('another agent cannot reply to an owned conversation',()=>{const r=rig(),id=human(r);const before=JSON.stringify(r.s);assert.throws(()=>r.do('zhou','reply',{id,body:'抢答'}),/领取/);assert.equal(JSON.stringify(r.s),before);});
test('duplicate conversation claim is denied',()=>{const r=rig(),id=human(r);assert.throws(()=>r.do('zhou','claimConversation',{id}),/可领取/);});
test('internal note does not count as first human response',()=>{const r=rig(),id=human(r);r.do('lin','note',{id,body:'PRIVATE-NOTE'});assert.equal(r.s.conversations[0].firstHumanAt,null);r.do('lin','reply',{id,body:'已为您核实'});assert.ok(r.s.conversations[0].firstHumanAt);});
test('public reply alone cannot complete a case',()=>{const r=rig(),id=human(r);r.do('lin','reply',{id,body:'已经说明清楚'});assert.equal(r.case(id).status,'open');assert.throws(()=>r.do('lin','closeConversation',{id}),/仍有未完成/);});
test('recorded human outcome requires both conclusion and private evidence',()=>{const r=rig(),id=human(r),cid=r.case(id).id;assert.throws(()=>r.do('lin','completeCase',{id:cid,conversationId:id,conclusion:'完成',evidence:''}),/核对依据/);r.do('lin','completeCase',{id:cid,conversationId:id,conclusion:'礼品卡规则已经为你说明',evidence:'SECRET-EVIDENCE'});assert.equal(r.case(id).feedback,'pending');assert.equal(D.metrics(r.s).confirmed,0);});
test('closing keeps historic ownership instead of losing My History',()=>{const r=rig(),id=human(r),cid=r.case(id).id;r.do('lin','completeCase',{id:cid,conversationId:id,conclusion:'说明已完成',evidence:'核对记录'});r.do('lin','closeConversation',{id});assert.equal(r.s.conversations[0].ownerId,'');assert.ok(D.deskView(r.s,roles.lin).conversations.some(c=>c.id===id));assert.ok(!D.deskView(r.s,roles.zhou).conversations.some(c=>c.id===id));});
test('new handoff cycle resets SLA first response and retains historic case',()=>{const r=rig(),id=human(r),cid=r.case(id).id;r.do('lin','completeCase',{id:cid,conversationId:id,conclusion:'说明已完成',evidence:'核对记录'});r.do('lin','closeConversation',{id});r.do('c','requestHuman',{id});assert.equal(r.s.conversations[0].firstHumanAt,null);assert.ok(r.s.conversations[0].caseIds.includes(cid));});
test('role command boundaries: agents cannot publish and operators cannot reply',()=>{const r=rig();assert.throws(()=>r.do('lin','publishKnowledge',{id:'KB001'}),/无权/);assert.throws(()=>r.do('ops','reply',{id:'x',body:'x'}),/无权/);assert.throws(()=>r.do('mgr','saveKnowledge',{}),/无权/);assert.throws(()=>r.do('admin','assignTicket',{}),/无权/);});
test('role impersonation mismatching staff record is denied',()=>{assert.throws(()=>D.execute(Seed.create(NOW),{id:'lin',role:'manager'},'serviceSettings',{}),/不匹配/);});
test('all customer write commands reject foreign records',()=>{const r=rig(),t=ticket(r);for(const [type,data] of [['say',{id:t.id,body:'x'}],['feedback',{id:t.caseId,confirmed:true}],['supplement',{id:t.ticketId,body:'x'}],['createTicket',{...t.data}]])assert.throws(()=>r.do('c2',type,data),/无权/);});
test('ticket creation requires explicit final confirmation',()=>{const r=rig(),id=r.conv();r.do('c','say',{id,body:'申请退货 SO20260926001'});assert.throws(()=>r.do('c','createTicket',{caseId:r.case(id).id,title:'退货',description:'申请退货'}),/确认/);assert.equal(r.s.tickets.length,0);});
test('customer cannot submit an unverified order',()=>{const r=rig(),id=r.conv();r.do('c','say',{id,body:'申请退货 SO20260926009'});assert.throws(()=>r.do('c','createTicket',{caseId:r.case(id).id,title:'退货',description:'申请退货',confirmed:true}),/归属/);});
test('ticket same request key is idempotent',()=>{const r=rig(),t=ticket(r);const second=r.do('c','createTicket',t.data);assert.equal(second.id,t.ticketId);assert.equal(second.created,false);assert.equal(r.s.tickets.length,1);});
test('same request key cannot be reused for different content',()=>{const r=rig(),t=ticket(r);assert.throws(()=>r.do('c','createTicket',{...t.data,title:'另一件事'}),/提交标识/);});
test('same issue keeps its active ticket even with a different request key',()=>{const r=rig(),t=ticket(r);assert.equal(r.do('c','createTicket',{...t.data,requestKey:'retry-other'}).id,t.ticketId);assert.equal(r.s.tickets.length,1);});
test('repeat aftersales request in a new conversation reuses the original issue',()=>{const r=rig(),t=ticket(r),id=r.conv();r.do('c','say',{id,body:'申请退货 SO20260926001'});assert.equal(r.case(id).id,t.caseId);assert.equal(r.s.tickets[0].id,t.ticketId);});
test('ticket claimant owns modifications; another agent is denied',()=>{const r=rig(),t=ticket(r);r.do('lin','claimTicket',{id:t.ticketId});assert.throws(()=>r.do('zhou','updateTicket',{id:t.ticketId,status:'working',publicText:'修改'}),/领取/);});
test('manager reassignment changes rights, not original receipt time',()=>{const r=rig(),t=ticket(r),time=r.s.tickets[0].createdAt;r.do('lin','claimTicket',{id:t.ticketId});r.do('mgr','assignTicket',{id:t.ticketId,ownerId:'zhou'});assert.equal(r.s.tickets[0].createdAt,time);assert.throws(()=>r.do('lin','updateTicket',{id:t.ticketId,status:'working',publicText:'过期操作'}),/领取/);r.do('zhou','updateTicket',{id:t.ticketId,status:'working',publicText:'继续核实'});});
test('conversation reassignment prevents former owner from replying',()=>{const r=rig(),id=human(r);r.do('mgr','assignConversation',{id,ownerId:'zhou'});assert.throws(()=>r.do('lin','reply',{id,body:'旧页回复'}),/领取/);r.do('zhou','reply',{id,body:'我来接续'});});
test('customer supplements a waiting ticket without creating a new one',()=>{const r=rig(),t=ticket(r);r.do('lin','claimTicket',{id:t.ticketId});r.do('lin','updateTicket',{id:t.ticketId,status:'waiting_customer',publicText:'请补充照片描述'});r.do('c','supplement',{id:t.ticketId,body:'商品本体没有损伤'});assert.equal(r.s.tickets[0].status,'working');assert.equal(r.s.tickets.length,1);});
test('ticket completion requires evidence and is not automatic customer confirmation',()=>{const r=rig(),t=ticket(r);r.do('lin','claimTicket',{id:t.ticketId});assert.throws(()=>r.do('lin','updateTicket',{id:t.ticketId,status:'done',publicText:'核实已完成'}),/核对依据/);r.do('lin','updateTicket',{id:t.ticketId,status:'done',publicText:'核实已完成',evidence:'PRIVATE-RESULT'});assert.equal(D.get(r.s,'cases',t.caseId).feedback,'pending');});
test('customer dispute reopens same ticket and preserves receipt time and outcome',()=>{const r=rig(),t=ticket(r),time=r.s.tickets[0].createdAt;r.do('lin','claimTicket',{id:t.ticketId});r.do('lin','updateTicket',{id:t.ticketId,status:'done',publicText:'核实已完成',evidence:'核对说明'});r.do('c','feedback',{id:t.caseId,confirmed:false,reason:'还有损坏未处理'});assert.equal(r.s.tickets[0].id,t.ticketId);assert.equal(r.s.tickets[0].createdAt,time);assert.equal(r.s.tickets[0].status,'working');assert.equal(D.metrics(r.s).completed,0);assert.ok(D.get(r.s,'cases',t.caseId).result);});
test('customer projection strips private notes, result evidence and unrelated data',()=>{const r=rig(),id=human(r),cid=r.case(id).id;r.do('lin','note',{id,body:'SECRET-NOTE'});r.do('lin','completeCase',{id:cid,conversationId:id,conclusion:'公开处理说明',evidence:'SECRET-EVIDENCE'});const data=JSON.stringify(D.customerView(r.s,'C001'));assert.ok(!data.includes('SECRET-'));assert.ok(!data.includes('yinuo@example.test'));assert.ok(data.includes('公开处理说明'));});
test('ticket history public projection strips internal fields',()=>{const r=rig(),t=ticket(r);r.do('lin','claimTicket',{id:t.ticketId});r.do('lin','updateTicket',{id:t.ticketId,status:'done',publicText:'PUBLIC',evidence:'SECRET-EVIDENCE',internalText:'SECRET-NOTE'});const data=JSON.stringify(D.customerView(r.s,'C001'));assert.ok(!data.includes('SECRET-'));assert.ok(data.includes('PUBLIC'));});
test('no bypassing an existing ticket via conversation completion',()=>{const r=rig(),t=ticket(r);r.do('c','requestHuman',{id:t.id});r.do('lin','claimConversation',{id:t.id});assert.throws(()=>r.do('lin','completeCase',{id:t.caseId,conversationId:t.id,conclusion:'绕过',evidence:'随意'}),/工单/);});
test('independent staff ticket does not fabricate a conversation',()=>{const r=rig();r.do('lin','createTicket',{customerId:'C002',title:'线下反馈',description:'需要后续核对',confirmed:true});assert.equal(r.s.conversations.length,0);assert.equal(r.s.tickets.length,1);});
test('capacity and offline availability prevent claims',()=>{const r=rig();r.do('mgr','serviceSettings',{capacity:1,responseMinutes:5,ticketHours:24,accepting:true});human(r);const id=r.conv('c2');r.do('c2','requestHuman',{id});assert.throws(()=>r.do('lin','claimConversation',{id}),/容量/);r.do('zhou','presence',{available:false});assert.throws(()=>r.do('zhou','claimConversation',{id}),/接待状态/);});
test('team data scope is enforced for commands and projections',()=>{const r=rig(),t=ticket(r);r.s.tickets[0].teamId='another-team';assert.throws(()=>r.do('mgr','assignTicket',{id:t.ticketId,ownerId:'lin'}),/授权/);assert.ok(!D.deskView(r.s,roles.lin).tickets.some(x=>x.id===t.ticketId));});
test('related tickets owned by a colleague are visible only as linked context',()=>{const r=rig(),t=ticket(r);r.do('zhou','claimTicket',{id:t.ticketId});r.do('c','requestHuman',{id:t.id});r.do('lin','claimConversation',{id:t.id});const d=D.deskView(r.s,roles.lin);assert.ok(!d.tickets.some(x=>x.id===t.ticketId));assert.ok(d.relatedTickets.some(x=>x.id===t.ticketId));assert.throws(()=>r.do('lin','updateTicket',{id:t.ticketId,status:'working',publicText:'修改'}));});
test('knowledge publication requires testing and preserves previous answer snapshot',()=>{const r=rig(),id=r.conv();r.do('c','say',{id,body:'保温杯怎么清洗？'});const old=r.s.conversations[0].messages.at(-1).citation;edit(r,'KB002',{answer:'用柔软湿布清洁，勿放微波炉。'});assert.throws(()=>r.do('ops','publishKnowledge',{id:'KB002'}),/重新测试/);assert.ok(r.do('ops','testKnowledge',{id:'KB002'}).passed);r.do('ops','publishKnowledge',{id:'KB002'});assert.equal(D.retrieve(r.s,'保温杯怎么清洗？',NOW).version,2);assert.deepEqual(r.s.conversations[0].messages.at(-1).citation,old);assert.equal(r.s.knowledge[1].versions.length,1);});
test('changing dependency invalidates an earlier publication test',()=>{const r=rig();edit(r);r.do('ops','testKnowledge',{id:'KB002'});r.do('ops','saveFlow',{humanWords:'人工,投诉',intakeEnabled:false});r.do('ops','testFlow');r.do('ops','publishFlow');assert.throws(()=>r.do('ops','publishKnowledge',{id:'KB002'}),/重新测试/);});
test('failed negative test blocks knowledge publication',()=>{const r=rig();edit(r,'KB002',{negative:'保温杯怎么清洗？',positive:'清洗保温杯'});assert.equal(r.do('ops','testKnowledge',{id:'KB002'}).passed,false);assert.throws(()=>r.do('ops','publishKnowledge',{id:'KB002'}));});
test('flow publication affects new conversations, not existing snapshots',()=>{const r=rig(),old=r.conv();r.do('ops','saveFlow',{humanWords:'人工,投诉',intakeEnabled:false});assert.ok(r.do('ops','testFlow').passed);r.do('ops','publishFlow');const newer=r.conv();assert.equal(D.get(r.s,'conversations',old).flow.intakeEnabled,true);assert.equal(D.get(r.s,'conversations',newer).flow.intakeEnabled,false);});
test('required explicit-human boundary cannot be disabled',()=>{const r=rig();assert.throws(()=>r.do('ops','saveFlow',{humanWords:'投诉',intakeEnabled:true}),/必须保留/);});
test('quality closure needs original query replay and published revised knowledge',()=>{const r=rig(),id=r.conv();r.do('c','say',{id,body:'礼品卡可以分多次使用吗？'});const g=r.s.gaps[0].id;r.do('mgr','reviewGap',{id:g,status:'confirmed',review:'缺少有效礼品卡规则',cause:'知识缺失'});const kb=r.do('ops','saveKnowledge',{title:'礼品卡规则',question:'礼品卡可以分多次使用吗？',keywords:'礼品卡,分多次,使用',answer:'可按卡面规则分次使用，余额可在会员页查看。',source:'已审核会员服务规则',positive:'礼品卡可以分多次使用吗？',negative:'我要查订单',effectiveAt:new Date(NOW-100000).toISOString()});r.do('ops','linkGap',{id:g,knowledgeId:kb});assert.throws(()=>r.do('mgr','acceptGap',{id:g,acceptance:'未发布先关闭'}),/尚未发布/);assert.ok(r.do('ops','testKnowledge',{id:kb}).passed);r.do('ops','publishKnowledge',{id:kb});r.do('mgr','acceptGap',{id:g,acceptance:'原问题及回归通过'});assert.equal(r.s.gaps[0].status,'closed');assert.ok(r.s.gaps[0].validation.rows.every(x=>x.pass));});
test('quality cannot link unreviewed gap or accept unrelated knowledge',()=>{const r=rig(),id=r.conv();r.do('c','say',{id,body:'礼品卡可以分多次使用吗？'});const g=r.s.gaps[0].id;assert.throws(()=>r.do('ops','linkGap',{id:g,knowledgeId:'KB001'}),/经理/);r.do('mgr','reviewGap',{id:g,status:'confirmed',review:'核对原问题',cause:'知识缺少'});r.do('ops','linkGap',{id:g,knowledgeId:'KB001'});assert.throws(()=>r.do('mgr','acceptGap',{id:g,acceptance:'随便验收'}),/原始问题/);});
test('read-only export does not mutate audit or revision',()=>{const r=rig();const before=JSON.stringify(r.s);assert.deepEqual(r.do('admin','export'),r.s);assert.equal(JSON.stringify(r.s),before);});
test('saved workspace roundtrip preserves business identities',()=>{const mem=memory(),s=Store.open(mem,()=>Seed.create(NOW,false));const id=s.dispatch(roles.c,'newConversation');const loaded=Store.open(mem,()=>Seed.create(NOW,false));assert.equal(loaded.state.conversations[0].id,id);assert.equal(loaded.blocked,'');});
test('storage failure leaves memory and saved data unchanged',()=>{const mem=memory(),s=Store.open(mem,()=>Seed.create(NOW,false)),before=JSON.stringify(s.state);mem.setItem=()=>{throw Error('quota exceeded');};assert.throws(()=>s.dispatch(roles.c,'newConversation'),/quota/);assert.equal(JSON.stringify(s.state),before);assert.equal(mem.getItem(Store.KEY),null);});
test('stale-tab writes fail instead of replacing another tab change',()=>{const mem=memory(),a=Store.open(mem,()=>Seed.create(NOW,false)),b=Store.open(mem,()=>Seed.create(NOW,false));a.dispatch(roles.c,'newConversation');assert.throws(()=>b.dispatch(roles.c,'newConversation'),/其他页面/);assert.equal(JSON.parse(mem.getItem(Store.KEY)).conversations.length,1);});
test('invalid JSON is preserved and no new seed overwrites it',()=>{const raw='{broken',mem=memory({[Store.KEY]:raw}),s=Store.open(mem,()=>Seed.create(NOW));assert.ok(s.blocked);assert.equal(mem.getItem(Store.KEY),raw);assert.throws(()=>s.dispatch(roles.c,'newConversation'));});
test('invalid relationships are rejected, not rendered with invented missing data',()=>{const seed=Seed.create(NOW),mem=memory();seed.tickets[0].caseId='MISSING';mem.setItem(Store.KEY,JSON.stringify(seed));assert.ok(Store.open(mem,()=>Seed.create(NOW)).blocked);});
test('old version storage is never overwritten or silently migrated',()=>{const key='zhixu-customer-demo-v3.1',mem=memory({[key]:'ORIGINAL-RAW'}),s=Store.open(mem,()=>Seed.create(NOW,false));s.dispatch(roles.c,'newConversation');assert.equal(mem.getItem(key),'ORIGINAL-RAW');});
test('storage permission failures become a blocked workspace',()=>{const s=Store.open({getItem(){throw Error('denied');}},()=>Seed.create(NOW));assert.ok(s.blocked.includes('denied'));assert.equal(s.state,null);});
