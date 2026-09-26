// 产出 Agent：Codex。验证服务状态与发布边界，不调用网络。
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../engine.js');
const fresh = () => { const state = C.newState(); return {state,session:C.newSession(state)}; };

test('知识回复保存来源快照，后续编辑不会改写历史依据',()=>{
  const {state,session}=fresh();
  C.sendVisitor(state,session.id,'七天无理由退货有什么条件？');
  const answer=session.messages.at(-1), before=answer.citation.answer;
  assert.equal(answer.citation.id,'KB001');
  C.saveKnowledge(state,{id:'KB001',title:'新规则',keywords:'退货',answer:'新的规则说明'});
  assert.equal(answer.citation.answer,before);
  assert.equal(state.knowledge.find(k=>k.id==='KB001').status,'published');
  assert.equal(state.knowledge.find(k=>k.id==='KB001').draft.answer,'新的规则说明');
  assert.equal(C.findKnowledge('退货',state.knowledge).item.answer,before);
});
test('草稿与停用知识不参与检索，发布的新增条目可命中',()=>{
  const {state}=fresh();
  const k=C.saveKnowledge(state,{title:'发票指引',keywords:'发票,开票',answer:'在订单页登记抬头。'});
  assert.equal(C.findKnowledge('怎么开票',state.knowledge),null);
  assert.equal(C.findKnowledge('会员积分',state.knowledge),null);
  k.status='published';
  assert.equal(C.findKnowledge('怎么开票',state.knowledge).item.id,k.id);
  k.status='disabled';
  assert.equal(C.findKnowledge('怎么开票',state.knowledge),null);
});
test('订单信息采集跨轮保持，缺参不会假装成功查询',()=>{
  const {state,session}=fresh();
  C.sendVisitor(state,session.id,'帮我查订单');
  assert.equal(session.pendingOrder,true);
  assert.equal(session.messages.some(m=>m.order),false);
  C.sendVisitor(state,session.id,'SO20260926001');
  assert.equal(session.pendingOrder,false);
  assert.equal(session.messages.at(-1).order.id,'SO20260926001');
});
test('未知订单不返回卡片，并记录可复核证据',()=>{
  const {state,session}=fresh();
  C.sendVisitor(state,session.id,'查询订单 SO00000000000');
  assert.equal(session.messages.some(m=>m.order),false);
  assert.match(session.messages.at(-1).text,/没有找到/);
  assert.equal(state.issues[0].sessionId,session.id);
  assert.equal(state.issues[0].type,'订单未找到');
});
test('修改草稿和草稿测试不改变发布版本或创建业务记录',()=>{
  const {state,session}=fresh(), initial=JSON.stringify(state.published);
  state.draft.queryMode='timeout';
  const sizes=[state.sessions.length,state.tickets.length,state.issues.length];
  const result=C.simulate('订单 SO20260926001',{},state.draft,state.knowledge);
  assert.equal(result.status,'waiting');
  assert.deepEqual([state.sessions.length,state.tickets.length,state.issues.length],sizes);
  assert.equal(JSON.stringify(state.published),initial);
  C.sendVisitor(state,session.id,'订单 SO20260926001');
  assert.equal(session.messages.at(-1).order.id,'SO20260926001');
});
test('发布只影响新会话，旧会话保持已绑定版本',()=>{
  const {state,session}=fresh();
  state.draft.queryMode='timeout';
  assert.equal(C.publishFlow(state),2);
  const next=C.newSession(state);
  C.sendVisitor(state,session.id,'订单 SO20260926001');
  C.sendVisitor(state,next.id,'订单 SO20260926001');
  assert.equal(session.flow.version,1);
  assert.ok(session.messages.at(-1).order);
  assert.equal(next.flow.version,2);
  assert.equal(next.status,'waiting');
});
test('人工离线明确提示工单，坐席可以主动接管留言',()=>{
  const {state}=fresh(); state.draft.humanOnline=false; state.draft.queryMode='timeout'; C.publishFlow(state);
  const s=C.newSession(state); C.sendVisitor(state,s.id,'订单 SO20260926001');
  assert.equal(s.status,'offline'); assert.match(s.messages.at(-1).text,/提交问题/);
  C.takeover(state,s.id); assert.equal(s.status,'human'); assert.equal(s.hadHandoff,true);
});
test('显式转人工绕过关键词；等待和接管期间机器人不抢答',()=>{
  const {state}=fresh(); state.draft.humanWords='坐席专员'; C.publishFlow(state);
  const s=C.newSession(state); C.sendVisitor(state,s.id,'需要人工',{forceHandoff:true});
  assert.equal(s.status,'waiting');
  assert.equal(s.runs.at(-1).trace.find(t=>t.node==='router').detail,'客户主动请求人工服务');
  let bots=s.messages.filter(m=>m.role==='bot').length;
  C.sendVisitor(state,s.id,'七天退货');
  assert.equal(s.messages.filter(m=>m.role==='bot').length,bots);
  C.takeover(state,s.id); C.sendAgent(state,s.id,'你好，我来处理。');
  assert.equal(s.messages.at(-1).role,'agent');
  C.sendVisitor(state,s.id,'再补充一条说明');
  assert.equal(s.messages.filter(m=>m.role==='bot').length,bots);
});
test('状态禁止越级：未接管不能回复，已结束不能再发送',()=>{
  const {state,session}=fresh();
  assert.throws(()=>C.sendAgent(state,session.id,'直接回复'),/接管/);
  assert.throws(()=>C.finish(state,session.id,'customer'),/尚不能/);
  C.sendVisitor(state,session.id,'退货规则'); C.finish(state,session.id,'customer');
  assert.throws(()=>C.sendVisitor(state,session.id,'继续问'),/已结束/);
  assert.throws(()=>C.finish(state,session.id,'customer'),/已经结束/);
});
test('转人工后不计入 AI 独立解决',()=>{
  const {state,session}=fresh(); const count=C.metrics(state).aiResolved;
  C.sendVisitor(state,session.id,'转人工'); C.takeover(state,session.id); C.finish(state,session.id,'agent');
  assert.equal(C.metrics(state).aiResolved,count);
});
test('工单关联一致、重复提交可识别，必须分配后才能推进',()=>{
  const {state,session}=fresh();
  const data={title:'核对包裹',description:'请核对物流异常',category:'订单物流',priority:'普通',sessionId:session.id};
  const t=C.createTicket(state,data);
  assert.ok(session.tickets.includes(t.id));
  assert.throws(()=>C.createTicket(state,data),/同名/);
  assert.throws(()=>C.advanceTicket(state,t.id,'已完成','客服小林'),/不支持/);
  assert.throws(()=>C.advanceTicket(state,t.id,'处理中',''),/负责人/);
  C.advanceTicket(state,t.id,'处理中','客服小林'); C.advanceTicket(state,t.id,'待客户补充','客服小林','请补充外盒照片'); C.advanceTicket(state,t.id,'处理中','客服小林'); C.advanceTicket(state,t.id,'已完成','客服小林','已核实配送正常并告知客户');
  assert.equal(t.history.length,5);
  assert.throws(()=>C.advanceTicket(state,t.id,'处理中','客服小林'),/不支持/);
});
test('必要输入校验失败不改变有效配置或业务对象',()=>{
  const {state}=fresh(); const version=state.published.version, count=state.knowledge.length;
  state.draft.orderWords=' , '; assert.throws(()=>C.publishFlow(state),/不能为空/); assert.equal(state.published.version,version);
  assert.throws(()=>C.saveKnowledge(state,{title:' ',keywords:'x',answer:'a'}),/请填写/); assert.equal(state.knowledge.length,count);
  assert.throws(()=>C.createTicket(state,{title:'',description:'x'}),/请填写/);
});
test('浏览器 JSON 持久化格式可恢复会话与业务链路',()=>{
  const {state,session}=fresh(); C.sendVisitor(state,session.id,'订单');
  const restored=JSON.parse(JSON.stringify(state));
  C.sendVisitor(restored,session.id,'SO20260926002');
  const s=C.getSession(restored,session.id);
  assert.equal(s.messages.at(-1).order.status,'待发货');
  assert.ok(restored.sessions.every(s=>s.tickets.every(id=>restored.tickets.some(t=>t.id===id))));
});

test('转接摘要保留订单与答案，并将恢复前的失败标为历史异常',()=>{
  const {state,session}=fresh();
  C.sendVisitor(state,session.id,'查询订单 SO00000000000');
  C.sendVisitor(state,session.id,'查询订单 SO20260926001');
  C.sendVisitor(state,session.id,'我需要人工客服协助。',{forceHandoff:true});
  const summary=C.sessionSummary(session);
  assert.match(summary,/订单线索：SO00000000000、SO20260926001/);
  assert.match(summary,/已有答复：[\s\S]*运输中/);
  assert.match(summary,/最近业务处理：订单查询 · 返回本地样例 SO20260926001/);
  assert.match(summary,/历史异常：样例数据中没有 SO00000000000/);
  assert.match(summary,/当前状态：等待接管/);
});
test('合法长消息的工单预填摘要有边界且可以直接提交',()=>{
  const {state,session}=fresh();
  C.sendVisitor(state,session.id,'需'.repeat(2000));
  C.sendVisitor(state,session.id,'补'.repeat(2000));
  const description=C.sessionSummary(session);
  assert.ok(description.length<=2000);
  assert.match(description,/节选/);
  assert.doesNotThrow(()=>C.createTicket(state,{sessionId:session.id,title:'核对问题',description,category:'其他问题',priority:'普通'}));
});

test('知识无变化保存不增版本、不下线；编辑草稿只在发布时生效',()=>{
  const {state}=fresh(), k=state.knowledge.find(k=>k.id==='KB001');
  const original=C.clone(k);
  C.saveKnowledge(state,{...k});
  assert.equal(k.version,original.version);assert.equal(k.draft,undefined);assert.equal(k.status,'published');
  C.saveKnowledge(state,{...k,answer:'新的退货指引'});
  assert.equal(k.answer,original.answer);assert.equal(k.draft.version,original.version+1);
  C.saveKnowledge(state,{...k,answer:'新的退货指引，补充说明'});
  assert.equal(k.draft.version,original.version+1);
  C.publishKnowledge(state,k.id);
  assert.equal(k.version,original.version+1);assert.equal(k.answer,'新的退货指引，补充说明');assert.equal(k.draft,undefined);
  assert.throws(()=>C.publishKnowledge(state,k.id),/没有待发布/);
});
test('流程无差异禁止重复发布；无效草稿不得运行测试',()=>{
  const {state}=fresh();
  assert.equal(C.flowChanged(state),false);assert.throws(()=>C.publishFlow(state),/没有修改/);
  state.draft.queue='';
  assert.throws(()=>C.simulate('退货',{},state.draft,state.knowledge),/服务组/);
  assert.equal(state.published.version,1);
});
test('待接管和人工期间补充消息可更新会话预览',()=>{
  const {state,session}=fresh();C.sendVisitor(state,session.id,'转人工');
  C.sendVisitor(state,session.id,'加急凭证 XYZ123');assert.equal(session.summary,'加急凭证 XYZ123');
  C.takeover(state,session.id);C.sendVisitor(state,session.id,'已经补充照片');assert.equal(session.summary,'已经补充照片');
});
test('取消人工请求恢复咨询，不抹掉曾转人工记录',()=>{
  const {state,session}=fresh();C.sendVisitor(state,session.id,'人工');
  C.resumeBot(state,session.id);assert.equal(session.status,'bot');assert.equal(session.hadHandoff,true);
  C.sendVisitor(state,session.id,'退货规则');C.finish(state,session.id,'customer');
  assert.equal(C.metrics(state).aiResolved,2);
});
test('未知订单不能确认已解决，明确答案才可确认',()=>{
  const {state,session}=fresh();C.sendVisitor(state,session.id,'订单 SO000');
  assert.equal(C.canResolve(session),false);assert.throws(()=>C.finish(state,session.id,'customer'),/尚不能/);
  C.sendVisitor(state,session.id,'订单 SO20260926001');assert.equal(C.canResolve(session),true);
});
test('访客可结束等待或离线咨询，保留工单且不计AI解决',()=>{
  const {state,session}=fresh();C.sendVisitor(state,session.id,'人工');
  const ticket=C.createTicket(state,{sessionId:session.id,title:'请跟进',description:'核对售后问题',category:'售后服务',priority:'普通'});
  C.finish(state,session.id,'visitor');assert.equal(session.status,'ended');assert.equal(ticket.status,'待分配');assert.equal(C.metrics(state).aiResolved,2);
  state.draft.humanOnline=false;C.publishFlow(state);const offline=C.newSession(state);C.sendVisitor(state,offline.id,'人工');C.finish(state,offline.id,'visitor');assert.equal(offline.status,'ended');
});
test('工单完成或等待补充必须有说明，结果可从会话查看',()=>{
  const {state,session}=fresh();const ticket=C.createTicket(state,{sessionId:session.id,title:'配送问题',description:'请核对配送',category:'订单物流',priority:'普通'});
  C.advanceTicket(state,ticket.id,'处理中','客服小林');
  assert.throws(()=>C.advanceTicket(state,ticket.id,'已完成','客服小林'),/处理结果/);assert.equal(ticket.status,'处理中');
  C.advanceTicket(state,ticket.id,'已完成','客服小林','已联系配送员，客户已收到包裹');
  assert.equal(session.messages.at(-1).ticketId,ticket.id);assert.match(session.messages.at(-1).text,/已收到包裹/);
});

test('咨询结束后仍可通过工单补充信息，自动恢复处理且防止重复提交',()=>{
  const {state,session}=fresh();C.sendVisitor(state,session.id,'转人工');
  const t=C.createTicket(state,{sessionId:session.id,title:'跟进问题',description:'核实信息',category:'其他问题',priority:'普通'});
  C.finish(state,session.id,'visitor');C.advanceTicket(state,t.id,'处理中','客服小林');C.advanceTicket(state,t.id,'待客户补充','客服小林','请补充收货信息');
  C.addTicketReply(state,t.id,'收货信息已确认');assert.equal(t.status,'处理中');assert.equal(session.status,'ended');
  assert.match(session.messages.at(-1).text,/收货信息已确认/);assert.throws(()=>C.addTicketReply(state,t.id,'再次提交'),/不需要/);
});
