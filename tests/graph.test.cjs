const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../engine.js');
const G = C.Graph;
const fresh = () => C.newState({ seed: false });
const run = (s, q, context = {}) => C.simulate(q, context, s.draft, s.knowledge);
function urgentBranch(s, target = 'human') {
  const g = s.draft.graph, n = G.addNode(g, 'condition', { x: 400, y: 200 });
  G.connect(g, 'router', 'order', n.id);
  G.connect(g, n.id, 'yes', target); G.connect(g, n.id, 'no', 'order');
  return n;
}
function publish(s) { assert.equal(C.evaluateFlow(s).passed, true); return C.publishFlow(s); }

test('默认流程结构完整，默认行为通过原有服务回归', () => {
  const s = fresh(); assert.deepEqual(G.check(s.draft.graph), []); assert.equal(C.evaluateFlow(s).passed, true);
});
test('条件与连线决定实际路径，同类问题得到不同结果', () => {
  const s = fresh(), n = urgentBranch(s);
  const urgent = run(s, '加急查询订单 SO20260926001'), normal = run(s, '查询订单 SO20260926001');
  assert.equal(urgent.status, 'waiting'); assert.equal(urgent.messages.some(m => m.order), false);
  assert.ok(normal.messages.some(m => m.order));
  assert.equal(urgent.trace.find(t => t.node === n.id).port, 'yes');
  assert.equal(normal.trace.find(t => t.node === n.id).port, 'no');
  assert.equal(urgent.trace.some(t => t.node === 'order'), false);
});
test('重接同一端口替换旧连线，立即改变运行结果', () => {
  const s = fresh(), n = urgentBranch(s); G.connect(s.draft.graph, n.id, 'yes', 'order');
  assert.ok(run(s, '加急查询订单 SO20260926001').messages.some(m => m.order));
  assert.equal(s.draft.graph.edges.filter(e => e.source === n.id && e.port === 'yes').length, 1);
});
test('同类型节点的参数独立，超时节点不会改动正常节点', () => {
  const s = fresh(), g = s.draft.graph, copy = G.addNode(g, 'order'); copy.config.queryMode = 'timeout';
  G.connect(g, copy.id, 'success', 'reply'); G.connect(g, copy.id, 'failure', 'human'); G.connect(g, copy.id, 'missing', 'reply');
  urgentBranch(s, copy.id);
  assert.equal(run(s, '加急查询订单 SO20260926001').status, 'waiting');
  assert.ok(run(s, '查询订单 SO20260926001').messages.some(m => m.order));
  assert.equal(g.nodes.find(n => n.id === 'order').config.queryMode, undefined);
});
test('自定义回复按实际路径输出，不伪造订单或解决证据', () => {
  const s = fresh(), g = s.draft.graph, reply = G.addNode(g, 'reply'); reply.config.text = '已收到加急咨询';
  G.connect(g, reply.id, 'next', 'end'); urgentBranch(s, reply.id);
  const result = run(s, '加急查询订单 SO20260926001');
  assert.equal(result.messages[0].text, '已收到加急咨询'); assert.equal(result.tasks[0].evidence.length, 0);
  assert.notEqual(result.tasks[0].status, 'awaiting_confirmation');
});
test('即使完成了查询，绕过结果回复也不会生成可确认的证据', () => {
  const s = fresh(), g = s.draft.graph, n = G.addNode(g, 'reply'); n.config.text = '暂不展示查询结果';
  G.connect(g, 'order', 'success', n.id); G.connect(g, n.id, 'next', 'end');
  const result = run(s, '查询订单 SO20260926001');
  assert.equal(result.messages.some(m => m.order), false); assert.equal(result.tasks[0].evidence.length, 0);
});
test('上游结果可以作为条件输入，不存在的结果按空值判断', () => {
  const s = fresh(), g = s.draft.graph, n = G.addNode(g, 'condition');
  n.config = { field: 'orderStatus', operator: 'equals', value: '运输中' };
  G.connect(g, 'order', 'success', n.id); G.connect(g, n.id, 'yes', 'human'); G.connect(g, n.id, 'no', 'reply');
  assert.equal(run(s, '查询订单 SO20260926001').status, 'waiting');
  assert.ok(run(s, '查询订单 SO20260926002').messages.some(m => m.order));
});
test('缺少任一输出连接时禁止运行，真实服务状态保持原样', () => {
  const s = fresh(); urgentBranch(s); s.published = C.clone(s.draft); const session = C.newSession(s);
  session.flow.graph.edges = session.flow.graph.edges.filter(e => e.source !== 'order' || e.port !== 'failure');
  const before = JSON.stringify(s); assert.throws(() => C.sendVisitor(s, session.id, '查询订单'), /尚未连接/); assert.equal(JSON.stringify(s), before);
});
test('自连、回连、连接开始节点均被拦截，旧连线不丢失', () => {
  const g = G.template(), before = JSON.stringify(g);
  assert.throws(() => G.connect(g, 'router', 'order', 'router'), /自身/);
  assert.throws(() => G.connect(g, 'reply', 'next', 'router'), /循环/);
  assert.throws(() => G.connect(g, 'reply', 'next', 'start'), /开始/);
  assert.equal(JSON.stringify(g), before);
});
test('导入形状中的环路、重复端口与悬空连线不能绕过运行校验', () => {
  const s = fresh(), g = s.draft.graph;
  g.edges.push({ id: 'bad', source: 'reply', port: 'next', target: 'router' });
  assert.ok(G.check(g).some(e => /循环/.test(e.message)));
  assert.ok(G.check(g).some(e => /只能连接一个/.test(e.message)));
  g.edges.push({ id: 'orphan', source: 'absent', port: 'next', target: 'end' });
  assert.throws(() => run(s, '你好'));
});
test('删除节点同步移除相关线，并暴露新断点', () => {
  const g = G.template(); G.removeNode(g, 'order');
  assert.equal(g.edges.some(e => e.source === 'order' || e.target === 'order'), false);
  assert.ok(G.check(g).some(e => e.nodeId === 'router' && /订单查询/.test(e.message)));
});
test('孤立节点、缺少开始、多个开始和缺少结束都有可定位错误', () => {
  const g = G.template(), n = G.addNode(g, 'end');
  assert.ok(G.check(g).some(e => e.nodeId === n.id && /无法/.test(e.message)));
  G.addNode(g, 'start'); assert.ok(G.check(g).some(e => /只能有一个开始/.test(e.message)));
  g.nodes = g.nodes.filter(n => !['start','end'].includes(n.type));
  assert.ok(G.check(g).some(e => /开始/.test(e.message))); assert.ok(G.check(g).some(e => /结束/.test(e.message)));
});
test('条件空值、节点空名称及无效配置在运行前报错', () => {
  const s = fresh(), n = urgentBranch(s); n.config.value = ''; assert.throws(() => run(s, '你好'), /value/);
  n.config.operator = 'exists'; assert.doesNotThrow(() => run(s, '你好'));
  n.label = ''; assert.throws(() => run(s, '你好'), /名称/);
});
test('移动节点不使回归失效，修改连线和参数都会失效', () => {
  const s = fresh(), n = urgentBranch(s), evaluation = C.evaluateFlow(s);
  n.x += 50; n.y += 20; assert.equal(C.evaluationCurrent(s, evaluation), true);
  n.config.value = '投诉'; assert.equal(C.evaluationCurrent(s, evaluation), false);
  C.evaluateFlow(s); G.connect(s.draft.graph, n.id, 'yes', 'order'); assert.equal(C.evaluationCurrent(s, s.flowValidation), false);
});
test('只修改布局保存为草稿，不制造业务版本变化', () => {
  const s = fresh(); s.draft.graph.nodes[0].x += 200; assert.equal(C.flowChanged(s), false);
  assert.throws(() => C.publishFlow(s), /没有修改/);
});
test('新会话执行发布的图，旧会话继续执行自己的图快照', () => {
  const s = fresh(), old = C.newSession(s); urgentBranch(s); assert.equal(publish(s), 2);
  const next = C.newSession(s); C.sendVisitor(s, old.id, '加急查询订单 SO20260926001'); C.sendVisitor(s, next.id, '加急查询订单 SO20260926001');
  assert.equal(old.status, 'bot'); assert.ok(old.messages.some(m => m.order)); assert.equal(next.status, 'waiting');
  s.draft.graph.nodes[0].label = '未发布开始'; assert.equal(next.flow.graph.nodes[0].label, '开始');
});
test('图可完整 JSON 保存恢复，恢复历史版本生成新快照', () => {
  const s = fresh(); urgentBranch(s); publish(s);
  const restored = JSON.parse(JSON.stringify(s)); assert.equal(run(restored, '加急查询订单 SO20260926001').status, 'waiting');
  C.prepareRollback(restored, 1); assert.equal(publish(restored), 3);
  assert.ok(run(restored, '加急查询订单 SO20260926001').messages.some(m => m.order));
});
test('旧 V3.1 数据只补流程图，既有会话、知识和工单保持原样', () => {
  const s = C.newState(); delete s.draft.graph; delete s.published.graph; for (const session of s.sessions) delete session.flow.graph;
  const old = JSON.stringify({ sessions: s.sessions, tickets: s.tickets, knowledge: s.knowledge });
  C.ensureGraphState(s);
  assert.deepEqual(G.check(s.draft.graph), []); assert.equal(JSON.stringify({ sessions: s.sessions, tickets: s.tickets, knowledge: s.knowledge }), old);
  const session = C.newSession(s); C.sendVisitor(s, session.id, '查询订单 SO20260926001'); assert.ok(session.messages.some(m => m.order));
});
test('旧发布记录没有图时，回滚仍能得到可编辑的图', () => {
  const s = fresh(); delete s.releases[0].config.graph; urgentBranch(s); publish(s); C.prepareRollback(s, 1);
  assert.deepEqual(G.check(s.draft.graph), []); assert.equal(publish(s), 3);
});
test('节点关闭售后或绕过受理输出，客户不能绕开节点直接建单', () => {
  const s = fresh(); s.draft.graph.nodes.find(n => n.id === 'intake').config.enabled = false; publish(s);
  const session = C.newSession(s); C.sendVisitor(s, session.id, '我要申请退货 SO20260926001'); const item = C.getItem(s, session.itemIds[0]);
  assert.equal(C.canSelfIntake(session, item), false);
  assert.throws(() => C.createTicket(s, { sessionId: session.id, itemId: item.id, customerSubmitted: true, title: '申请退货', description: '申请退货', priority: '普通', category: '售后服务' }), /未开放/);
});
test('每一步记录真实节点与边，未经过的节点不会出现在轨迹里', () => {
  const s = fresh(); urgentBranch(s); const r = run(s, '加急查询订单 SO20260926001');
  for (const step of r.trace) {
    assert.ok(s.draft.graph.nodes.some(n => n.id === step.node));
    if (step.edgeId) assert.ok(s.draft.graph.edges.some(e => e.id === step.edgeId && e.source === step.node));
    assert.ok(step.input); assert.equal(typeof step.output, 'string');
  }
  assert.equal(r.trace.some(t => t.type === 'order'), false);
});

function intakeBranch(s, config) {
  const g = s.draft.graph, node = G.addNode(g, 'condition');
  node.config = config; G.connect(g, 'router', 'aftersales', node.id);
  G.connect(g, node.id, 'yes', 'intake'); G.connect(g, node.id, 'no', 'human');
  publish(s); const session = C.newSession(s); C.sendVisitor(s, session.id, '申请退货 SO20260926001');
  const item = C.getItem(s, session.itemIds[0]);
  return { session, item, values: { sessionId: session.id, itemId: item.id, customerSubmitted: true, title: '申请退货', description: '外盒破损', priority: '普通', category: '售后服务', objectId: item.objectId } };
}
test('自助表单更换订单不能绕过该订单的画布分支，拒绝时无副作用', () => {
  const s = fresh(), { session, item, values } = intakeBranch(s, { field: 'orderId', operator: 'equals', value: 'SO20260926001' });
  assert.equal(C.canSelfIntake(session, item), true);
  const before = JSON.stringify(s);
  assert.throws(() => C.createTicket(s, { ...values, objectId: 'SO20260926002' }), /订单号已变更/);
  assert.equal(JSON.stringify(s), before);
  assert.equal(C.createTicket(s, values).objectId, 'SO20260926001');
});
test('同事项最新一轮转人工后，历史售后预览不能继续授权自助提交', () => {
  const s = fresh(), { session, item, values } = intakeBranch(s, { field: 'query', operator: 'notContains', value: '加急' });
  C.sendVisitor(s, session.id, '加急申请退货 SO20260926001');
  assert.equal(session.itemIds.length, 1); assert.equal(item.status, 'needs_human');
  assert.equal(C.canSelfIntake(session, item), false);
  assert.throws(() => C.createTicket(s, values), /未开放/);
});
test('其他事项的后续问答不撤销原事项仍有效的售后预览', () => {
  const s = fresh(), { session, item, values } = intakeBranch(s, { field: 'orderId', operator: 'equals', value: 'SO20260926001' });
  C.sendVisitor(s, session.id, '保温杯怎么清洗？');
  assert.equal(C.canSelfIntake(session, item), true); assert.equal(C.createTicket(s, values).itemId, item.id);
});
test('新增查询节点的超时进入坐席摘要，旧节点轨迹仍可读取', () => {
  const s = fresh(), g = s.draft.graph, copy = G.addNode(g, 'order'); copy.config.queryMode = 'timeout';
  G.connect(g, copy.id, 'success', 'reply'); G.connect(g, copy.id, 'failure', 'human'); G.connect(g, copy.id, 'missing', 'reply');
  urgentBranch(s, copy.id); publish(s);
  const session = C.newSession(s); C.sendVisitor(s, session.id, '加急查询订单 SO20260926001');
  assert.match(C.sessionSummary(session, s), /最近业务处理：订单查询/);
  assert.match(C.sessionSummary(session, s), /历史异常：.*超时/);
  for (const run of session.runs) for (const step of run.trace) { step.node = step.type; delete step.type; }
  assert.match(C.sessionSummary(session, s), /历史异常：.*超时/);
});
