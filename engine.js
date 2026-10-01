/* 知序 V3：在原静态演示基础上增加事项、受理、知识治理与回归门槛。
 * 所有身份、订单、运行状态均为样例；本地校验不构成服务端授权或并发保证。
 * 无网络请求、真实模型调用或真实退款。 */
(function (root) {
  'use strict';
  const Graph = typeof module !== 'undefined' && module.exports ? require('./flow-graph.js') : root.CustomerFlow;
  const clone = value => JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const words = value => [...new Set(String(value || '').split(/[,，、\n]+/).map(s => s.trim()).filter(Boolean))];
  const normalize = value => String(value ?? '').replace(/[\s，,。.!！?？]/g, '').toLowerCase();
  const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const length = value => Array.from(String(value)).length;
  const clean = (value, label, limit, required = true) => {
    const text = String(value ?? '').trim();
    if (required && !text) throw new Error(`请填写${label}`);
    if (length(text) > limit) throw new Error(`${label}最多 ${limit.toLocaleString('en-US')} 字`);
    return text;
  };
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const uid = (state, prefix) => prefix + String(++state.counter).padStart(5, '0');
  const makeMessage = (role, text, extra = {}) => ({ role, text, time: now(), ...extra });
  const defaults = { version: 1, orderWords: '订单,物流,快递,发货', humanWords: '人工,投诉,客服专员', queryMode: 'success', queue: '售后服务组', prefix: '为你查到以下信息：', intakeEnabled: true, graph: Graph.template() };
  const itemNames = { clarifying: '待澄清', processing: '处理中', needs_human: '待人工', needs_customer: '待客户补充', awaiting_confirmation: '待结果确认', resolved: '已解决', cancelled: '已撤销' };
  const itemTypes = { knowledge: '知识咨询', order: '订单查询', aftersales: '售后申请', other: '人工协助' };
  const orders = [
    { id: 'SO20260926001', customerId: 'DEMO-CUSTOMER', product: '原木便携保温杯 · 雾白', price: '129.00', status: '运输中', delivery: '包裹已到达配送站', receiver: '林** · 138****0618', date: '2026-09-25', icon: '◒' },
    { id: 'SO20260926002', customerId: 'DEMO-CUSTOMER', product: '棉麻收纳袋 · 自然色', price: '49.00', status: '待发货', delivery: '仓库正在备货，发出后更新物流', receiver: '林** · 138****0618', date: '2026-09-26', icon: '▧' }
  ];
  const getSession = (state, id) => { const s = state.sessions.find(s => s.id === id); assert(s, '会话不存在，请重新选择'); return s; };
  const getItem = (state, id) => { const item = state.items.find(i => i.id === id); assert(item, '服务事项不存在'); return item; };
  const getTicket = (state, id) => { const t = state.tickets.find(t => t.id === id); assert(t, '工单不存在'); return t; };
  const sessionItems = (state, session) => session.itemIds.map(id => getItem(state, id));
  const audit = (state, type, target, reason, extra = {}) => state.audit.push({ id: uid(state, 'EV'), time: now(), type, target, reason, operator: state.operator, ...extra });
  function newSession(state, name = '林小夏', options = {}) {
    const linked = options.itemId ? getItem(state, options.itemId) : null;
    const customerId = options.customerId || 'DEMO-CUSTOMER';
    if (linked) assert(linked.customerId === customerId, '无法关联此服务事项');
    const session = {
      id: uid(state, 'CS'), name, customerId, channel: 'Web 在线咨询', created: now(), status: 'bot',
      flow: clone(state.published), robot: clone(state.robot), messages: [], runs: [], itemIds: [],
      pendingItemId: '', pendingOrder: false, hadHandoff: false, resolution: '', owner: '', queue: '',
      tickets: [], summary: '', lastIssue: '', sample: Boolean(options.sample)
    };
    session.messages.push(makeMessage('bot', session.robot.greeting));
    state.sessions.unshift(session);
    if (linked) {
      session.itemIds.push(linked.id); linked.sessionIds.push(session.id);
      session.tickets = [...linked.tickets];
      if (['resolved', 'cancelled'].includes(linked.status)) changeItem(linked, 'needs_human', '客户再次联系原事项');
      session.messages.push(makeMessage('system', `继续处理 ${linked.id}：${linked.title}。原受理时间与工单保留，请补充当前需要帮助的内容。`));
      if (linked.status === 'clarifying') session.pendingItemId = linked.id;
      if (linked.tickets.length || linked.humanTouched) requestHandoff(state, session, '原事项需要人工继续处理', [linked]);
    }
    return session;
  }
  function changeItem(item, status, reason, actor = '系统') {
    assert(itemNames[status], '事项状态无效');
    if (item.status !== status) item.history.push({ time: now(), from: item.status, to: status, reason, actor });
    if (item.status === 'resolved' && status !== 'resolved') {
      item.previousResolution = { resolvedAt: item.resolvedAt, method: item.confirmation, evidence: clone(item.evidence) };
      item.resolvedAt = null; item.confirmation = '';
    }
    item.status = status; item.updated = now();
  }
  function newItem(state, session, values) {
    const item = {
      id: uid(state, 'SI'), type: values.type, title: values.title, key: values.key || values.type,
      request: values.request || values.title, objectId: values.objectId || '', customerId: session?.customerId || 'DEMO-CUSTOMER',
      sessionIds: session ? [session.id] : [], created: now(), updated: now(), status: 'clarifying',
      evidence: [], tickets: [], history: [], humanTouched: false, resolvedAt: null, confirmation: '', sample: Boolean(session?.sample)
    };
    state.items.unshift(item);
    if (session) session.itemIds.push(item.id);
    return item;
  }
  function isKnowledgeActive(k, at = now(), scope = '青禾生活') {
    const t = Date.parse(at), start = Date.parse(k.effectiveAt), end = k.expiresAt ? Date.parse(k.expiresAt) : Infinity;
    return k.status === 'published' && k.scope === scope && Number.isFinite(start) && start <= t && t < end;
  }
  // 作答门槛：至少命中两个关键词，或问题包含标准问题。只命中“退款”“保温杯”这类泛词不作答，按未命中交给人工。
  const MIN_KEYWORD_HITS = 2;
  function findKnowledge(query, knowledge, options = {}) {
    const q = normalize(query);
    const results = knowledge.filter(k => isKnowledgeActive(k, options.at, options.scope)).map(k => {
      const standard = normalize(k.standardQuestion);
      return { item: k, exact: Boolean(standard) && q.includes(standard), matches: words(k.keywords).filter(w => normalize(w) && q.includes(normalize(w))) };
    }).filter(r => r.exact || r.matches.length >= MIN_KEYWORD_HITS)
      .sort((a, b) => b.exact - a.exact || b.matches.length - a.matches.length || a.item.id.localeCompare(b.item.id));
    if (!results.length) return null;
    const ties = results.filter(r => r.exact === results[0].exact && r.matches.length === results[0].matches.length);
    if (ties.length > 1 && new Set(ties.map(r => r.item.answer)).size > 1) return { conflict: true, candidates: ties.map(r => r.item), matches: ties[0].matches };
    return results[0];
  }
  function validateFlow(flow) {
    assert(words(flow.orderWords).length && words(flow.humanWords).length, '订单和人工路由关键词都不能为空');
    clean(flow.orderWords, '订单路由词', 200); clean(flow.humanWords, '人工路由词', 200);
    clean(flow.queue, '人工服务组', 30); clean(flow.prefix, '回答引导语', 150, false);
    assert(['success', 'timeout'].includes(flow.queryMode), '查询模式无效');
    assert(typeof flow.intakeEnabled === 'boolean', '售后受理开关无效');
    const errors = Graph.check(Graph.graphFor(flow));
    assert(!errors.length, errors.map(e => e.message).slice(0, 3).join('；'));
  }
  const runtimeDefaults = { humanMode: 'online', capacity: 2, toolEnabled: true, reason: '初始接待配置' };
  function capacityState(state) {
    const occupied = state.sessions.filter(s => s.status === 'human').length;
    return { ...state.runtime, occupied, full: state.runtime.humanMode === 'busy' || occupied >= state.runtime.capacity };
  }
  function runtimeStatus(runtime) { return runtime.humanMode === 'offline' ? 'offline' : 'waiting'; }
  function handoffText(runtime, queue, reason) {
    if (runtime.humanMode === 'offline') return `${reason}\n人工客服当前离线。可点击“提交问题”留言，处理进度在本窗口查看。`;
    if (runtime.full || runtime.humanMode === 'busy') return `${reason}\n${queue}当前满载，已进入等待队列。可以补充信息、取消排队或提交问题留单；暂不估计等待分钟数。`;
    return `${reason}\n已进入${queue}，等待坐席接管。接管前可以继续补充问题。`;
  }
  // 拒绝转人工（前置否定或“人工就不用了”）以及“人工智能/人工费”这类构词都不是转人工诉求；否定对所有配置的人工触发词生效。
  // 质问或反问（为什么不/怎么还不/要不要/……吗？）仍按要人工处理：漏转一个着急的客户比多转一次代价更高。
  function withoutDeclinedHandoff(text, humanWords) {
    const targets = humanWords.map(escapeRegExp).join('|');
    const declined = new RegExp(`(?:不需要|不用|不要|不想|不必|无需|没必要|用不着|别|不)(?:是要|是想|再|先|帮我|给我|请|麻烦|去)?(?:转(?:接|给|到)?|找|联系|接通|安排|叫)?(?:${targets})(?![^，,。；;！!？?]*[吗？?])`, 'gi');
    return text.replace(/人工(?:智能|费|成本)/g, '')
      .replace(declined, (match, offset, whole) => /[为啥么还咋能要是]/.test(whole[offset - 1] || '') ? match : '')
      .replace(new RegExp(`(?:${targets})(?:客服|服务)?(?:就|先|暂时)?(?:不需要|不用|不要|算了)了?(?=$|[，,。.!！?？；;\\s])`, 'gi'), '');
  }
  // 支持演示脚本中的固定表达。不是通用语义模型；歧义与无依据走澄清/人工。
  function planRequests(text, context, flow) {
    const id = text.match(/\bSO[A-Z0-9]+\b/i)?.[0]?.toUpperCase() || '';
    const humanWords = words(flow.humanWords), humanText = withoutDeclinedHandoff(text, humanWords).toLowerCase();
    const wantsHuman = context.forceHandoff || humanWords.some(w => humanText.includes(w.toLowerCase()));
    if (wantsHuman) return [{ type: 'other', title: '人工协助', key: 'human', request: text, objectId: id, status: 'needs_human', handoff: true }];
    const pending = context.pendingItem;
    const onlyId = /^\s*(订单号[是为：:]?\s*)?SO[A-Z0-9]+[。.!！]?\s*$/i.test(text);
    const isPolicy = value => /(规则|条件|政策|无理由|如何退|怎么退|退货运费|想了解|咨询一下)/.test(value) && /(退|售后)/.test(value);
    const isCare = value => /(清洗|保养|材质)/.test(value);
    const policy = isPolicy(text);
    const negatedIntake = /(不要|不想|不需要|暂不|先不|不打算).{0,6}(退货|退款|换货|申请|办理)/.test(text);
    const intake = !negatedIntake && (/(申请|办理).{0,8}(退货|退款|换货|售后|补发)/.test(text) || /(想|要|需要|帮我)(退货|退款|换货|补发)/.test(text));
    const explicitLookup = /(查|看|查询|进度|状态|到哪|在哪|什么时候|何时|催).{0,8}(订单|物流|快递|发货)/.test(text) || /(物流|快递|发货).{0,8}(查|看|进度|状态|到哪|在哪|何时)/.test(text);
    const plainOrder = onlyId || /^(帮我|请|我想|我要)?(查一下|查询一下|查询|查)?(订单|物流|快递)[。?？!！]?$/.test(text.trim()) || (id && !intake && !policy && !/(保温杯|清洗|保养|材质|发票|礼品卡)/.test(text));
    const keywordOrder = !policy && !intake && words(flow.orderWords).some(w => text.includes(w)) && !/(没有订单号|不查|不要查)/.test(text);
    const requests = [];
    if (explicitLookup || plainOrder || keywordOrder) requests.push({ type: 'order', key: 'order', title: '查询订单与物流', objectId: id, request: text });
    if (intake) requests.push({ type: 'aftersales', key: 'aftersales', title: '申请售后处理', objectId: id, request: text });
    // 多事项里的知识子问题按客户原句所在分句检索，不改写成固定问题，运营新增的知识才能被命中。
    const clause = test => text.split(/[，,。；;！!？?\n]+/).map(s => s.trim()).find(test) || text;
    if (isCare(text) && requests.length) requests.push({ type: 'knowledge', key: 'care', title: '商品材质与日常保养', query: clause(isCare), request: text });
    if (policy && (!intake || /(再|还|同时|并|另外|以及)/.test(text))) requests.push({ type: 'knowledge', key: 'policy', title: '了解退货规则', query: clause(isPolicy), request: text });
    if (!requests.length) requests.push({ type: 'knowledge', key: 'question:' + text, title: text.slice(0, 60), query: text, request: text });
    // 有待补订单号的事项时，本轮订单号先回填原事项；只有明确发起另一类订单诉求时才另建事项。
    if (pending && id) {
      const fill = { ...pending, pendingId: pending.id, objectId: id, request: pending.request };
      const same = requests.findIndex(r => r.type === pending.type), idOnly = explicitLookup ? -1 : requests.findIndex(r => r.type === 'order');
      if (same >= 0) requests[same] = fill;
      else if (idOnly >= 0) requests[idOnly] = fill;
      else if (!requests.some(r => r.type === 'order' || r.type === 'aftersales')) requests.unshift(fill);
    }
    return requests;
  }
  function simulate(query, context = {}, flow = defaults, knowledge = []) {
    validateFlow(flow);
    const text = clean(query, '消息', 2000), runtime = { ...runtimeDefaults, ...(context.runtime || {}) };
    const graph = Graph.graphFor(flow), nodes = new Map(graph.nodes.map(n => [n.id, n]));
    const result = { messages: [], trace: [], status: 'bot', pendingOrder: false, tasks: [], issues: [], issue: null, queue: '' };
    const plans = planRequests(text, context, flow);
    for (const plan of plans) {
      const task = { ...plan, handoff: false, status: 'clarifying', evidence: [] };
      result.tasks.push(task);
      const say = (value, extra = {}) => result.messages.push(makeMessage('bot', value, { taskIndex: result.tasks.indexOf(task), ...extra }));
      const issue = (type, suggestion) => result.issues.push({ type, evidence: text, query: task.query || text, suggestion, taskIndex: result.tasks.indexOf(task) });
      let current = graph.nodes.find(n => n.type === 'start'), pending = null, lastOrder = null, reason = '', lastOutput = '客户输入';
      const messageStart = result.messages.length;
      while (current) {
        const c = current.config, input = { question: task.query || text, serviceType: task.type, orderId: task.objectId || '', previous: lastOutput };
        let port = 'next', detail = '', status = 'success';
        switch (current.type) {
          case 'start': detail = `流程 v${flow.version} · ${plans.length} 个事项分别沿图执行`; break;
          case 'router':
            port = plan.handoff ? 'human' : task.type === 'aftersales' ? 'aftersales' : task.type === 'order' ? 'order' : 'knowledge';
            detail = `识别为${itemTypes[task.type]}，选择“${Graph.types.router.outputs.find(p => p[0] === port)[1]}”分支`; break;
          case 'condition': {
            const actual = { query: task.query || text, serviceType: task.type, orderId: task.objectId || '', orderStatus: lastOrder?.status || '' }[c.field];
            const expected = c.value || '';
            const pass = c.operator === 'exists' ? Boolean(actual) : c.operator === 'equals' ? actual === expected : c.operator === 'notContains' ? !actual.includes(expected) : actual.includes(expected);
            port = pass ? 'yes' : 'no'; detail = `${c.field} = “${actual}” · ${pass ? '满足条件' : '不满足条件'}`; break;
          }
          case 'knowledge': {
            const pool = c.knowledgeId ? knowledge.filter(k => k.id === c.knowledgeId) : knowledge;
            const hit = findKnowledge(task.query || text, pool);
            if (!hit || hit.conflict) {
              const type = hit?.conflict ? '知识冲突' : '知识未命中';
              reason = hit?.conflict ? '现有资料的回答存在冲突，需要人工核实。' : '现有知识里没有找到足够依据，我暂时无法准确回答。';
              pending = { text: reason, status: 'clarifying' };
              port = 'miss'; status = 'warning'; detail = `${type}；至少命中 ${MIN_KEYWORD_HITS} 个关键词或标准问题`;
              issue(type, hit?.conflict ? '复核适用范围和内容冲突' : '补充经过审核的问答，不直接把未验证回答入库');
            } else {
              const k = hit.item;
              const citation = { id: k.id, title: k.title, version: k.version, answer: k.answer, source: k.source, scope: k.scope, owner: k.owner, effectiveAt: k.effectiveAt, expiresAt: k.expiresAt };
              pending = { text: k.answer, status: task.type === 'knowledge' ? 'awaiting_confirmation' : 'clarifying', evidence: [{ kind: 'knowledge', ...clone(citation) }], extra: { citation }, key: 'knowledge:' + k.id, title: k.title, prefix: true };
              port = 'found'; detail = `${k.id} v${k.version} · ${[hit.exact ? '标准问题' : '', ...hit.matches].filter(Boolean).join('、')}`;
            }
            break;
          }
          case 'order': {
            port = 'missing';
            if (!task.objectId) {
              result.pendingOrder = true; status = 'waiting'; detail = '缺少订单号，进入信息补充分支';
              pending = { text: '请提供需要查询的订单号。你也可以在“我的订单”中选择订单。', status: 'clarifying' };
            } else if (context.customerId && context.customerId !== 'DEMO-CUSTOMER') {
              port = 'failure'; status = 'error'; detail = '归属校验未通过，不透露订单是否存在';
              reason = '当前身份无法查询此订单，请从已授权入口联系人工核实。'; pending = { text: reason, status: 'clarifying' };
              issue('归属校验未通过', '核实客户身份与订单归属');
            } else if (!runtime.toolEnabled || (c.queryMode || flow.queryMode) === 'timeout') {
              const type = runtime.toolEnabled ? '工具超时' : '工具已停用';
              port = 'failure'; status = 'error'; detail = `${type} · ${task.objectId}`;
              reason = '订单查询暂未完成，已保留订单号。'; pending = { text: reason, status: 'clarifying' };
              issue(type, '检查工具可用性与超时承接');
            } else {
              lastOrder = orders.find(o => o.id === task.objectId) || null;
              if (!lastOrder) {
                detail = `未查询到订单 ${task.objectId}`; status = 'warning';
                pending = { text: '没有找到这个订单号，请核对后重试，或联系人工客服协助查询。', status: 'clarifying' };
                issue('订单未找到', '核对订单编号与查询范围');
              } else {
                port = 'success'; detail = `订单查询成功 ${lastOrder.id}`;
                pending = { text: `订单 ${lastOrder.id} 当前为“${lastOrder.status}”。仅完成查询，不表示其他售后事项已处理。`, status: task.type === 'order' ? 'awaiting_confirmation' : 'clarifying', prefix: true,
                  evidence: [{ kind: 'order', objectId: lastOrder.id, queriedAt: now(), source: '订单服务', result: clone(lastOrder) }], extra: { order: { ...clone(lastOrder), queriedAt: now() } } };
              }
            }
            break;
          }
          case 'intake':
            if (!task.objectId) {
              port = 'missing'; status = 'waiting'; result.pendingOrder = true; detail = '缺少订单号，需客户补充';
              pending = { text: '请提供需要售后的订单号，也可以在“我的订单”中选择订单。', status: 'clarifying' };
            } else if (!flow.intakeEnabled || c.enabled === false || task.type !== 'aftersales') {
              port = 'manual'; reason = '此流程未开放当前事项的自助售后受理，需要人工协助。'; detail = reason;
              pending = { text: reason, status: 'clarifying' };
            } else {
              port = 'ready'; detail = `售后受理预览 · ${task.objectId}；未创建工单或退款`;
              pending = { text: `已记下订单 ${task.objectId} 的售后诉求。请点击下方“填写并确认售后申请”，核对订单和问题后再提交。这里只登记处理需求，不表示退款已批准或已到账。`, status: 'processing', extra: { intake: { objectId: task.objectId } } };
            }
            break;
          case 'reply':
            if (c.mode === 'text') { say(c.text); detail = c.text; }
            else if (pending) {
              say((pending.prefix ? (c.prefix ?? flow.prefix) + '\n' : '') + pending.text, pending.extra);
              if (!task.handoff) task.status = pending.status;
              if (pending.evidence) task.evidence = clone(pending.evidence);
              if (pending.key && task.type === 'knowledge') { task.key = pending.key; task.title = pending.title; }
              detail = pending.text; pending = null;
            } else { say('当前路径还没有可输出的检索或查询结果，请补充问题。'); detail = '没有上游结果，提示补充问题'; status = 'warning'; }
            break;
          case 'human':
            task.status = 'needs_human'; task.handoff = true; result.status = runtimeStatus(runtime);
            // 一个会话只进入一个服务组；多个事项以首次触发的人工节点为准。
            result.queue ||= c.queue || flow.queue;
            detail = `${result.queue} · ${runtime.humanMode === 'offline' ? '离线留单' : runtime.full || runtime.humanMode === 'busy' ? '容量已满，等待或留单' : '等待坐席接管'}`;
            status = 'waiting'; pending = null;
            say(handoffText(runtime, result.queue, reason || '我会把当前事项、问题和聊天记录一起交给客服。')); break;
          case 'end':
            port = '';
            if (result.messages.length === messageStart) {
              status = 'warning'; detail = '这条路径没有经过回复或人工节点';
              say('流程已结束，但没有产生回复。请检查回复节点和连线。');
            } else detail = '本轮结束，保留未完成事项并等待下一条消息';
            break;
        }
        const edge = port ? graph.edges.find(e => e.source === current.id && e.port === port) : null;
        result.trace.push({ node: current.id, type: current.type, label: current.label, detail, status, port, edgeId: edge?.id || '', taskIndex: result.tasks.indexOf(task), input, output: detail });
        lastOutput = detail;
        current = edge ? nodes.get(edge.target) : null;
      }
    }
    result.issue = result.issues[0] || null;
    return result;
  }
  function ensureGraphState(state) {
    for (const flow of [state.draft, state.published]) if (!flow.graph) flow.graph = Graph.template();
    return state;
  }
  function canSelfIntake(session, item) {
    if (!session?.flow.intakeEnabled) return false;
    if (!session.flow.graph) return true;
    if (!item || item.status !== 'processing') return false;
    const index = session.runs.findLastIndex(run => run.itemIds.includes(item.id));
    if (index < 0) return false;
    const start = session.runs[index].messageIndex, end = session.runs[index + 1]?.messageIndex;
    return session.messages.slice(start, end).some(m => m.itemId === item.id && m.intake?.objectId === item.objectId);
  }
  function flowContent(flow) {
    return { ...flow, graph: Graph.semantic(Graph.graphFor(flow)) };
  }
  function requestHandoff(state, session, reason, items) {
    session.status = runtimeStatus(capacityState(state)); session.hadHandoff = true; session.queue = session.flow.queue; session.queuedAt ||= now();
    for (const item of items) { item.humanTouched = true; if (!['resolved', 'cancelled'].includes(item.status)) changeItem(item, 'needs_human', reason); }
    session.messages.push(makeMessage('system', handoffText(capacityState(state), session.queue, reason)));
  }
  function sendVisitor(state, id, query, options = {}) {
    const session = getSession(state, id), text = clean(query, '消息', 2000);
    assert(session.status !== 'ended', '会话已结束，请新建会话');
    if (session.status !== 'bot') {
      session.messages.push(makeMessage('user', text)); session.summary = text; return session;
    }
    const pendingItem = session.pendingItemId ? getItem(state, session.pendingItemId) : null;
    const result = simulate(text, { customerId: session.customerId, pendingItem, forceHandoff: Boolean(options.forceHandoff), runtime: capacityState(state) }, session.flow, state.knowledge);
    // 执行器校验成功后才写入本地会话，避免无效配置留下半次提交。
    const messageIndex = session.messages.length;
    session.messages.push(makeMessage('user', text)); session.summary = text;
    // 转人工是一项接待动作：有未完成事项时接续当前事项，不额外虚增一项人工需求。
    if (result.tasks.length === 1 && result.tasks[0].handoff && result.tasks[0].type === 'other') {
      const open = sessionItems(state, session).filter(i => !['resolved', 'cancelled'].includes(i.status));
      const current = open.find(i => i.id === session.pendingItemId) || open.at(-1);
      if (current) Object.assign(result.tasks[0], { pendingId: current.id, type: current.type, title: current.title, key: current.key, objectId: current.objectId, request: current.request });
    }
    const affected = result.tasks.map(task => {
      let item = task.pendingId ? getItem(state, task.pendingId) : sessionItems(state, session).find(i => i.key === task.key && i.objectId === (task.objectId || '') && !['resolved', 'cancelled'].includes(i.status));
      if (!item) item = newItem(state, session, task);
      item.objectId = task.objectId || item.objectId; item.key = task.key; item.title = task.title;
      if (task.evidence.length) item.evidence = clone(task.evidence);
      // 已存在的办理工单不能被后续问答覆盖为已完成。
      const open = item.tickets.some(tid => !['已完成', '已撤销'].includes(getTicket(state, tid).status) || getTicket(state, tid).disputed);
      if (!open) changeItem(item, task.status, '本轮处理结果');
      if (task.handoff) item.humanTouched = true;
      return item;
    });
    session.messages.push(...result.messages.map(m => ({ ...m, itemId: affected[m.taskIndex]?.id })));
    if (result.tasks.some(t => t.handoff)) {
      session.status = result.status; session.hadHandoff = true; session.queue = result.queue || session.flow.queue; session.queuedAt ||= now();
    }
    const clarifying = sessionItems(state, session).filter(i => i.status === 'clarifying' && ['order', 'aftersales'].includes(i.type));
    session.pendingItemId = clarifying.find(i => i.id === session.pendingItemId)?.id || clarifying[0]?.id || '';
    session.pendingOrder = Boolean(session.pendingItemId);
    const run = { id: uid(state, 'RUN'), time: now(), version: session.flow.version, itemIds: affected.map(i => i.id), messageIndex, trace: result.trace };
    session.runs.push(run);
    for (const problem of result.issues) {
      session.lastIssue = problem.type;
      state.issues.unshift({ id: uid(state, 'QA'), sessionId: id, itemId: affected[problem.taskIndex]?.id, runId: run.id, messageIndex, time: now(), status: '待复核', review: '', ...problem });
    }
    return session;
  }
  function setRuntime(state, patch, reason) {
    const next = { ...state.runtime, ...patch, reason: clean(reason, '运行状态变更原因', 300) };
    assert(['online', 'busy', 'offline'].includes(next.humanMode), '人工运行状态无效');
    assert(Number.isInteger(next.capacity) && next.capacity >= 1 && next.capacity <= 10, '演示接待容量为 1–10');
    assert(typeof next.toolEnabled === 'boolean', '工具开关无效');
    state.runtime = next; audit(state, 'runtime', 'service', next.reason, { configuration: clone(next) });
    for (const s of state.sessions) {
      if (s.status === 'human' && next.humanMode === 'offline') {
        const former = s.owner; s.owner = ''; s.status = 'offline';
        s.messages.push(makeMessage('system', `${former}已不可用，当前转为离线留单。已发消息和原工单保留；不会由机器人代办售后。`));
        sessionItems(state, s).filter(i => !['resolved', 'cancelled'].includes(i.status)).forEach(i => changeItem(i, 'needs_human', '原坐席不可用，重新分派'));
      } else if (['waiting', 'offline'].includes(s.status)) s.status = runtimeStatus(next);
    }
    return next;
  }
  function takeover(state, id, operator = state.operator) {
    const s = getSession(state, id), runtime = capacityState(state);
    assert(['waiting', 'offline'].includes(s.status), '只有待接管或离线留言可以接管；请刷新当前处理权');
    assert(runtime.humanMode !== 'offline', '人工已离线，请先恢复在线状态');
    assert(!runtime.full, '人工接待容量已满，请先释放容量或留单');
    assert(state.agents.includes(operator), '请选择有效坐席');
    s.status = 'human'; s.owner = operator; s.hadHandoff = true;
    sessionItems(state, s).forEach(i => { if (!['resolved', 'cancelled'].includes(i.status)) i.humanTouched = true; });
    s.messages.push(makeMessage('system', `${operator}已接入，接下来由人工为你服务。`));
    audit(state, 'takeover', id, '坐席接管会话', { owner: operator });
  }
  function sendAgent(state, id, query, operator = state.operator) {
    const s = getSession(state, id), text = clean(query, '回复', 2000);
    assert(s.status === 'human' && s.owner === operator, '请先取得此会话接管权；其他坐席仅可查看');
    s.messages.push(makeMessage('agent', text, { agentName: operator }));
    s.summary = text;
  }
  function resumeBot(state, id) {
    const s = getSession(state, id);
    assert(['waiting', 'offline'].includes(s.status), '当前会话不能取消人工请求');
    s.status = 'bot'; s.owner = '';
    s.messages.push(makeMessage('system', '已取消当前排队，可以咨询其他问题。尚未解决的人工事项与工单仍保留，不会自动办理。'));
  }
  function canConfirmItem(state, item) {
    if (item.status !== 'awaiting_confirmation' || !item.evidence.length) return false;
    if (item.tickets.some(id => { const t = getTicket(state, id); return !['已完成', '已撤销'].includes(t.status) || t.disputed; })) return false;
    if (item.type === 'knowledge') return item.evidence.some(ev => {
      if (ev.kind === 'knowledge') return state.knowledge.some(k => k.id === ev.id && isKnowledgeActive(k));
      if (ev.kind !== 'ticket-result' || !item.tickets.includes(ev.ticketId)) return false;
      const t = getTicket(state, ev.ticketId);
      return t.itemId === item.id && t.status === '已完成' && !t.disputed && Boolean(t.resultEvidence) && ev.evidence === t.resultEvidence;
    });
    return true;
  }
  function confirmItem(state, id) {
    const item = getItem(state, id);
    assert(canConfirmItem(state, item), '此事项尚不能确认解决：需结果依据、全部关联工单完成，且没有待核异议');
    changeItem(item, 'resolved', '客户明确确认', '客户'); item.resolvedAt = now(); item.confirmation = '客户明确确认';
    for (const sid of item.sessionIds) getSession(state, sid).messages.push(makeMessage('system', `${item.title} · 客户确认这项已解决，其他事项保持原状态。`, { itemId: id }));
    return item;
  }
  function canResolve(session, state) {
    if (!state) return false; // 禁止仅凭最后一条消息判断整段服务解决。
    const items = sessionItems(state, session);
    return items.length > 0 && items.every(i => i.status === 'resolved' || canConfirmItem(state, i));
  }
  function finish(state, id, by) {
    const s = getSession(state, id);
    assert(s.status !== 'ended', '会话已经结束');
    assert(['customer', 'agent', 'visitor'].includes(by), '结束方式无效');
    if (by === 'agent') assert(s.status === 'human' && s.owner === state.operator, '请先接管会话再结束');
    if (by === 'customer') { assert(canResolve(s, state), '当前会话尚不能确认全部解决'); sessionItems(state, s).filter(i => i.status !== 'resolved').forEach(i => confirmItem(state, i.id)); }
    s.status = 'ended'; s.owner = ''; s.resolution = by;
    s.messages.push(makeMessage('system', '本次咨询已结束。事项和工单按各自进度继续处理，结束聊天不计为问题解决。'));
  }
  function resumeItem(state, sessionId, itemId) {
    const s = getSession(state, sessionId), i = getItem(state, itemId);
    assert(s.itemIds.includes(itemId), '事项不属于当前会话');
    assert(s.status === 'bot', '请在机器人接待时继续采集，或由人工接续');
    if (i.status === 'clarifying') {
      s.pendingItemId = i.id; s.pendingOrder = true;
      s.messages.push(makeMessage('bot', `继续${i.title}，请补充订单号；之前的提问和资料仍保留。`, { itemId }));
    } else if (i.type === 'aftersales' && !i.tickets.length) {
      s.messages.push(makeMessage('bot', '请在此事项下填写并确认售后申请。尚未创建工单或执行退款。', { itemId, intake: { objectId: i.objectId } }));
    } else requestHandoff(state, s, '继续处理未完成事项', [i]);
  }
  function needHelp(state, itemId, reason = '客户反馈仍需帮助') {
    const item = getItem(state, itemId);
    const completed = item.tickets.map(id => getTicket(state, id)).filter(t => t.status === '已完成');
    if (completed.length) { completed.forEach(t => { if (!t.disputed) disputeTicket(state, t.id, reason); }); return item; }
    item.humanTouched = true; changeItem(item, 'needs_human', reason, '客户');
    const latest = [...item.sessionIds].reverse().map(id => getSession(state, id)).find(s => s.status !== 'ended');
    if (latest && latest.status !== 'human') requestHandoff(state, latest, reason, [item]);
    return item;
  }
  function sessionSummary(session, state) {
    const clip = (text, n) => length(text) > n ? Array.from(String(text)).slice(0, n - 6).join('') + '…（节选）' : String(text);
    const users = session.messages.filter(m => m.role === 'user');
    const ids = [...new Set(users.flatMap(m => m.text.match(/\bSO[A-Z0-9]+\b/gi) || []).map(id => id.toUpperCase()))];
    const answer = [...session.messages].reverse().find(m => m.role === 'agent' || m.citation || m.order);
    const steps = session.runs.flatMap(r => r.trace.filter(t => ['knowledge', 'order', 'intake'].includes(t.type || t.node)));
    const latest = steps.at(-1), history = [...new Set(steps.filter(t => ['error', 'warning'].includes(t.status)).map(t => t.detail))].slice(-3);
    const summary = [
      `最初问题：${clip(users[0]?.text || '尚未提问', 160)}`,
      `最近补充：${users.slice(-3).map(m => clip(m.text, 100)).join(' / ') || '无'}`,
      `订单线索：${ids.slice(-4).join('、') || '未提供'}`,
      `已有答复：${clip(answer?.text || '尚无业务答案', 300)}`,
      `最近业务处理：${latest ? clip(latest.label + ' · ' + latest.detail, 160) : '无'}`,
      `历史异常：${history.map(h => clip(h, 100)).join(' / ') || '无'}`,
      state ? `当前事项：${sessionItems(state, session).map(i => i.id + ' ' + i.title + '（' + itemNames[i.status] + '）').join('；')}` : '',
      `关联工单：${session.tickets.join('、') || '无'}`,
      `当前接待：${session.status}；流程 v${session.flow.version}。摘要之外请查看完整会话。`
    ].filter(Boolean).join('\n');
    return clip(summary, 1800);
  }
  function createTicket(state, values) {
    const title = clean(values.title, '工单标题', 80), description = clean(values.description, '问题描述', 2000);
    assert(['售后服务', '订单物流', '知识咨询', '其他问题'].includes(values.category), '请选择有效的工单类型');
    assert(['普通', '较高', '紧急'].includes(values.priority), '请选择有效的优先级');
    const s = values.sessionId ? getSession(state, values.sessionId) : null;
    const requestFingerprint = JSON.stringify({ sessionId: values.sessionId || '', itemId: values.itemId || '', title, description, objectId: values.objectId || '', category: values.category, priority: values.customerSubmitted ? '普通' : values.priority, customerSubmitted: Boolean(values.customerSubmitted) });
    if (values.requestKey) {
      const previous = state.tickets.find(t => t.requestKey === values.requestKey);
      if (previous) { assert(previous.requestFingerprint === requestFingerprint, '提交标识冲突：同一提交标识不能用于不同内容'); return previous; }
    }
    let item = values.itemId ? getItem(state, values.itemId) : null;
    if (s && item) assert(s.itemIds.includes(item.id) && s.customerId === item.customerId, '归属事项与当前会话不一致');
    if (s && !item) {
      const open = sessionItems(state, s).filter(i => !['resolved', 'cancelled'].includes(i.status));
      assert(open.length <= 1, '当前有多个未完成事项，请明确选择工单归属事项');
      item = open[0];
    }
    if (item) {
      assert(!['resolved', 'cancelled'].includes(item.status), '已结束的事项需先反馈仍需帮助，再继续受理');
      const duplicate = item.tickets.map(id => getTicket(state, id)).find(t => !['已完成', '已撤销'].includes(t.status) || t.disputed);
      assert(!duplicate, `该事项已有未完成工单 ${duplicate?.id || ''}，请查看已有进度，不重复提交`);
    }
    const objectId = clean(values.objectId || item?.objectId, '订单线索', 80, false);
    if (values.customerSubmitted && (item?.type === 'aftersales' || values.category === '售后服务')) {
      assert(canSelfIntake(s, item), '此会话未开放自助售后受理，请由客服协助登记');
      assert(!s.flow.graph || objectId === item.objectId, '订单号已变更，请回到咨询窗口按新订单重新申请后再提交');
    }
    if (item?.type === 'aftersales' || values.category === '售后服务') assert(objectId || !values.customerSubmitted, '请补充订单号；不清楚订单号时可转人工核实');
    if (!item) item = newItem(state, s, { type: values.category === '售后服务' ? 'aftersales' : 'other', key: 'manual:' + title, title, request: description, objectId });
    if (objectId && item.objectId && objectId !== item.objectId) {
      item.history.push({ time: now(), fromObject: item.objectId, toObject: objectId, reason: '受理确认时更正订单线索，旧查询结果不再作为依据', actor: values.customerSubmitted ? '客户' : state.operator });
      item.evidence = [];
    }
    if (objectId) item.objectId = objectId;
    const ticket = { id: uid(state, 'TK'), itemId: item.id, title, description, objectId, requestFingerprint, requestKey: values.requestKey || '', customerSubmitted: Boolean(values.customerSubmitted), category: values.category, priority: values.customerSubmitted ? '普通' : values.priority, sessionId: s?.id || '', owner: '', status: '待分配', created: now(), disputed: false, resultEvidence: '', publicResult: '', history: [{ time: now(), text: '已受理处理需求，等待分配；尚未完成实际办理', internalNote: '', evidence: '' }] };
    state.tickets.unshift(ticket); item.tickets.push(ticket.id); item.objectId ||= objectId; item.humanTouched = true; changeItem(item, 'needs_human', '已受理工单，待分配处理');
    if (s) { s.tickets.push(ticket.id); s.messages.push(makeMessage('system', `已受理工单 ${ticket.id}：${title}。客服将继续核实处理，请在工单中查看进度。`, { ticketId: ticket.id, itemId: item.id })); }
    audit(state, 'ticket-created', ticket.id, '确认后受理', { itemId: item.id });
    return ticket;
  }
  const transitions = { '待分配': ['处理中', '已撤销'], '处理中': ['待客户补充', '已完成', '待分配', '已撤销'], '待客户补充': ['处理中', '待分配', '已撤销'], '已完成': [], '已撤销': [] };
  function ticketMessage(state, ticket, text) {
    const item = getItem(state, ticket.itemId);
    for (const sid of item.sessionIds) {
      const s = getSession(state, sid); if (!s.tickets.includes(ticket.id)) s.tickets.push(ticket.id);
      s.messages.push(makeMessage('system', `工单 ${ticket.id} · ${text}`, { ticketId: ticket.id, itemId: item.id }));
    }
  }
  function advanceTicket(state, id, status, owner, note = '', extra = {}) {
    const t = getTicket(state, id), item = getItem(state, t.itemId);
    assert(transitions[t.status]?.includes(status), '不支持该状态变更');
    assert(!t.disputed, '请先复核工单异议');
    const nextOwner = status === '待分配' ? '' : String(owner || t.owner || '').trim();
    if (!['已撤销', '待分配'].includes(status)) assert(state.agents.includes(nextOwner), '请先指定有效负责人');
    const detail = clean(note, '客户可见处理说明', 1000, ['待客户补充', '已完成', '已撤销', '待分配'].includes(status));
    const internalNote = clean(extra.internalNote, '内部备注', 1000, false);
    const evidence = clean(extra.evidence, '结果证据', 1000, status === '已完成');
    const old = t.status; t.owner = nextOwner; t.status = status;
    t.history.push({ time: now(), text: `${status}${detail ? '：' + detail : ''}`, internalNote, evidence, operator: state.operator, from: old });
    if (status === '已完成') {
      t.resultEvidence = evidence; t.publicResult = detail;
      item.evidence.push({ kind: 'ticket-result', ticketId: id, evidence, publicResult: detail, time: now(), operator: state.operator });
      const others = item.tickets.map(id => getTicket(state, id)).filter(x => !['已完成', '已撤销'].includes(x.status) || x.disputed);
      changeItem(item, others.length ? 'needs_human' : 'awaiting_confirmation', '工单处理完成，需核验并确认事项结果');
    } else if (status === '已撤销') {
      // 只撤销此执行记录，不替客户撤销原需求。
      changeItem(item, 'needs_human', '工单已撤销，原事项仍需确认处理去向');
    } else changeItem(item, status === '待客户补充' ? 'needs_customer' : status === '待分配' ? 'needs_human' : 'processing', '工单状态更新');
    ticketMessage(state, t, t.history.at(-1).text);
    return t;
  }
  function addTicketReply(state, id, text) {
    const t = getTicket(state, id), detail = clean(text, '补充说明', 1000);
    assert(t.status === '待客户补充', '此工单当前不需要补充材料');
    t.status = t.owner && state.runtime.humanMode !== 'offline' ? '处理中' : '待分配';
    if (t.status === '待分配') t.owner = '';
    t.history.push({ time: now(), text: `客户补充：${detail}；已转回${t.status}`, internalNote: '', evidence: '' });
    changeItem(getItem(state, t.itemId), t.status === '处理中' ? 'processing' : 'needs_human', '客户补充已提交，重新检查负责人可用性');
    ticketMessage(state, t, t.history.at(-1).text); return t;
  }
  function disputeTicket(state, id, reason) {
    const t = getTicket(state, id), item = getItem(state, t.itemId), detail = clean(reason, '异议说明', 1000);
    assert(t.status === '已完成' && !t.disputed, '仅已完成且无待核异议的工单可以提出异议');
    const pending = item.tickets.map(id => getTicket(state, id)).find(other => other.disputed);
    t.disputeSnapshot = pending ? clone(pending.disputeSnapshot) : { itemStatus: item.status, resolvedAt: item.resolvedAt, confirmation: item.confirmation, reopenedTicketIds: [] };
    t.disputed = true; t.disputeReason = detail;
    t.history.push({ time: now(), text: `客户提出未解决异议：${detail}；已进入复核`, internalNote: '', evidence: '' });
    item.humanTouched = true; changeItem(item, 'needs_human', '已完成工单收到未解决异议，立即重开事项', '客户');
    ticketMessage(state, t, '异议待核，原事项已回到待人工'); return t;
  }
  function reviewDispute(state, id, decision, reason, evidence) {
    const t = getTicket(state, id), item = getItem(state, t.itemId);
    assert(t.disputed && t.status === '已完成', '没有待核异议');
    assert(['reopen', 'dismiss'].includes(decision), '请选择重开或维持原结果');
    const detail = clean(reason, '复核说明', 1000), proof = clean(evidence, '复核证据', 1000);
    if (decision === 'reopen') {
      for (const other of item.tickets.map(id => getTicket(state, id)).filter(other => other.disputed)) {
        other.disputeSnapshot.reopenedTicketIds = [...new Set([...(other.disputeSnapshot.reopenedTicketIds || []), id])];
      }
      t.status = t.owner && state.runtime.humanMode !== 'offline' ? '处理中' : '待分配';
      if (t.status === '待分配') t.owner = '';
      changeItem(item, t.status === '处理中' ? 'processing' : 'needs_human', '异议成立，重开原工单');
    } else {
      const snapshot = t.disputeSnapshot;
      const otherOpen = item.tickets.map(id => getTicket(state, id)).some(x => x.id !== t.id && (!['已完成', '已撤销'].includes(x.status) || x.disputed));
      const reopened = (snapshot.reopenedTicketIds || []).map(id => getTicket(state, id));
      const restoredStatus = reopened.length ? (reopened.every(other => other.status === '已完成' && (!other.disputed || other.id === t.id)) ? 'awaiting_confirmation' : 'needs_human') : snapshot.itemStatus;
      changeItem(item, otherOpen ? 'needs_human' : restoredStatus, '经证据复核维持原结果');
      if (!otherOpen && restoredStatus === 'resolved') { item.resolvedAt = snapshot.resolvedAt; item.confirmation = snapshot.confirmation; }
    }
    t.disputed = false; t.history.push({ time: now(), text: `${decision === 'reopen' ? '异议成立，重开处理' : '维持原结果'}：${detail}`, evidence: proof, internalNote: '', operator: state.operator });
    ticketMessage(state, t, t.history.at(-1).text); return t;
  }
  const knowledgeFields = ['title', 'standardQuestion', 'keywords', 'answer', 'category', 'scope', 'source', 'owner', 'effectiveAt', 'expiresAt'];
  function knowledgeContent(k) { return Object.fromEntries(knowledgeFields.map(f => [f, k[f] || ''])); }
  function validateKnowledge(k) {
    clean(k.title, '知识标题', 80); clean(k.standardQuestion, '标准问题', 200); clean(k.answer, '标准答案', 2000);
    clean(k.source, '来源说明', 1000); clean(k.owner, '维护人', 80); clean(k.scope, '适用范围', 80); clean(k.category, '分类', 80);
    assert(words(k.keywords).length, '请填写匹配关键词'); clean(k.keywords, '关键词', 200);
    assert(Number.isFinite(Date.parse(k.effectiveAt)), '请填写有效的生效时间');
    assert(!k.expiresAt || Number.isFinite(Date.parse(k.expiresAt)) && Date.parse(k.expiresAt) > Date.parse(k.effectiveAt), '失效时间必须晚于生效时间');
  }
  function saveKnowledge(state, values) {
    let item = values.id ? state.knowledge.find(k => k.id === values.id) : null;
    if (values.id) assert(item, '知识条目不存在');
    const content = { ...(item ? knowledgeContent(item.draft || item) : {}), ...Object.fromEntries(knowledgeFields.filter(f => f in values).map(f => [f, String(values[f]).trim()])) };
    content.keywords = words(content.keywords).join(','); validateKnowledge(content);
    let linkedIssue = null;
    if (values.issueId) { linkedIssue = state.issues.find(q => q.id === values.issueId); assert(linkedIssue?.status === '已确认' && linkedIssue.remediation, '先确认质量问题、原因与责任人，再关联整改知识'); }
    if (item && item.status !== 'draft') {
      if (JSON.stringify(content) !== JSON.stringify(knowledgeContent(item))) item.draft = { ...content, version: item.version + 1 };
      else delete item.draft;
    } else if (item) Object.assign(item, content);
    else { item = { id: uid(state, 'KB'), ...content, version: 1, status: 'draft', history: [] }; state.knowledge.unshift(item); }
    item.updated = now();
    if (linkedIssue) { linkedIssue.remediation.knowledgeId = item.id; linkedIssue.remediation.status = '处理中'; delete linkedIssue.remediation.validation; }
    return item;
  }
  function candidateKnowledge(state, id) {
    return state.knowledge.map(k => k.id === id ? { ...k, ...(k.draft || {}), status: 'published' } : k);
  }
  function checkKnowledgeConflict(state, candidate) {
    const overlap = (a, b) => Date.parse(a.effectiveAt) < (b.expiresAt ? Date.parse(b.expiresAt) : Infinity) && Date.parse(b.effectiveAt) < (a.expiresAt ? Date.parse(a.expiresAt) : Infinity);
    assert(!state.knowledge.some(k => k.id !== candidate.id && k.status === 'published' && k.scope === candidate.scope && normalize(k.standardQuestion) === normalize(candidate.standardQuestion) && overlap(k, candidate)), '同范围、同标准问题已有生效区间重叠的发布内容，请修改原条目或处理冲突');
  }
  function fingerprint(flow, knowledge) {
    // 保存精确输入快照而非模型自评得分；用于判断结论是否仍对应当前配置。
    return JSON.stringify({ flow: flowContent(flow), knowledge: knowledge.map(k => ({ id: k.id, status: k.status, version: k.version, active: isKnowledgeActive(k), ...knowledgeContent(k) })).sort((a, b) => a.id.localeCompare(b.id)), sampleVersion: 'local-orders-v1', suiteVersion: 'service-invariants-v5' });
  }
  const citedIds = result => result.messages.map(m => m.citation?.id).filter(Boolean).join('、');
  function testCases(flow, knowledge, custom = [], baseline = null) {
    const cases = [], defaultContext = { customerId: 'DEMO-CUSTOMER', runtime: runtimeDefaults };
    const add = (id, query, check, expected, context = {}) => {
      try { const result = simulate(query, { ...defaultContext, ...context }, flow, knowledge), cited = citedIds(result); cases.push({ id, query, expected, pass: Boolean(check(result)), actual: result.tasks.map(t => `${itemTypes[t.type]} / ${itemNames[t.status]}`).join('；') + (cited ? ` · 引用 ${cited}` : ''), trace: result.trace }); }
      catch (err) { cases.push({ id, query, expected, pass: false, actual: err.message }); }
    };
    add('R01', '不要转人工，我只问退货规则', r => r.tasks.every(t => t.type === 'knowledge') && !r.trace.some(t => (t.type || t.node) === 'order'), '识别否定；不被人工/订单关键词劫持');
    add('R02', '没有订单号，想了解退货条件', r => r.tasks.every(t => t.type === 'knowledge') && !r.pendingOrder, '通用规则不索要订单号');
    add('R03', '帮我查订单', r => r.tasks.length === 1 && r.tasks[0].status === 'clarifying' && !r.messages.some(m => m.order), '缺参数先采集，不伪造卡片');
    add('R04', '查物流 SO20260926001，再申请退货', r => r.tasks.some(t => t.type === 'order') && r.tasks.some(t => t.type === 'aftersales' && t.status !== 'awaiting_confirmation'), '查询与办理拆成两个事项；办理不能被判完成');
    add('R05', '查询订单 SO20260926001', r => r.messages.some(m => m.order?.id === 'SO20260926001') || (r.tasks[0]?.handoff && ['waiting','offline'].includes(r.status)), '正常查询返回订单，或沿配置分支明确转人工承接');
    add('R06', '查询订单 SO00000000000', r => !r.messages.some(m => m.order) && !r.tasks.some(t => t.status === 'awaiting_confirmation'), '未知对象不生成结果');
    add('R07', '查物流 SO20260926001，再告诉我保温杯怎么清洗', r => r.tasks.some(t => t.type === 'order') && r.tasks.some(t => t.type === 'knowledge'), '多事项不遗漏知识咨询');
    add('R08', '需要人工', r => r.status === 'offline', '实时离线必须留单', { forceHandoff: true, runtime: { ...runtimeDefaults, humanMode: 'offline' } });
    add('R09', '查询订单 SO20260926001', r => !r.messages.some(m => m.order) && r.tasks[0]?.status === 'needs_human', '工具停用即时阻断旧流程查询', { runtime: { ...runtimeDefaults, toolEnabled: false } });
    add('R10', '查询订单 SO20260926001', r => !r.messages.some(m => m.order) && r.tasks[0]?.status === 'needs_human', '归属校验负例不泄露订单', { customerId: 'OTHER-DEMO-CUSTOMER' });
    for (const c of custom) add(c.id, c.query, r => r.messages.some(m => m.citation?.id === c.knowledgeId), `回答引用指定知识 ${c.knowledgeId}`);
    // 答案来源稳定性：回归问句和全部已发布 FAQ 的标准问题，改动前后必须引用同一知识，拦住新知识抢答或流程改动让存量 FAQ 失效。
    if (baseline) {
      const probes = new Set([...cases.filter(c => /^R\d+$/.test(c.id)).map(c => c.query), ...baseline.knowledge.filter(k => isKnowledgeActive(k)).map(k => k.standardQuestion)]);
      let n = 0;
      for (const query of probes) {
        let before = '';
        try { before = citedIds(simulate(query, defaultContext, baseline.flow, baseline.knowledge)); } catch { continue; }
        if (before) add(`S${String(++n).padStart(2, '0')}`, query, r => citedIds(r) === before, `改动前后仍引用 ${before}`);
      }
    }
    return cases;
  }
  function evaluationCurrent(state, record) {
    if (!record) return false;
    if (record.scope === 'flow') return record.fingerprint === fingerprint(state.draft, state.knowledge);
    if (record.scope === 'knowledge') return record.fingerprint === fingerprint(state.published, candidateKnowledge(state, record.knowledgeId));
    return record.fingerprint === fingerprint(state.published, state.knowledge);
  }
  function evaluateFlow(state) {
    validateFlow(state.draft);
    const cases = testCases(state.draft, state.knowledge, [], { flow: state.published, knowledge: state.knowledge });
    const record = { id: uid(state, 'TEST'), scope: 'flow', time: now(), fingerprint: fingerprint(state.draft, state.knowledge), passed: cases.every(c => c.pass), cases };
    state.flowValidation = record; state.evaluations.push(record); return record;
  }
  function evaluateKnowledge(state, id) {
    const k = state.knowledge.find(k => k.id === id); assert(k, '知识不存在');
    const candidate = candidateKnowledge(state, id), target = candidate.find(k => k.id === id);
    validateKnowledge(target); checkKnowledgeConflict(state, target);
    assert(isKnowledgeActive(target), '该内容尚未生效、已经过期或不在当前演示范围；不能作为当前发布测试依据');
    const custom = [{ id: 'K01', query: target.standardQuestion, knowledgeId: id }, ...state.issues.filter(q => q.remediation?.knowledgeId === id).map(q => ({ id: q.id, query: q.query || q.evidence, knowledgeId: id }))];
    const cases = testCases(state.published, candidate, custom, { flow: state.published, knowledge: state.knowledge });
    const record = { id: uid(state, 'TEST'), scope: 'knowledge', knowledgeId: id, time: now(), fingerprint: fingerprint(state.published, candidate), passed: cases.every(c => c.pass), cases };
    k.validation = record; state.evaluations.push(record); return record;
  }
  function flowChanged(state) { return JSON.stringify({ ...flowContent(state.draft), version: 0 }) !== JSON.stringify({ ...flowContent(state.published), version: 0 }); }
  function publishFlow(state, reason = '') {
    validateFlow(state.draft); assert(flowChanged(state), '流程没有修改，无需重复发布');
    assert(state.flowValidation?.passed && state.flowValidation.fingerprint === fingerprint(state.draft, state.knowledge), '当前草稿尚未通过完整回归，或配置/知识已变化，请重新运行发布回归');
    const note = clean(reason || state.rollbackReason || '服务流程更新', '发布说明', 300);
    const validationId = state.flowValidation.id;
    state.published = clone({ ...state.draft, version: state.published.version + 1 }); state.draft = clone(state.published);
    state.releases.push({ version: state.published.version, time: now(), reason: note, operator: state.operator, validationId, config: clone(state.published) });
    state.rollbackReason = ''; state.flowValidation = null;
    audit(state, 'flow-publish', String(state.published.version), note, { validationId }); return state.published.version;
  }
  function prepareRollback(state, version) {
    const old = state.releases.find(r => r.version === Number(version)); assert(old, '历史发布版本不存在');
    state.draft = { ...clone(old.config), version: state.published.version }; state.rollbackReason = `回滚至 v${version} 的配置`;
    state.flowValidation = null; ensureGraphState(state); return state.draft;
  }
  function publishKnowledge(state, id) {
    const item = state.knowledge.find(k => k.id === id); assert(item, '知识不存在');
    assert(item.status !== 'published' || item.draft, '知识没有待发布修改');
    const candidate = candidateKnowledge(state, id), target = candidate.find(k => k.id === id);
    validateKnowledge(target); checkKnowledgeConflict(state, target);
    assert(isKnowledgeActive(target), '知识当前不在生效区间或适用范围');
    assert(item.validation?.passed && item.validation.fingerprint === fingerprint(state.published, candidate), '当前知识未通过匹配的草稿回归，或知识/流程已改变，请重新测试');
    const testId = item.validation.id;
    if (item.status === 'published' || item.history.length) item.history.push({ ...knowledgeContent(item), version: item.version, status: item.status, time: now() });
    if (item.draft) { Object.assign(item, item.draft); delete item.draft; }
    item.status = 'published'; item.updated = now(); item.publishedTest = testId;
    audit(state, 'knowledge-publish', id, `发布 v${item.version}`, { testId }); return item;
  }
  function disableKnowledge(state, id, reason) {
    const k = state.knowledge.find(k => k.id === id); assert(k?.status === 'published', '当前知识不在发布状态');
    k.disabledReason = clean(reason, '停用原因', 300); k.status = 'disabled'; k.updated = now();
    audit(state, 'knowledge-disabled', id, k.disabledReason);
    return k;
  }
  function citationStatus(state, citation) {
    const k = state.knowledge.find(k => k.id === citation.id);
    if (!k || !isKnowledgeActive(k)) return '原知识已停用、过期或不再适用，请重新核实；历史原文保留';
    return k.version !== citation.version ? `历史引用 v${citation.version}；当前已更新至 v${k.version}` : '回答时引用的知识快照';
  }
  function reviewIssue(state, id, values) {
    const q = state.issues.find(q => q.id === id); assert(q, '问题不存在');
    assert(['待复核', '已确认', '已排除', '信息不足'].includes(values.status), '复核状态无效');
    const review = clean(values.review, '复核依据', 1000);
    if (q.remediation?.status === '已关闭') assert(values.status === '已确认', '已关闭整改不能通过修改线索结论撤销，请保留原记录');
    let remediation = q.remediation;
    if (values.status === '已确认') {
      const owner = clean(values.owner || remediation?.owner, '整改责任人', 80), cause = clean(values.cause || remediation?.cause, '根因判断', 300);
      remediation = { ...(remediation || {}), owner, cause, status: remediation?.status || '处理中', scope: '知识服务问题' };
    }
    q.status = values.status; q.review = review; q.reviewer = state.operator; q.reviewedAt = now(); q.remediation = remediation;
    audit(state, 'issue-review', id, review, { verdict: q.status }); return q;
  }
  function verifyRemediation(state, id) {
    const q = state.issues.find(q => q.id === id); assert(q?.status === '已确认' && q.remediation, '请先确认问题并分派责任人');
    const k = state.knowledge.find(k => k.id === q.remediation.knowledgeId);
    assert(k && isKnowledgeActive(k) && !k.draft, '本版仅验收知识类整改：请先关联并发布修订知识，不能有未发布草稿');
    const cases = testCases(state.published, state.knowledge, [{ id: 'ORIGINAL', query: q.query || q.evidence, knowledgeId: k.id }]);
    const record = { id: uid(state, 'VERIFY'), time: now(), fingerprint: fingerprint(state.published, state.knowledge), knowledgeId: k.id, version: k.version, passed: cases.every(c => c.pass), cases };
    q.remediation.validation = record; q.remediation.status = record.passed ? '待验收' : '处理中';
    state.evaluations.push(record); return record;
  }
  function closeRemediation(state, id, acceptance) {
    const q = state.issues.find(q => q.id === id), r = q?.remediation;
    assert(q?.status === '已确认' && r?.status === '待验收' && r.validation?.passed, '缺少已发布整改措施及匹配的验证记录，不能关闭');
    assert(r.validation.fingerprint === fingerprint(state.published, state.knowledge), '验证后配置或知识已变化，请重新验证');
    r.acceptance = clean(acceptance, '验收说明', 1000); r.acceptedBy = state.operator; r.closedAt = now(); r.status = '已关闭';
    audit(state, 'remediation-closed', id, r.acceptance, { validationId: r.validation.id, scope: '知识与服务流程回归' }); return q;
  }
  function metrics(state) {
    const resolved = state.items.filter(i => i.status === 'resolved');
    return { total: state.sessions.length, itemTotal: state.items.length, confirmed: resolved.length, unassistedConfirmed: resolved.filter(i => !i.humanTouched).length, pendingItems: state.items.filter(i => !['resolved', 'cancelled'].includes(i.status)).length, awaiting: state.items.filter(i => i.status === 'awaiting_confirmation').length, waiting: state.sessions.filter(s => s.status === 'waiting').length, tickets: state.tickets.filter(t => !['已完成', '已撤销'].includes(t.status) || t.disputed).length, knowledge: state.knowledge.filter(k => isKnowledgeActive(k)).length, issues: state.issues.filter(q => ['待复核', '信息不足'].includes(q.status)).length, corrections: state.issues.filter(q => q.status === '已确认' && q.remediation?.status !== '已关闭').length };
  }
  function newState(options = {}) {
    const state = { schema: 3, counter: 100, operator: '客服小林', agents: ['客服小林', '客服小周'], runtime: clone(runtimeDefaults), robot: { name: '青禾小助', greeting: '你好，我是青禾小助。你可以咨询商品与服务规则、查询订单，或提交售后问题。需要人工时会带上当前信息转接。请勿提供密码、验证码或完整银行卡信息。', description: '青禾生活 · 在线服务' }, draft: clone(defaults), published: clone(defaults), sessions: [], items: [], tickets: [], issues: [], audit: [], evaluations: [], releases: [{ version: 1, time: now(), reason: '初始接待流程', operator: '系统', validationId: 'seed', config: clone(defaults) }], knowledge: [
      { id: 'KB001', title: '七天无理由退货规则', standardQuestion: '七天无理由退货有什么条件？', category: '售后政策', keywords: '退货,无理由,七天,退款,规则,条件,政策', answer: '签收后七天内，商品未使用且包装与配件完整，可登记退货申请。定制商品不适用此规则。具体资格与处理结果由客服结合订单核实。', status: 'published', version: 2 },
      { id: 'KB002', title: '商品材质与日常保养', standardQuestion: '保温杯怎么清洗？', category: '产品知识', keywords: '材质,保温杯,保养,清洗', answer: '保温杯采用不锈钢内胆，建议使用软布和中性清洁剂清洗。首次使用前请充分清洁，避免放入微波炉加热。', status: 'published', version: 1 },
      { id: 'KB003', title: '服务时间与人工支持', standardQuestion: '服务时间是几点？', category: '通用服务', keywords: '服务时间,营业时间,几点', answer: '人工服务时间为每天 09:00–21:00，是否在线以当前接待状态为准。你可以随时提交问题，并在咨询窗口查看处理进度。', status: 'published', version: 1 },
      { id: 'KB004', title: '会员积分使用说明', standardQuestion: '会员积分怎么使用？', category: '会员权益', keywords: '积分,会员', answer: '积分抵扣范围以会员活动规则为准，相关问题可联系人工客服核实。', status: 'draft', version: 1 },
      { id: 'KB005', title: '历史活动规则', standardQuestion: '周年庆活动是什么？', category: '活动规则', keywords: '周年庆,活动', answer: '历史活动已结束，请关注最新公告。', status: 'disabled', version: 1 }
    ] };
    state.knowledge.forEach(k => Object.assign(k, { scope: '青禾生活', source: `青禾生活客服知识库 / ${k.category}`, owner: '客服运营', effectiveAt: '2026-01-01T00:00:00.000Z', expiresAt: '', updated: now(), history: [] }));
    if (options.seed === false) return state;
    let s = newSession(state, '陈一诺', { sample: true }); sendVisitor(state, s.id, '七天无理由退货有什么条件？'); confirmItem(state, s.itemIds[0]); finish(state, s.id, 'visitor');
    s = newSession(state, '周安', { sample: true }); sendVisitor(state, s.id, '保温杯怎么清洗？'); confirmItem(state, s.itemIds[0]); finish(state, s.id, 'visitor');
    s = newSession(state, '许晨', { sample: true }); sendVisitor(state, s.id, '帮我查订单 SO20260926002');
    s = newSession(state, '林沐', { sample: true }); sendVisitor(state, s.id, '我要申请退货 SO20260926001');
    const t = createTicket(state, { title: '包裹外盒破损核实', category: '售后服务', priority: '普通', description: '客户反馈外盒破损，需客服核对商品情况与后续处理方式。', sessionId: s.id, itemId: s.itemIds[0] });
    advanceTicket(state, t.id, '处理中', '客服小林');
    s = newSession(state, '苏语', { sample: true }); sendVisitor(state, s.id, '礼品卡可以分多次使用吗？');
    return state;
  }
  const api = { Graph, ensureGraphState, canSelfIntake, clone, now, words, defaults, orders, length, clean, uid, makeMessage, itemNames, itemTypes, runtimeDefaults, newState, newSession, getSession, getItem, getTicket, sessionItems, minKeywordHits: MIN_KEYWORD_HITS, findKnowledge, isKnowledgeActive, simulate, planRequests, sendVisitor, capacityState, setRuntime, takeover, sendAgent, finish, canResolve, canConfirmItem, confirmItem, resumeBot, resumeItem, needHelp, sessionSummary, createTicket, transitions, advanceTicket, addTicketReply, disputeTicket, reviewDispute, validateFlow, flowChanged, publishFlow, prepareRollback, saveKnowledge, publishKnowledge, disableKnowledge, citationStatus, evaluateFlow, evaluateKnowledge, evaluationCurrent, fingerprint, reviewIssue, verifyRemediation, closeRemediation, metrics };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CustomerDemo = api;
})(typeof window !== 'undefined' ? window : this);
