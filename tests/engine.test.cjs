// V3 业务规则测试：纯本地、无网络。原 V1 的 23 项测试结果与契约变化见 docs/评审与修改记录.md。
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../engine.js');
const fresh = () => {const state=C.newState({seed:false});return {state,s:C.newSession(state)};};
const items = (state,s) => C.sessionItems(state,s);
const send = (q) => {const x=fresh();C.sendVisitor(x.state,x.s.id,q);return x;};
const publish = st => {const r=C.evaluateFlow(st);assert.ok(r.passed,JSON.stringify(r.cases));return C.publishFlow(st);};
const kbValues = (more={}) => ({title:'礼品卡分次使用',standardQuestion:'礼品卡可以分多次使用吗？',keywords:'礼品卡,分次使用',answer:'虚构演示：礼品卡可按剩余余额分次使用，不提现。实际资格需人工核实。',category:'通用服务',scope:'青禾生活',owner:'客服运营',source:'虚构演示资料，不是实际商家政策',effectiveAt:'2026-01-01T00:00:00Z',expiresAt:'',...more});
const createKb = (st,more={}) => C.saveKnowledge(st,kbValues(more));
const intake = () => {const x=send('查物流 SO20260926001，再申请退货');x.item=items(x.state,x.s).find(i=>i.type==='aftersales');return x;};
const createT = x => C.createTicket(x.state,{sessionId:x.s.id,itemId:x.item.id,title:'退货需求核实',description:'外盒破损，请核实退货处理',category:'售后服务',priority:'普通',customerSubmitted:true,objectId:'SO20260926001'});
const complete = (st,t) => {C.advanceTicket(st,t.id,'处理中','客服小林');C.advanceTicket(st,t.id,'已完成','客服小林','演示处理方案已核实，请确认。',{evidence:'DEMO-RESULT-001：模拟核验记录',internalNote:'INTERNAL-ONLY-SECRET'});};

test('初始样例结构完整，事项计数与会话计数分开',()=>{const st=C.newState();assert.equal(st.schema,3);assert.equal(C.metrics(st).confirmed,2);assert.equal(C.metrics(st).pendingItems,3);assert.equal(C.metrics(st).total,5);});
test('空消息不写入会话或执行记录',()=>{const {state,s}=fresh(),b=JSON.stringify(state);assert.throws(()=>C.sendVisitor(state,s.id,'  '));assert.equal(JSON.stringify(state),b);});
test('空白或超长消息校验采用Unicode码点',()=>{const {state,s}=fresh();assert.throws(()=>C.sendVisitor(state,s.id,'字'.repeat(2001)));assert.doesNotThrow(()=>C.sendVisitor(state,s.id,'🙂'.repeat(2000)));});
test('A01 不要转人工不触发人工分支',()=>{const {state,s}=send('不要转人工，我只问退货规则');assert.equal(s.status,'bot');assert.equal(s.messages.at(-1).citation.id,'KB001');assert.equal(items(state,s)[0].type,'knowledge');});
test('A02 通用政策不强制索要订单号',()=>{const {s}=send('没有订单号，想了解退货条件');assert.equal(s.pendingOrder,false);assert.ok(s.messages.at(-1).citation);});
test('A03 退款诉求不能被订单号劫持为查询',()=>{const {state,s}=send('订单 SO20260926001 想退款，怎么处理');assert.equal(items(state,s)[0].type,'aftersales');assert.equal(s.messages.some(m=>m.order),false);assert.equal(C.canResolve(s,state),false);});
test('A04 订单查询和商品知识作为两件事响应',()=>{const {state,s}=send('查物流 SO20260926001，再告诉我保温杯怎么清洗');assert.deepEqual(items(state,s).map(i=>i.type),['order','knowledge']);assert.ok(s.messages.some(m=>m.order));assert.ok(s.messages.some(m=>m.citation));});
test('物流与售后申请同时保留，受理前没有工单',()=>{const {state,s,item}=intake();assert.equal(items(state,s).length,2);assert.equal(state.tickets.length,0);assert.equal(item.status,'processing');});
test('明确不想退款只回答咨询，不能创建申请',()=>{const {state,s}=send('我不想退款，只想了解退货规则');assert.equal(items(state,s).some(i=>i.type==='aftersales'),false);assert.equal(s.messages.at(-1).citation.id,'KB001');});
test('单纯进入页面不属于引擎创单行为',()=>{const st=C.newState({seed:false});assert.equal(st.sessions.length,0);assert.equal(st.items.length,0);});
test('查询缺订单号时先采集',()=>{const {state,s}=send('帮我查订单');assert.equal(s.pendingOrder,true);assert.equal(items(state,s)[0].status,'clarifying');assert.equal(s.messages.some(m=>m.order),false);});
test('插问不会清空原采集事项，补订单号仍回到原事项',()=>{const {state,s}=send('帮我查订单'),first=s.itemIds[0];C.sendVisitor(state,s.id,'保温杯怎么清洗？');assert.equal(s.pendingItemId,first);C.sendVisitor(state,s.id,'SO20260926001');assert.equal(C.getItem(state,first).objectId,'SO20260926001');assert.equal(C.getItem(state,first).status,'awaiting_confirmation');assert.equal(s.itemIds.length,2);});
test('跨轮采集结果经JSON还原仍可继续',()=>{const {state,s}=send('帮我查订单');const restored=C.clone(state);C.sendVisitor(restored,s.id,'SO20260926002');assert.equal(C.getSession(restored,s.id).messages.at(-1).order.status,'待发货');});
test('未知订单不伪造卡片，保留可复核线索',()=>{const {state,s}=send('查询订单 SO00000000000');assert.equal(s.messages.some(m=>m.order),false);assert.equal(state.issues[0].type,'订单未找到');assert.equal(items(state,s)[0].status,'clarifying');});
test('查询出错后直接更正订单号复用同一采集事项',()=>{const {state,s}=send('查询订单 SO00000000000'),id=s.itemIds[0];C.sendVisitor(state,s.id,'SO20260926001');assert.equal(s.itemIds.length,1);assert.equal(C.getItem(state,id).status,'awaiting_confirmation');});
test('未知知识合理拒答，不能计为已解决',()=>{const {state,s}=send('能给我不存在的神秘优惠吗？');assert.equal(s.status,'waiting');assert.equal(items(state,s)[0].status,'needs_human');assert.equal(C.metrics(state).confirmed,0);assert.equal(state.issues[0].status,'待复核');});
test('人工与等待期间只保留消息，机器人不抢答',()=>{const {state,s}=send('转人工');const n=s.messages.filter(m=>m.role==='bot').length;C.sendVisitor(state,s.id,'退货规则');C.takeover(state,s.id);C.sendVisitor(state,s.id,'保温杯怎么清洗');assert.equal(s.messages.filter(m=>m.role==='bot').length,n);C.sendAgent(state,s.id,'由我继续核实');assert.equal(s.messages.at(-1).role,'agent');});
test('未接管不能回复，另一坐席不能代当前坐席回复',()=>{const {state,s}=send('转人工');assert.throws(()=>C.sendAgent(state,s.id,'抢答'),/接管权/);C.takeover(state,s.id);state.operator='客服小周';assert.throws(()=>C.sendAgent(state,s.id,'抢答'),/接管权/);});
test('A08 满载拒绝接管；叠加查询超时仍保留信息与留单出口',()=>{
  const {state,s}=fresh();C.setRuntime(state,{humanMode:'busy'},'模拟满载');C.sendVisitor(state,s.id,'转人工');
  assert.equal(s.status,'waiting');assert.match(s.messages.at(-1).text,/满载/);assert.throws(()=>C.takeover(state,s.id),/容量已满/);
  state.draft.queryMode='timeout';publish(state);const next=C.newSession(state);C.sendVisitor(state,next.id,'查询订单 SO20260926001');
  assert.equal(next.status,'waiting');assert.equal(next.messages.some(m=>m.order),false);assert.match(next.messages.at(-1).text,/满载/);
  const item=items(state,next)[0];assert.equal(item.objectId,'SO20260926001');assert.equal(item.status,'needs_human');
  const ticket=C.createTicket(state,{sessionId:next.id,itemId:item.id,title:'订单查询待核实',description:'工具超时，请人工核实',category:'订单物流',priority:'普通',customerSubmitted:true});
  assert.equal(ticket.status,'待分配');assert.equal(C.metrics(state).confirmed,0);
});
test('真实本地占用达到容量后不能继续接管',()=>{const {state,s}=send('转人工');C.setRuntime(state,{capacity:1},'缩小容量');C.takeover(state,s.id);const s2=C.newSession(state);C.sendVisitor(state,s2.id,'转人工');assert.throws(()=>C.takeover(state,s2.id),/容量已满/);});
test('A07 旧会话转人工读取实时离线而非流程快照',()=>{const {state,s}=fresh();C.setRuntime(state,{humanMode:'offline'},'下线');C.sendVisitor(state,s.id,'转人工');assert.equal(s.status,'offline');assert.throws(()=>C.takeover(state,s.id),/离线/);C.setRuntime(state,{humanMode:'online'},'恢复');C.takeover(state,s.id);assert.equal(s.status,'human');});
test('接管后离线释放处理权，旧坐席不能继续发送',()=>{const {state,s}=send('转人工');C.takeover(state,s.id);C.setRuntime(state,{humanMode:'offline'},'中断');assert.equal(s.owner,'');assert.equal(s.status,'offline');assert.throws(()=>C.sendAgent(state,s.id,'旧回复'));});
test('重复接管只会成功一次',()=>{const {state,s}=send('转人工');C.takeover(state,s.id);assert.throws(()=>C.takeover(state,s.id),/待接管/);});
test('取消排队不取消人工事项，也不清除人工介入历史',()=>{const {state,s}=send('转人工'),id=s.itemIds[0];C.resumeBot(state,s.id);assert.equal(s.status,'bot');assert.equal(s.hadHandoff,true);assert.equal(C.getItem(state,id).status,'needs_human');});
test('未完成事项不能因结束聊天被解决',()=>{const {state,s,item}=intake();C.finish(state,s.id,'visitor');assert.equal(s.status,'ended');assert.equal(item.status,'processing');assert.equal(C.metrics(state).confirmed,0);});
test('分项确认仅改变当前事项，办理仍未解决',()=>{const {state,s,item}=intake();const order=items(state,s).find(i=>i.type==='order');C.confirmItem(state,order.id);assert.equal(order.status,'resolved');assert.equal(item.status,'processing');assert.equal(s.status,'bot');assert.equal(C.metrics(state).confirmed,1);});
test('A05 未完成工单阻止该事项确认，整体确认不能越过待办',()=>{const x=intake();const t=createT(x);assert.equal(t.status,'待分配');assert.throws(()=>C.confirmItem(x.state,x.item.id),/尚不能/);assert.throws(()=>C.finish(x.state,x.s.id,'customer'),/尚不能/);});
test('没有结果依据不显示可确认状态',()=>{const {state,s}=send('订单 SO00000000000');assert.equal(C.canConfirmItem(state,items(state,s)[0]),false);assert.equal(C.canResolve(s),false);});
test('已结束咨询拒绝普通消息，不会隐式重开',()=>{const {state,s}=fresh();C.finish(state,s.id,'visitor');assert.throws(()=>C.sendVisitor(state,s.id,'继续问'),/已结束/);});
test('跨会话关联保留原事项与首次受理时间',()=>{const {state,s}=send('帮我查订单'),i=items(state,s)[0],time=i.created;C.finish(state,s.id,'visitor');const next=C.newSession(state,'林小夏',{itemId:i.id});assert.equal(next.itemIds[0],i.id);assert.equal(i.created,time);assert.equal(i.sessionIds.length,2);});
test('跨客户关联的本地负例被拒绝，非真实安全验收',()=>{const {state,s}=send('帮我查订单');assert.throws(()=>C.newSession(state,'其他客户',{itemId:s.itemIds[0],customerId:'OTHER'}),/无法关联/);});
test('售后申请未确认前仅是预览，不自动建单',()=>{const x=intake();assert.equal(x.state.tickets.length,0);assert.equal(x.item.tickets.length,0);assert.ok(x.s.messages.some(m=>m.intake));});
test('工单必须归属明确事项，多事项不默认合并',()=>{const {state,s}=intake();assert.throws(()=>C.createTicket(state,{sessionId:s.id,title:'统一处理',description:'多件事',category:'其他问题',priority:'普通'}),/多个未完成事项/);});
test('重复受理按事项拦截，不靠同名标题',()=>{const x=intake();createT(x);assert.throws(()=>C.createTicket(x.state,{sessionId:x.s.id,itemId:x.item.id,title:'换一个标题',description:'同一售后',category:'售后服务',priority:'普通'}),/已有未完成工单/);assert.equal(x.state.tickets.length,1);});
test('无效标题或工单归属失败不创建业务对象',()=>{const x=intake(),snapshot=JSON.stringify(x.state);assert.throws(()=>C.createTicket(x.state,{sessionId:x.s.id,itemId:x.item.id,title:' ',description:'x',category:'售后服务',priority:'普通'}));assert.equal(JSON.stringify(x.state),snapshot);});
test('工单必须指定负责人，不能从待分配直接完成',()=>{const x=intake(),t=createT(x);assert.throws(()=>C.advanceTicket(x.state,t.id,'已完成','客服小林','完成',{evidence:'e'}),/不支持/);assert.throws(()=>C.advanceTicket(x.state,t.id,'处理中',''),/负责人/);});
test('完成必须有结果证据，不能只点击完成按钮',()=>{const x=intake(),t=createT(x);C.advanceTicket(x.state,t.id,'处理中','客服小林');assert.throws(()=>C.advanceTicket(x.state,t.id,'已完成','客服小林','已处理'),/结果证据/);assert.equal(t.status,'处理中');});
test('工单完成后事项待确认，只有客户确认才解决',()=>{const x=intake(),t=createT(x);complete(x.state,t);assert.equal(x.item.status,'awaiting_confirmation');assert.equal(t.status,'已完成');C.confirmItem(x.state,x.item.id);assert.equal(x.item.status,'resolved');assert.equal(C.metrics(x.state).unassistedConfirmed,0);});
test('内部备注和内部证据不写入客户消息',()=>{const x=intake(),t=createT(x);complete(x.state,t);const messages=JSON.stringify(x.s.messages);assert.doesNotMatch(messages,/INTERNAL-ONLY-SECRET|DEMO-RESULT-001/);assert.match(JSON.stringify(t.history),/INTERNAL-ONLY-SECRET/);});
test('A09 结束咨询后仍可补工单，聊天保持结束',()=>{const x=intake(),t=createT(x);C.advanceTicket(x.state,t.id,'处理中','客服小林');C.advanceTicket(x.state,t.id,'待客户补充','客服小林','请说明外盒情况');C.finish(x.state,x.s.id,'visitor');C.addTicketReply(x.state,t.id,'外盒有破损，商品未使用');assert.equal(t.status,'处理中');assert.equal(x.s.status,'ended');});
test('原负责人离线，客户补充后回到待分配并保留材料',()=>{const x=intake(),t=createT(x);C.advanceTicket(x.state,t.id,'处理中','客服小林');C.advanceTicket(x.state,t.id,'待客户补充','客服小林','请补充');C.setRuntime(x.state,{humanMode:'offline'},'离线');C.addTicketReply(x.state,t.id,'补充内容');assert.equal(t.status,'待分配');assert.equal(t.owner,'');assert.match(t.history.at(-1).text,/补充内容/);});
test('重复补充不能重复推进工单状态',()=>{const x=intake(),t=createT(x);C.advanceTicket(x.state,t.id,'处理中','客服小林');C.advanceTicket(x.state,t.id,'待客户补充','客服小林','补充');C.addTicketReply(x.state,t.id,'已补充');assert.throws(()=>C.addTicketReply(x.state,t.id,'再提交'),/不需要/);});
test('撤销工单不会自动撤销或解决原服务需求',()=>{const x=intake(),t=createT(x);C.advanceTicket(x.state,t.id,'已撤销','','重复受理记录');assert.equal(x.item.status,'needs_human');assert.equal(C.metrics(x.state).confirmed,0);});
test('A11 未解决异议立即重开事项，工单标异议待核',()=>{const x=intake(),t=createT(x);complete(x.state,t);C.confirmItem(x.state,x.item.id);const time=x.item.created;C.disputeTicket(x.state,t.id,'问题仍在');assert.equal(t.status,'已完成');assert.equal(t.disputed,true);assert.equal(x.item.status,'needs_human');assert.equal(x.item.created,time);assert.equal(C.metrics(x.state).confirmed,0);});
test('异议成立重开原工单不增加工单或受理量',()=>{const x=intake(),t=createT(x);complete(x.state,t);C.disputeTicket(x.state,t.id,'仍未解决');C.reviewDispute(x.state,t.id,'reopen','继续核实','DEMO-REVIEW');assert.equal(t.status,'处理中');assert.equal(x.state.tickets.length,1);assert.equal(t.disputed,false);});
test('异议不成立恢复原解决时间，不增加一次解决',()=>{const x=intake(),t=createT(x);complete(x.state,t);C.confirmItem(x.state,x.item.id);const original=x.item.resolvedAt;C.disputeTicket(x.state,t.id,'误以为未完成');C.reviewDispute(x.state,t.id,'dismiss','核实已完成','DEMO-REVIEW');assert.equal(x.item.status,'resolved');assert.equal(x.item.resolvedAt,original);assert.equal(C.metrics(x.state).confirmed,1);});
test('草稿、停用、未来和过期知识不参与正式检索',()=>{const {state}=fresh();assert.equal(C.findKnowledge('会员积分',state.knowledge),null);assert.equal(C.findKnowledge('周年庆活动',state.knowledge),null);const k=createKb(state),q='礼品卡可以分多次使用吗？';k.status='published';assert.equal(C.findKnowledge(q,state.knowledge).item.id,k.id);k.effectiveAt='2099-01-01';assert.equal(C.findKnowledge(q,state.knowledge),null);k.effectiveAt='2000-01-01';k.expiresAt='2001-01-01';assert.equal(C.findKnowledge(q,state.knowledge),null);});
test('适用范围不匹配的知识不进入答案',()=>{const {state}=fresh();const k=createKb(state,{scope:'另一商家'}),q='礼品卡可以分多次使用吗？';k.status='published';assert.equal(C.findKnowledge(q,state.knowledge),null);assert.equal(C.findKnowledge(q,state.knowledge,{scope:'另一商家'}).item.id,k.id);});
test('同等匹配且答案冲突时拒绝选第一条答案',()=>{const {state,s}=fresh();const a=createKb(state);a.status='published';const b=createKb(state,{title:'礼品卡另一规则',standardQuestion:'礼品卡支持什么',answer:'完全不同的政策'});b.status='published';C.sendVisitor(state,s.id,'礼品卡分次使用');assert.equal(s.status,'waiting');assert.equal(state.issues[0].type,'知识冲突');assert.equal(s.messages.some(m=>m.citation),false);});
test('编辑知识仅保存草稿，不改变历史答案或现行内容',()=>{const {state,s}=send('退货规则');const old=s.messages.at(-1).citation.answer,k=state.knowledge[0];C.saveKnowledge(state,{...k,answer:'更改后的虚构政策'});assert.equal(k.answer,old);assert.equal(k.draft.answer,'更改后的虚构政策');assert.equal(s.messages.at(-1).citation.answer,old);});
test('知识无变化保存不增版本',()=>{const {state}=fresh(),k=state.knowledge[0];C.saveKnowledge(state,{...k});assert.equal(k.version,2);assert.equal(k.draft,undefined);});
test('知识必需来源、维护人和有效时效',()=>{const {state}=fresh();assert.throws(()=>createKb(state,{source:''}),/来源/);assert.throws(()=>createKb(state,{expiresAt:'2020-01-01'}),/失效时间/);assert.equal(state.knowledge.length,5);});
test('知识必须回归后发布，发布后前台命中',()=>{const {state,s}=fresh(),k=createKb(state);assert.throws(()=>C.publishKnowledge(state,k.id),/回归/);assert.equal(C.evaluateKnowledge(state,k.id).passed,true);C.publishKnowledge(state,k.id);C.sendVisitor(state,s.id,'礼品卡可以分多次使用吗？');assert.equal(s.messages.at(-1).citation.id,k.id);});
test('知识测试后修改答案导致发布依据失效',()=>{const {state}=fresh(),k=createKb(state);C.evaluateKnowledge(state,k.id);C.saveKnowledge(state,{...k,answer:'修改内容'});assert.throws(()=>C.publishKnowledge(state,k.id),/重新测试/);});
test('重复标准问题与重叠时效不能直接发布',()=>{const {state}=fresh();const k=createKb(state,{standardQuestion:'七天无理由退货有什么条件？',keywords:'退货'});assert.throws(()=>C.evaluateKnowledge(state,k.id),/重叠/);});
test('A06 紧急停用对旧会话下一问立即生效，历史原文保留',()=>{const {state,s}=send('退货规则'),first=s.messages.at(-1);C.disableKnowledge(state,'KB001','条款待核');C.sendVisitor(state,s.id,'退货规则');assert.equal(s.status,'waiting');assert.match(C.citationStatus(state,first.citation),/停用/);assert.ok(first.citation.answer);});
test('已撤销依据不能继续确认此前的知识事项',()=>{const {state,s}=send('退货规则'),i=items(state,s)[0];C.disableKnowledge(state,'KB001','条款待核');assert.equal(C.canConfirmItem(state,i),false);assert.throws(()=>C.confirmItem(state,i.id));});
test('流程草稿不影响已发布会话，草稿试验不产生服务数据',()=>{const {state,s}=fresh();state.draft.queryMode='timeout';const sizes=[state.sessions.length,state.items.length,state.tickets.length,state.issues.length];const result=C.simulate('订单 SO20260926001',{},state.draft,state.knowledge);assert.equal(result.status,'waiting');assert.deepEqual([state.sessions.length,state.items.length,state.tickets.length,state.issues.length],sizes);C.sendVisitor(state,s.id,'订单 SO20260926001');assert.ok(s.messages.at(-1).order);});
test('发布必须有当前草稿完整回归，单条simulate不算',()=>{const {state}=fresh();state.draft.queryMode='timeout';C.simulate('订单 SO20260926001',{},state.draft,state.knowledge);assert.throws(()=>C.publishFlow(state),/完整回归/);});
test('A13 回归后改流程参数，旧依据失效',()=>{const {state}=fresh();state.draft.queryMode='timeout';C.evaluateFlow(state);state.draft.prefix='不同';assert.throws(()=>C.publishFlow(state),/重新运行/);});
test('发布后新会话绑定新流程，旧会话仍保留旧流程',()=>{const {state,s}=fresh();state.draft.queryMode='timeout';assert.equal(publish(state),2);const next=C.newSession(state);C.sendVisitor(state,s.id,'订单 SO20260926001');C.sendVisitor(state,next.id,'订单 SO20260926001');assert.ok(s.messages.at(-1).order);assert.equal(next.status,'waiting');assert.equal(next.flow.version,2);});
test('售后受理配置关闭后新会话不开放自助申请',()=>{const {state}=fresh();state.draft.intakeEnabled=false;publish(state);const s=C.newSession(state);C.sendVisitor(state,s.id,'我要申请退货 SO20260926001');assert.equal(s.status,'waiting');assert.equal(s.messages.some(m=>m.intake),false);});
test('流程回滚生成新版本并保留历史，不覆盖旧记录',()=>{const {state}=fresh();state.draft.queryMode='timeout';publish(state);C.prepareRollback(state,1);assert.equal(state.published.version,2);assert.equal(publish(state),3);assert.equal(state.published.queryMode,'success');assert.deepEqual(state.releases.map(r=>r.version),[1,2,3]);assert.match(state.releases[2].reason,/回滚/);});
test('无变化禁止重复发布，无效配置不会写半次消息',()=>{const {state,s}=fresh();assert.throws(()=>C.publishFlow(state),/没有修改/);s.flow.queue='';const old=JSON.stringify(state);assert.throws(()=>C.sendVisitor(state,s.id,'退货规则'),/服务组/);assert.equal(JSON.stringify(state),old);});
test('紧急停用工具即时阻断旧流程，不伪造成功结果',()=>{const {state,s}=fresh();C.setRuntime(state,{toolEnabled:false},'故障');C.sendVisitor(state,s.id,'订单 SO20260926001');assert.equal(s.messages.some(m=>m.order),false);assert.equal(state.issues[0].type,'工具已停用');});
test('本地归属负例不暴露订单存在性',()=>{const {state}=fresh();const s=C.newSession(state,'其他演示客户',{customerId:'OTHER'});C.sendVisitor(state,s.id,'订单 SO20260926001');assert.equal(s.messages.some(m=>m.order),false);assert.doesNotMatch(s.messages.at(-1).text,/运输中|原木|收件人/);});
test('确认质量问题必须填写根因和责任人',()=>{const {state}=send('礼品卡可以分多次使用吗？'),q=state.issues[0];assert.throws(()=>C.reviewIssue(state,q.id,{status:'已确认',review:'知识缺口'}),/责任人/);assert.equal(q.status,'待复核');});
test('A10 无整改措施及验证不能关闭质量问题',()=>{const {state}=send('礼品卡可以分多次使用吗？'),q=state.issues[0];C.reviewIssue(state,q.id,{status:'已确认',review:'业务确认该问题应可回答',owner:'知识运营',cause:'知识缺失'});assert.throws(()=>C.closeRemediation(state,q.id,'直接关闭'),/验证记录/);});
test('知识整改：线索→分派→草稿→回归→发布→原问题验证→验收',()=>{const {state}=send('礼品卡可以分多次使用吗？'),q=state.issues[0];C.reviewIssue(state,q.id,{status:'已确认',review:'应覆盖高频规则',owner:'知识运营',cause:'知识缺口，不是合理拒答违规'});const k=createKb(state,{issueId:q.id});assert.equal(q.remediation.knowledgeId,k.id);assert.throws(()=>C.verifyRemediation(state,q.id),/发布/);assert.ok(C.evaluateKnowledge(state,k.id).passed);C.publishKnowledge(state,k.id);const r=C.verifyRemediation(state,q.id);assert.ok(r.passed);C.closeRemediation(state,q.id,'原问题命中，边界回归通过，仅限演示');assert.equal(q.remediation.status,'已关闭');assert.ok(q.remediation.validation.id);});
test('验证后知识停用，整改验收依据失效',()=>{const {state}=send('礼品卡可以分多次使用吗？'),q=state.issues[0];C.reviewIssue(state,q.id,{status:'已确认',review:'缺口',owner:'运营',cause:'知识缺口'});const k=createKb(state,{issueId:q.id});C.evaluateKnowledge(state,k.id);C.publishKnowledge(state,k.id);C.verifyRemediation(state,q.id);C.disableKnowledge(state,k.id,'待核');assert.throws(()=>C.closeRemediation(state,q.id,'关闭'),/重新验证/);});
test('本地发布回归完整执行且不创建业务事项',()=>{const {state}=fresh(),count=state.items.length,r=C.evaluateFlow(state);assert.equal(r.cases.filter(c=>/^R\d+$/.test(c.id)).length,10);assert.equal(r.cases.filter(c=>/^S\d+$/.test(c.id)).length,6);assert.equal(r.passed,true);assert.equal(state.items.length,count);});
test('无结果依据、无反馈保持待确认，不冒充生产解决率',()=>{const {state}=send('退货规则'),m=C.metrics(state);assert.equal(m.confirmed,0);assert.equal(m.awaiting,1);assert.equal('resolutionRate' in m,false);});
test('转接摘要包含独立事项、工单与原始信息',()=>{const x=intake(),t=createT(x);const summary=C.sessionSummary(x.s,x.state);assert.match(summary,/SO20260926001/);assert.match(summary,new RegExp(x.item.id));assert.match(summary,new RegExp(t.id));assert.ok(C.length(summary)<=1800);});

test('二轮复审：不要机器人、请转人工不能误判为拒绝人工',()=>{const {s}=send('不要机器人，请转人工');assert.equal(s.status,'waiting');});
test('二轮复审：转人工接续现有售后事项，不虚增第三个需求',()=>{const x=intake();C.sendVisitor(x.state,x.s.id,'转人工');assert.equal(x.s.itemIds.length,2);assert.equal(x.item.title,'申请售后处理');assert.equal(x.item.status,'needs_human');});
test('二轮复审：相同提交标识的精确重放返回原工单',()=>{const x=intake(),payload={sessionId:x.s.id,itemId:x.item.id,title:'售后核实',description:'外盒破损',objectId:'SO20260926001',category:'售后服务',priority:'普通',customerSubmitted:true,requestKey:'REPLAY-001'};const t=C.createTicket(x.state,payload);assert.equal(C.createTicket(x.state,payload).id,t.id);assert.equal(x.state.tickets.length,1);assert.throws(()=>C.createTicket(x.state,{...payload,description:'不同内容'}),/提交标识冲突/);});
test('二轮复审：受理确认时更正订单线索，事项与工单必须一致',()=>{const x=intake();const t=C.createTicket(x.state,{sessionId:x.s.id,itemId:x.item.id,title:'售后核实',description:'更正订单',objectId:'SO20260926002',category:'售后服务',priority:'普通'});assert.equal(x.item.objectId,t.objectId);assert.equal(x.item.objectId,'SO20260926002');assert.ok(x.item.history.some(h=>h.fromObject==='SO20260926001'));});
test('二轮复审：UI与发布门槛使用相同的测试有效性检查',()=>{const {state}=fresh();state.draft.queryMode='timeout';const r=C.evaluateFlow(state);assert.equal(C.evaluationCurrent(state,r),true);state.draft.prefix='更改';assert.equal(C.evaluationCurrent(state,r),false);});

test('人工完成知识咨询工单后，客户可以确认并对结果提出异议',()=>{
  const {state,s}=send('礼品卡可以分多次使用吗？'),item=items(state,s)[0];
  const t=C.createTicket(state,{sessionId:s.id,itemId:item.id,title:'礼品卡规则核实',description:'人工核实使用规则',category:'知识咨询',priority:'普通'});
  complete(state,t);
  assert.equal(C.canConfirmItem(state,item),true);
  C.confirmItem(state,item.id);
  C.disputeTicket(state,t.id,'规则仍需核实');
  assert.equal(C.canConfirmItem(state,item),false);
  C.reviewDispute(state,t.id,'reopen','重新核实','DEMO-REOPEN');
  C.advanceTicket(state,t.id,'已撤销','客服小林','转交其他渠道核实');
  assert.equal(C.canConfirmItem(state,item),false);
});

test('关闭自助售后拦截客户提交和改分类绕过，保留客服受理',()=>{
  const {state}=fresh();state.draft.intakeEnabled=false;publish(state);
  const s=C.newSession(state);C.sendVisitor(state,s.id,'我要申请退货 SO20260926001');
  const item=items(state,s)[0],payload={sessionId:s.id,itemId:item.id,title:'退货核实',description:'外盒破损',objectId:item.objectId,category:'售后服务',priority:'普通',customerSubmitted:true};
  const before=JSON.stringify(state);
  assert.throws(()=>C.createTicket(state,payload),/自助售后/);
  assert.throws(()=>C.createTicket(state,{...payload,category:'其他问题'}),/自助售后/);
  assert.equal(JSON.stringify(state),before);
  assert.ok(C.createTicket(state,{...payload,customerSubmitted:false}).id);
});

test('关闭自助售后不影响其他问题留单和旧会话的已发布配置',()=>{
  const {state,s:old}=fresh();state.draft.intakeEnabled=false;publish(state);
  const s=C.newSession(state);C.sendVisitor(state,s.id,'礼品卡可以分多次使用吗？');
  const item=items(state,s)[0],payload={sessionId:s.id,itemId:item.id,title:'礼品卡规则核实',description:'请客服核实',priority:'普通',customerSubmitted:true};
  assert.throws(()=>C.createTicket(state,{...payload,category:'售后服务',objectId:'SO20260926001'}),/自助售后/);
  assert.ok(C.createTicket(state,{...payload,category:'知识咨询'}).id);
  C.sendVisitor(state,old.id,'我要申请退货 SO20260926001');
  assert.ok(createT({state,s:old,item:items(state,old)[0]}).id);
});

function twoCompletedTickets() {
  const x=intake(),first=createT(x);complete(x.state,first);
  const second=C.createTicket(x.state,{sessionId:x.s.id,itemId:x.item.id,title:'补充处理',description:'客服核实后继续办理',category:'售后服务',priority:'普通'});
  complete(x.state,second);C.confirmItem(x.state,x.item.id);
  return {...x,first,second};
}

test('同事项两张历史工单异议均不成立时，恢复原确认时间',()=>{
  const x=twoCompletedTickets(),resolvedAt=x.item.resolvedAt;
  C.needHelp(x.state,x.item.id,'仍需帮助');
  C.reviewDispute(x.state,x.first.id,'dismiss','原结果有效','DEMO-REVIEW-1');
  assert.equal(x.item.status,'needs_human');
  C.reviewDispute(x.state,x.second.id,'dismiss','原结果有效','DEMO-REVIEW-2');
  assert.equal(x.item.status,'resolved');assert.equal(x.item.resolvedAt,resolvedAt);
  C.needHelp(x.state,x.item.id,'再次核实');
  C.reviewDispute(x.state,x.second.id,'dismiss','再次核实有效','DEMO-REVIEW-3');
  C.reviewDispute(x.state,x.first.id,'dismiss','再次核实有效','DEMO-REVIEW-4');
  assert.equal(x.item.status,'resolved');assert.equal(x.item.resolvedAt,resolvedAt);
});

test('同事项任一工单异议成立后，剩余异议驳回不能代替客户再次确认',()=>{
  const x=twoCompletedTickets();C.needHelp(x.state,x.item.id,'仍需帮助');
  C.reviewDispute(x.state,x.first.id,'reopen','重新办理','DEMO-REOPEN');
  C.advanceTicket(x.state,x.first.id,'已完成','客服小林','已重新核实，请再次确认',{evidence:'DEMO-RESULT-002'});
  C.reviewDispute(x.state,x.second.id,'dismiss','该记录仍有效','DEMO-REVIEW');
  assert.equal(x.item.status,'awaiting_confirmation');assert.equal(x.item.resolvedAt,null);
  assert.equal(C.canConfirmItem(x.state,x.item),true);C.confirmItem(x.state,x.item.id);
  assert.equal(x.item.status,'resolved');
});

test('异议成立的工单撤销后，其他异议驳回仍保留未解决事项',()=>{
  const x=twoCompletedTickets();C.needHelp(x.state,x.item.id,'仍需帮助');
  C.reviewDispute(x.state,x.first.id,'reopen','重新核实','DEMO-REOPEN');
  C.advanceTicket(x.state,x.first.id,'已撤销','','交由其他渠道核实');
  C.reviewDispute(x.state,x.second.id,'dismiss','该记录仍有效','DEMO-REVIEW');
  assert.equal(x.item.status,'needs_human');assert.equal(x.item.resolvedAt,null);
  assert.equal(C.canConfirmItem(x.state,x.item),false);
});

test('重新完成的工单再次收到异议，最后复核该工单仍可等待客户确认',()=>{
  const x=twoCompletedTickets();C.needHelp(x.state,x.item.id,'仍需帮助');
  C.reviewDispute(x.state,x.first.id,'reopen','重新办理','DEMO-REOPEN');
  C.advanceTicket(x.state,x.first.id,'已完成','客服小林','已重新处理',{evidence:'DEMO-NEW-RESULT'});
  C.disputeTicket(x.state,x.first.id,'仍有疑问');
  C.reviewDispute(x.state,x.second.id,'dismiss','该记录有效','DEMO-REVIEW-2');
  C.reviewDispute(x.state,x.first.id,'dismiss','新结果有效','DEMO-REVIEW-1');
  assert.equal(x.item.status,'awaiting_confirmation');assert.equal(x.item.resolvedAt,null);
  assert.equal(C.canConfirmItem(x.state,x.item),true);
});

// 三轮复审（2026-09-28）：路由与知识治理的 5 项 P1，复现输入见 00_工作台/交接记录/2026-09-27-T138客服Demo代码审查.md。
const cites = s => s.messages.filter(m=>m.citation).map(m=>m.citation.id);

test('三轮复审：否定转人工的常见说法不进入人工队列',()=>{
  for (const q of ['不想转人工，我只问退货规则','不转人工，帮我看下退货规则','人工就不用了，我问下退货规则','我不想投诉，只想了解退货规则']) {
    const {s}=send(q);assert.equal(s.status,'bot',q);assert.deepEqual(cites(s),['KB001'],q);
  }
  for (const q of ['我要转人工','转人工不需要排队吧']) {const {state,s}=send(q);assert.equal(s.status,'waiting',q);assert.deepEqual(items(state,s).map(i=>i.type),['other'],q);}
});

test('三轮复审：人工智能、人工费等构词不是转人工诉求',()=>{
  for (const q of ['你们是人工智能吗','人工费怎么算']) assert.deepEqual(C.planRequests(q,{},C.defaults).map(p=>p.type),['knowledge'],q);
  const {state,s}=fresh(),k=createKb(state,{title:'机器人身份说明',standardQuestion:'你们是人工智能吗？',keywords:'人工智能,机器人',answer:'虚构演示：这里是规则机器人，需要时可以转人工。'});k.status='published';
  C.sendVisitor(state,s.id,'你们是人工智能吗？');assert.equal(s.status,'bot');assert.deepEqual(cites(s),[k.id]);
});

test('三轮复审：只命中一个泛关键词不作答，转为未命中线索',()=>{
  for (const q of ['退款多久到账','保温杯可以放洗碗机吗']) {
    const {state,s}=send(q);assert.deepEqual(cites(s),[],q);assert.equal(state.issues[0].type,'知识未命中',q);assert.equal(items(state,s)[0].status,'needs_human',q);
  }
  assert.deepEqual(cites(send('保温杯平时怎么保养').s),['KB002']);
});

test('三轮复审：售后政策类新 FAQ 可回归、可发布、可命中',()=>{
  const {state,s}=fresh(),k=createKb(state,{title:'退货运费说明',standardQuestion:'退货运费谁承担？',keywords:'运费,退货运费',answer:'虚构演示：质量问题由商家承担退货运费，其余情况由买家承担。',category:'售后政策'});
  const r=C.evaluateKnowledge(state,k.id);assert.ok(r.passed,JSON.stringify(r.cases.filter(c=>!c.pass)));C.publishKnowledge(state,k.id);
  C.sendVisitor(state,s.id,'退货运费谁出');assert.deepEqual(cites(s),[k.id]);
});

test('三轮复审：多事项里的商品咨询按原句检索，不套用固定商品',()=>{
  const {state,s}=send('查物流 SO20260926001，再问下收纳袋怎么清洗');
  assert.ok(s.messages.some(m=>m.order));assert.deepEqual(cites(s),[]);assert.ok(items(state,s).some(i=>i.type==='knowledge'&&i.status==='needs_human'));
});

test('三轮复审：新 FAQ 抢答存量问句时草稿回归不通过，不能发布',()=>{
  const {state}=fresh(),k=createKb(state,{title:'退货须知（新）',standardQuestion:'七天无理由退货规则条件',keywords:'退货,规则,七天,无理由,条件',answer:'【错误示例】所有商品一律不支持退货。',category:'售后政策'});
  const r=C.evaluateKnowledge(state,k.id);assert.equal(r.passed,false);
  assert.ok(r.cases.some(c=>!c.pass&&/KB001/.test(c.expected)),JSON.stringify(r.cases.map(c=>[c.id,c.pass,c.expected])));
  assert.throws(()=>C.publishKnowledge(state,k.id),/回归/);
});

test('三轮复审：流程改动让存量 FAQ 失效时发布回归不通过',()=>{
  const {state}=fresh();state.draft.humanWords='人工,投诉,客服专员,几点';
  const r=C.evaluateFlow(state);assert.equal(r.passed,false);assert.ok(r.cases.some(c=>!c.pass&&/KB003/.test(c.expected)));
  assert.throws(()=>C.publishFlow(state),/完整回归/);
});

test('三轮复审：补订单号的自然说法回填原查询事项',()=>{
  for (const q of ['我的订单号是SO20260926001','SO20260926001 麻烦查一下','查物流 SO20260926001']) {
    const {state,s}=send('帮我查一下订单'),first=s.itemIds[0];C.sendVisitor(state,s.id,q);
    assert.deepEqual(s.itemIds,[first],q);assert.equal(C.getItem(state,first).status,'awaiting_confirmation',q);assert.equal(C.getItem(state,first).objectId,'SO20260926001',q);assert.equal(s.pendingItemId,'',q);
  }
});

test('三轮复审：待补订单号的售后事项接收订单号，不另建事项',()=>{
  for (const q of ['我的订单号是SO20260926001','我要申请退货 SO20260926001']) {
    const {state,s}=send('我要申请退货'),first=s.itemIds[0];C.sendVisitor(state,s.id,q);
    assert.deepEqual(s.itemIds,[first],q);const item=C.getItem(state,first);assert.equal(item.type,'aftersales',q);assert.equal(item.status,'processing',q);assert.equal(item.objectId,'SO20260926001',q);assert.ok(s.messages.at(-1).intake,q);
  }
  const {state,s}=send('我要申请退货');C.sendVisitor(state,s.id,'查物流 SO20260926001');
  assert.deepEqual(items(state,s).map(i=>[i.type,i.status]),[['aftersales','clarifying'],['order','awaiting_confirmation']]);
});

test('三轮复审：质问或反问要人工仍然转人工，只有明确拒绝才不转',()=>{
  for (const q of ['为什么不转人工','怎么还不给我转人工','不给我转人工吗？','要不要转人工','是不是要转人工才行']) {const {state,s}=send(q);assert.equal(s.status,'waiting',q);assert.deepEqual(items(state,s).map(i=>i.type),['other'],q);}
});
