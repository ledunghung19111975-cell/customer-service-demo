/* 产出 Agent：Codex。固定模板的演示执行器；无网络和真实业务写入。 */
(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const words = value => String(value).split(/[,，、\n]+/).map(s => s.trim()).filter(Boolean);
  const defaults = {
    version: 1,
    orderWords: '订单,物流,快递,发货',
    humanWords: '人工,投诉,客服专员',
    queryMode: 'success',
    humanOnline: true,
    queue: '售后服务组',
    prefix: '为你查到以下信息：'
  };
  const orders = [
    { id: 'SO20260926001', product: '原木便携保温杯 · 雾白', price: '129.00', status: '运输中', delivery: '演示快递 · 已到达配送站', receiver: '林** · 138****0618', date: '2026-09-25', icon: '◒' },
    { id: 'SO20260926002', product: '棉麻收纳袋 · 自然色', price: '49.00', status: '待发货', delivery: '仓库正在备货，发出后更新物流', receiver: '林** · 138****0618', date: '2026-09-26', icon: '▧' }
  ];
  function uid(state, prefix) { state.counter += 1; return prefix + String(state.counter).padStart(5, '0'); }
  function makeMessage(role, text, extra = {}) { return { role, text, time: now(), ...extra }; }
  function newSession(state, name = '林小夏') {
    const session = {
      id: uid(state, 'CS'), name, channel: 'Web 在线咨询', created: now(), status: 'bot',
      flow: clone(state.published), robot: clone(state.robot), messages: [], runs: [],
      pendingOrder: false, hadHandoff: false, resolution: '', tickets: [], summary: '', lastIssue: ''
    };
    session.messages.push(makeMessage('bot', session.robot.greeting));
    state.sessions.unshift(session);
    return session;
  }
  function findKnowledge(query, knowledge) {
    const q = query.toLowerCase();
    return knowledge.filter(k => k.status === 'published').map(k => ({ item: k, matches: words(k.keywords).filter(w => q.includes(w.toLowerCase())) }))
      .filter(r => r.matches.length).sort((a, b) => b.matches.length - a.matches.length)[0] || null;
  }
  function simulate(query, context, flow, knowledge) {
    validateFlow(flow);
    const text = query.trim();
    if (!text) throw new Error('请输入一条测试消息');
    if (text.length > 2000) throw new Error('单条消息请控制在 2,000 字以内');
    const result = { messages: [], trace: [], status: 'bot', pendingOrder: false, issue: null };
    const step = (node, label, detail, status = 'success') => result.trace.push({ node, label, detail, status });
    const say = (value, extra = {}) => result.messages.push(makeMessage('bot', value, extra));
    const handoff = reason => {
      result.status = flow.humanOnline ? 'waiting' : 'offline';
      step('human', '人工兜底', flow.humanOnline ? `转至${flow.queue}，等待坐席接管` : '人工当前离线，可登记工单', flow.humanOnline ? 'waiting' : 'warning');
      say(flow.humanOnline ? `${reason}\n已为你转接${flow.queue}，人工接管前可以继续补充问题。` : `${reason}\n人工当前离线，请点击“提交问题”登记处理需求。`);
    };
    step('start', '开始', `固定模板 · v${flow.version}`);
    const lower = text.toLowerCase();
    if (context.forceHandoff || words(flow.humanWords).some(w => lower.includes(w.toLowerCase()))) {
      step('router', '意图路由', context.forceHandoff ? '客户主动请求人工服务' : '命中人工服务关键词');
      handoff('我会把当前问题和聊天记录一起交给客服。');
    } else {
      const orderId = text.match(/\bSO[A-Z0-9]+\b/i)?.[0]?.toUpperCase();
      const isOrder = Boolean(orderId) || words(flow.orderWords).some(w => lower.includes(w.toLowerCase())) || (context.pendingOrder && /^[\s\dA-Za-z-]+$/.test(text));
      if (isOrder) {
        step('router', '意图路由', '进入订单查询分支');
        if (!orderId) {
          result.pendingOrder = true;
          step('order', '订单查询', '缺少有效订单号，等待用户补充', 'waiting');
          say('请提供以 SO 开头的订单号。你可以用演示订单 SO20260926001 试一试。');
        } else if (flow.queryMode === 'timeout') {
          step('order', '订单查询', `演示工具超时 · ${orderId}`, 'error');
          result.issue = { type: '工具超时', evidence: text, suggestion: '检查订单查询工具与超时兜底' };
          handoff('订单查询暂时没有返回结果。');
        } else {
          const order = orders.find(o => o.id === orderId);
          if (order) {
            step('order', '订单查询', `返回本地样例 ${orderId}`);
            say(`${flow.prefix}\n订单 ${orderId} 当前为“${order.status}”。`, { order: clone(order) });
          } else {
            step('order', '订单查询', `样例数据中没有 ${orderId}`, 'error');
            result.issue = { type: '订单未找到', evidence: text, suggestion: '核对订单号及查询范围' };
            say('演示订单中没有找到这个订单号，请核对后重试。也可以点击“转人工”继续处理。');
          }
        }
      } else {
        step('router', '意图路由', '进入知识问答分支');
        const hit = findKnowledge(text, knowledge);
        if (hit) {
          const k = hit.item;
          step('knowledge', '知识检索', `命中 ${hit.matches.length} 个关键词：${hit.matches.join('、')} · ${k.id} v${k.version}`);
          say(`${flow.prefix}\n${k.answer}`, { citation: { id: k.id, title: k.title, version: k.version, answer: k.answer } });
        } else {
          step('knowledge', '知识检索', '已发布知识未匹配到关键词', 'warning');
          result.issue = { type: '知识未命中', evidence: text, suggestion: '补充对应知识或增加匹配关键词' };
          handoff('现有知识里没有找到足够的信息，我暂时无法准确回答。');
        }
      }
    }
    step('reply', '回复输出', result.status === 'bot' ? '输出回答、追问或业务卡片' : '输出转接结果');
    step('end', '本轮结束', result.pendingOrder ? '保留订单信息采集状态' : '等待用户下一条消息');
    return result;
  }
  function getSession(state, id) {
    const session = state.sessions.find(s => s.id === id);
    if (!session) throw new Error('会话不存在，请重新选择');
    return session;
  }
  function sendVisitor(state, id, query, options = {}) {
    const session = getSession(state, id);
    const text = query.trim();
    if (!text) throw new Error('请输入消息');
    if (text.length > 2000) throw new Error('单条消息请控制在 2,000 字以内');
    if (session.status === 'ended') throw new Error('会话已结束，请新建会话');
    session.messages.push(makeMessage('user', text));
    session.summary = text;
    if (session.status !== 'bot') return session;
    const result = simulate(text, { ...session, forceHandoff: Boolean(options.forceHandoff) }, session.flow, state.knowledge);
    session.messages.push(...result.messages);
    session.status = result.status;
    session.pendingOrder = result.pendingOrder;
    session.summary = text;
    session.runs.push({ id: uid(state, 'RUN'), time: now(), version: session.flow.version, trace: result.trace });
    if (['waiting', 'offline'].includes(result.status)) session.hadHandoff = true;
    if (result.issue) {
      session.lastIssue = result.issue.type;
      state.issues.unshift({ id: uid(state, 'QA'), sessionId: id, time: now(), status: '待复核', review: '', ...result.issue });
    }
    return session;
  }
  function takeover(state, id) {
    const s = getSession(state, id);
    if (!['waiting', 'offline'].includes(s.status)) throw new Error('只有待接管或离线留言可以接管');
    s.status = 'human'; s.hadHandoff = true;
    s.messages.push(makeMessage('system', '客服小林已接入，接下来由人工为你服务。'));
  }
  function sendAgent(state, id, query) {
    const s = getSession(state, id), text = query.trim();
    if (s.status !== 'human') throw new Error('请先接管会话');
    if (!text || text.length > 2000) throw new Error('请填写 1–2,000 字的回复');
    s.messages.push(makeMessage('agent', text));
  }
  function finish(state, id, by) {
    const s = getSession(state, id);
    if (s.status === 'ended') throw new Error('会话已经结束');
    if (!['customer', 'agent', 'visitor'].includes(by)) throw new Error('结束方式无效');
    if (by === 'customer' && !canResolve(s)) throw new Error('当前会话尚不能确认解决');
    if (by === 'agent' && s.status !== 'human') throw new Error('请先接管会话再结束');
    s.status = 'ended'; s.resolution = by;
    s.messages.push(makeMessage('system', by === 'customer' ? '客户确认问题已解决，会话结束。' : by === 'agent' ? '人工客服已结束本次会话，关联工单仍按自身进度处理。' : '客户结束本次咨询，关联工单仍可继续处理。'));
  }
  function canResolve(session) {
    const answer = [...session.messages].reverse().find(m => m.role === 'bot');
    return session.status === 'bot' && !session.pendingOrder && Boolean(answer?.citation || answer?.order);
  }
  function resumeBot(state, id) {
    const s = getSession(state, id);
    if (!['waiting', 'offline'].includes(s.status)) throw new Error('当前会话不能取消人工请求');
    s.status = 'bot'; s.pendingOrder = false;
    s.messages.push(makeMessage('system', '已取消人工请求，你可以继续向机器人咨询其他问题。'));
  }
  function sessionSummary(session) {
    const clip = (value, limit) => String(value).length > limit ? String(value).slice(0, limit - 5) + '…（节选）' : String(value);
    const users = session.messages.filter(m => m.role === 'user');
    const ids = [...new Set(users.flatMap(m => m.text.match(/\bSO[A-Z0-9]+\b/gi) || []).map(id => id.toUpperCase()))];
    const answer = [...session.messages].reverse().find(m => m.role === 'agent' || m.citation || m.order);
    const business = session.runs.flatMap(run => run.trace.filter(step => ['knowledge', 'order'].includes(step.node)));
    const latest = business.at(-1);
    const history = [...new Set(business.filter(step => ['warning', 'error'].includes(step.status)).map(step => step.detail))].slice(-3);
    const statuses = { bot: '机器人接待', waiting: '等待接管', human: '人工服务', offline: '人工离线', ended: '已结束' };
    const summary = [
      `最初问题：${clip(users[0]?.text || '尚未提问', 180)}`,
      `最近补充：${users.slice(-3).map(m => clip(m.text, 120)).join(' / ') || '无'}`,
      `订单线索：${ids.slice(-4).map(id => clip(id, 40)).join('、') || '未提供'}`,
      `已有答复：${answer ? clip(answer.text, 350) : '尚无业务答案'}`,
      `最近业务处理：${latest ? clip(latest.label + ' · ' + latest.detail, 160) : '尚未执行业务查询'}`,
      `历史异常：${history.length ? history.map(item => clip(item, 120)).join(' / ') : '无'}`,
      `当前状态：${statuses[session.status]}；共 ${users.length} 条客户消息；流程 v${session.flow.version}。`
    ].join('\n');
    return summary.length > 1800 ? summary.slice(0, 1770) + '\n（摘要已截断，详见关联会话）' : summary;
  }
  function createTicket(state, values) {
    const title = String(values.title || '').trim(), description = String(values.description || '').trim();
    if (!title || !description) throw new Error('请填写工单标题和问题描述');
    if (title.length > 80 || description.length > 2000) throw new Error('标题最多 80 字，问题描述最多 2,000 字');
    if (!['售后服务', '订单物流', '知识咨询', '其他问题'].includes(values.category)) throw new Error('请选择有效的工单类型');
    if (!['普通', '紧急'].includes(values.priority)) throw new Error('请选择有效的优先级');
    const session = values.sessionId ? getSession(state, values.sessionId) : null;
    if (session && state.tickets.some(t => t.sessionId === session.id && t.title === title && t.status !== '已完成')) throw new Error('该会话已有同名未完成工单，请查看已有工单');
    const ticket = { id: uid(state, 'TK'), title, description, customerSubmitted: Boolean(values.customerSubmitted), category: values.category, priority: values.priority, sessionId: session?.id || '', owner: '', status: '待分配', created: now(), history: [{ time: now(), text: '工单已创建，等待分配' }] };
    state.tickets.unshift(ticket);
    if (session) { session.tickets.push(ticket.id); session.messages.push(makeMessage('system', `已登记演示工单 ${ticket.id}：${title}`, { ticketId: ticket.id })); }
    return ticket;
  }
  const transitions = { '待分配': ['处理中'], '处理中': ['待客户补充', '已完成'], '待客户补充': ['处理中'], '已完成': [] };
  function advanceTicket(state, id, status, owner, note = '') {
    const t = state.tickets.find(item => item.id === id);
    if (!t) throw new Error('工单不存在');
    if (!transitions[t.status].includes(status)) throw new Error('不支持该状态变更');
    const nextOwner = String(owner || t.owner).trim();
    if (!nextOwner) throw new Error('请先指定负责人');
    const detail = String(note).trim();
    if (['待客户补充', '已完成'].includes(status) && !detail) throw new Error('请说明需要客户补充的内容或处理结果');
    if (detail.length > 1000) throw new Error('处理说明最多 1,000 字');
    t.owner = nextOwner; t.status = status;
    t.history.push({ time: now(), text: `${nextOwner} · ${status}${detail ? '：' + detail : ''}` });
    if (t.sessionId) getSession(state, t.sessionId).messages.push(makeMessage('system', `工单 ${t.id} · ${status}${detail ? '：' + detail : ''}`, { ticketId: t.id }));
    return t;
  }
  function validateFlow(flow) {
    if (!words(flow.orderWords).length || !words(flow.humanWords).length) throw new Error('订单和人工路由关键词都不能为空');
    if (!flow.queue.trim()) throw new Error('请填写人工服务组');
    if (!['success', 'timeout'].includes(flow.queryMode)) throw new Error('查询模式无效');
  }
  function addTicketReply(state, id, text) {
    const ticket = state.tickets.find(t => t.id === id), detail = String(text).trim();
    if (!ticket || ticket.status !== '待客户补充') throw new Error('此工单当前不需要补充材料');
    if (!detail || detail.length > 1000) throw new Error('请填写 1–1,000 字的补充说明');
    ticket.status = '处理中';
    ticket.history.push({ time: now(), text: `客户补充：${detail}；已转回处理中` });
    if (ticket.sessionId) {
      const session = getSession(state, ticket.sessionId);
      session.messages.push(makeMessage('system', `工单 ${ticket.id} · 客户补充：${detail}，已转回处理中。`, { ticketId: ticket.id }));
      session.summary = `工单补充：${detail}`;
    }
    return ticket;
  }
  function flowChanged(state) {
    return Object.keys(defaults).filter(key => key !== 'version').some(key => state.draft[key] !== state.published[key]);
  }
  function publishFlow(state) {
    validateFlow(state.draft);
    if (!flowChanged(state)) throw new Error('流程没有修改，无需重复发布');
    state.published = clone({ ...state.draft, version: state.published.version + 1 });
    state.draft = clone(state.published);
    return state.published.version;
  }
  function saveKnowledge(state, values) {
    const title = String(values.title || '').trim(), keywords = String(values.keywords || '').trim(), answer = String(values.answer || '').trim();
    if (!title || !words(keywords).length || !answer) throw new Error('请填写知识标题、匹配关键词和答案');
    if (title.length > 80 || answer.length > 2000 || keywords.length > 200) throw new Error('内容过长，请缩短标题、答案或关键词');
    let item = values.id ? state.knowledge.find(k => k.id === values.id) : null;
    if (values.id && !item) throw new Error('知识条目不存在');
    const content = { title, keywords, answer, category: values.category || '通用服务' };
    if (item && item.status !== 'draft') {
      const changed = Object.keys(content).some(key => content[key] !== item[key]);
      if (changed) item.draft = { ...content, version: item.version + 1 };
      else delete item.draft;
    } else if (item) Object.assign(item, content);
    else { item = { id: uid(state, 'KB'), ...content, status: 'draft', version: 1 }; state.knowledge.unshift(item); }
    item.updated = now();
    return item;
  }
  function publishKnowledge(state, id) {
    const item = state.knowledge.find(k => k.id === id);
    if (!item) throw new Error('知识不存在');
    if (item.status === 'published' && !item.draft) throw new Error('知识没有待发布修改');
    if (item.draft) { Object.assign(item, item.draft); delete item.draft; }
    item.status = 'published'; item.updated = now();
    return item;
  }
  function metrics(state) {
    return {
      total: state.sessions.length,
      aiResolved: state.sessions.filter(s => s.status === 'ended' && s.resolution === 'customer' && !s.hadHandoff).length,
      waiting: state.sessions.filter(s => s.status === 'waiting').length,
      tickets: state.tickets.filter(t => t.status !== '已完成').length,
      knowledge: state.knowledge.filter(k => k.status === 'published').length,
      issues: state.issues.filter(q => q.status === '待复核').length
    };
  }
  function newState() {
    const state = { schema: 1, counter: 100, robot: { name: '青禾小助', greeting: '你好，我是青禾小助。关于商品、订单和售后，都可以在这里问我。', description: '青禾生活 · 在线服务' }, draft: clone(defaults), published: clone(defaults), sessions: [], tickets: [], issues: [], knowledge: [
      { id: 'KB001', title: '七天无理由退货规则', category: '售后政策', keywords: '退货,无理由,七天,退款', answer: '青禾生活演示规则：签收后七天内，商品未使用且包装与配件完整，可登记退货申请。定制商品不适用此规则。是否符合条件由人工结合订单核实，当前演示不会实际退款。', status: 'published', version: 2 },
      { id: 'KB002', title: '商品材质与日常保养', category: '产品知识', keywords: '材质,保温杯,保养,清洗', answer: '演示商品保温杯采用不锈钢内胆，建议使用软布和中性清洁剂清洗。首次使用前请充分清洁，避免放入微波炉加热。', status: 'published', version: 1 },
      { id: 'KB003', title: '服务时间与人工支持', category: '通用服务', keywords: '服务时间,营业时间,几点', answer: '本演示的服务时间示例为每天 09:00–21:00。你可以随时留言；需要人工时点击转人工，离线时可登记工单。', status: 'published', version: 1 },
      { id: 'KB004', title: '会员积分使用说明', category: '会员权益', keywords: '积分,会员', answer: '演示积分可在会员中心查看。可抵扣范围以活动规则为准，本演示不执行积分兑换。', status: 'draft', version: 1 },
      { id: 'KB005', title: '历史活动规则', category: '活动规则', keywords: '周年庆,活动', answer: '历史活动已结束，请关注最新公告。', status: 'disabled', version: 1 }
    ] };
    let s = newSession(state, '陈一诺'); sendVisitor(state, s.id, '七天无理由退货有什么条件？'); finish(state, s.id, 'customer');
    s = newSession(state, '周安'); sendVisitor(state, s.id, '保温杯怎么清洗？'); finish(state, s.id, 'customer');
    s = newSession(state, '许晨'); sendVisitor(state, s.id, '帮我查订单 SO20260926002');
    s = newSession(state, '林沐'); sendVisitor(state, s.id, '请帮我转人工，包裹外盒有破损');
    s = newSession(state, '苏语'); sendVisitor(state, s.id, '礼品卡可以分多次使用吗？');
    const ticket = createTicket(state, { title: '包裹外盒破损核实', category: '售后服务', priority: '普通', description: '演示客户反馈外盒破损，需客服核对商品情况与后续处理方式。', sessionId: state.sessions.find(x => x.name === '林沐').id });
    advanceTicket(state, ticket.id, '处理中', '客服小林');
    return state;
  }
  const api = { clone, words, defaults, orders, now, makeMessage, newState, newSession, findKnowledge, simulate, getSession, sendVisitor, takeover, sendAgent, finish, canResolve, resumeBot, sessionSummary, createTicket, transitions, advanceTicket, addTicketReply, validateFlow, flowChanged, publishFlow, saveKnowledge, publishKnowledge, metrics };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CustomerDemo = api;
})(typeof window !== 'undefined' ? window : this);
