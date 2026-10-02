/* Pure domain commands. Local role checks model behavior; they are NOT server authorization. */
(function (root) {
  'use strict';
  const Copy = typeof module !== 'undefined' && module.exports ? require('./copy.js') : root.SupportCopy;
  const copy = x => JSON.parse(JSON.stringify(x));
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const text = (v, label, max = 2000) => {
    assert(typeof v === 'string', `请填写${label}`);
    const s = v.trim(); assert(s.length > 0 && s.length <= max, `${label}须为 1–${max} 字`); return s;
  };
  const uid = (s, prefix) => `${prefix}${String(++s.sequence).padStart(5, '0')}`;
  const get = (s, table, id) => { const x = s[table].find(v => v.id === id); assert(x, '记录不存在，请刷新后重试'); return x; };
  const normalize = s => String(s || '').toLowerCase().replace(/[\s，,。.!！?？]/g, '');
  const split = s => [...new Set(String(s).split(/[,，\n]/).map(x => x.trim()).filter(Boolean))];
  const roles = {
    customer: ['newConversation', 'say', 'requestHuman', 'cancelQueue', 'feedback', 'createTicket', 'supplement', 'closeConversation'],
    agent: ['claimConversation', 'reply', 'note', 'completeCase', 'closeConversation', 'createTicket', 'claimTicket', 'updateTicket', 'flag', 'presence'],
    manager: ['assignTicket', 'assignConversation', 'reviewGap', 'acceptGap', 'serviceSettings'],
    operator: ['saveKnowledge', 'testKnowledge', 'publishKnowledge', 'disableKnowledge', 'saveFlow', 'testFlow', 'publishFlow', 'linkGap'],
    admin: ['export']
  };
  function actor(s, who) {
    assert(who && typeof who.id === 'string', '缺少操作者');
    if (who.role === 'customer') { get(s, 'customers', who.id); return {id: who.id, role: 'customer', name: get(s, 'customers', who.id).name, teams: []}; }
    const a = get(s, 'staff', who.id); assert(a.role === who.role, '操作者角色不匹配'); return a;
  }
  function owns(a, record) { assert(a.role === 'customer' && record.customerId === a.id, '无权访问这条客户记录'); }
  const within = (a, r) => a.teams?.includes(r.teamId);
  function agentOwns(a, r) { assert(a.role === 'agent' && r.ownerId === a.id && within(a, r), '请先领取本人有权处理的任务'); }
  function managing(a, r) { assert(a.role === 'manager' && within(a, r), '不在授权管理范围内'); }
  const activeTicket = (s, c) => s.tickets.find(t => t.caseId === c.id && t.status !== 'done');
  const activeArticles = (s, now) => s.knowledge.filter(k => k.live && !k.disabled && Date.parse(k.live.effectiveAt) <= now && (!k.live.expiresAt || now < Date.parse(k.live.expiresAt)));
  function retrieve(s, query, now = Date.now()) {
    const q = normalize(query);
    const candidates = activeArticles(s, now).map(k => {
      const exact = q.includes(normalize(k.live.question));
      const hits = k.live.keywords.filter(w => q.includes(normalize(w))).length;
      return {k, exact, hits};
    }).filter(x => x.exact || x.hits >= 2).sort((a, b) => Number(b.exact) - Number(a.exact) || b.hits - a.hits);
    if (!candidates.length) return null;
    const first = candidates[0];
    if (candidates.some(x => x !== first && x.exact === first.exact && x.hits === first.hits && x.k.live.answer !== first.k.live.answer)) return {conflict: true};
    return {id: first.k.id, ...copy(first.k.live)};
  }
  function intentions(query, config) {
    const lower = query.toLowerCase();
    const declined = lower.replace(/人工(?:智能|费|成本)/g, '').replace(/(?:不需要|不要|不用|不想|无需|别)(?:帮我|给我|再|先)?(?:转接|转|找|联系)?人工(?:客服)?/g, '').replace(/人工(?:客服)?(?:就|先)?(?:不用|不要|不需要)了?/g, '');
    const human = config.humanWords.some(w => declined.includes(w.toLowerCase()));
    const id = query.match(/\bSO[A-Z0-9]+\b/i)?.[0].toUpperCase() || '';
    const onlyId = /^(?:订单号[是为：:]?\s*)?SO[A-Z0-9]+[。！!]?$/i.test(query.trim());
    const policy = /(规则|条件|政策|无理由|如何退|怎么退|退货运费|了解)/.test(query) && /(退|售后)/.test(query);
    const negatedReturn = /(不要|不想|不需要|暂不|先不).{0,6}(退货|退款|换货|申请)/.test(query);
    const intake = !negatedReturn && (/(申请|办理).{0,6}(退货|退款|换货|售后)/.test(query) || /(想|要|需要|帮我)(退货|退款|换货)/.test(query));
    const lookup = !/(不查|不要查)/.test(query) && (/(查|看|查询|到哪|在哪|进度).{0,8}(订单|物流|快递)/.test(query) || /(订单|物流|快递).{0,8}(到哪|在哪|进度|状态)/.test(query) || /^(订单|物流|快递)$/.test(query.trim()));
    return {human, id, onlyId, policy, intake, lookup};
  }
  function classify(s, query, customerId, now = Date.now(), config = s.flow.live, options = {}) {
    const p = intentions(query, config);
    if (p.human) return [{kind: 'handoff', reason: '客户要求人工协助'}];
    const orderIds = new Set((query.match(/\bSO[A-Z0-9]+\b/gi) || []).map(id => id.toUpperCase()));
    if (orderIds.size > 1) return [{kind: 'handoff', reason: '同时涉及多个订单，需要逐项核实对应诉求'}];
    const results = [];
    if (p.lookup || p.onlyId) {
      const order = p.id && s.orders.find(o => o.id === p.id && o.customerId === customerId);
      results.push(!p.id ? {kind: 'askOrder'} : !order ? {kind: 'orderDenied'} : options.orderFailure ? {kind: 'orderFailure'} : {kind: 'order', order: copy(order)});
    }
    if (p.intake) results.push({kind: config.intakeEnabled ? 'intake' : 'handoff', orderId: p.id, reason: '售后申请需要人工受理'});
    if (p.policy || !results.length) {
      const question = p.policy ? query.split(/[，,。；;]/).find(x => /(规则|条件|政策|无理由|如何退|怎么退|退货运费)/.test(x)) || query : query;
      const knowledge = retrieve(s, question, now);
      results.push(knowledge?.conflict ? {kind: 'conflict'} : knowledge ? {kind: 'answer', knowledge} : {kind: 'gap'});
    }
    return results;
  }
  function event(s, a, type, target, detail, now) { s.events.push({id: uid(s, 'EV'), at: now, actorId: a.id, actor: a.name, type, target, detail}); }
  function message(s, conv, role, body, now, extra = {}) { conv.messages.push({id: uid(s, 'MSG'), role, body, at: now, visibility: 'public', ...extra}); conv.updatedAt = now; }
  function makeConversation(s, customerId, now) {
    const c = {id: uid(s, 'CV'), customerId, teamId: 'service', state: 'bot', ownerId: '', ownerHistory: [], caseIds: [], messages: [], runs: [], createdAt: now, updatedAt: now, flow: copy(s.flow.live), waitingSince: null, firstHumanAt: null, pendingCaseId: '', handoffReason: ''};
    s.conversations.unshift(c);
    message(s, c, 'bot', Copy.greeting, now);
    return c;
  }
  function makeCase(s, conv, kind, title, orderId, now) {
    let c = kind === 'aftersales' && orderId ? s.cases.find(x => x.customerId === conv.customerId && x.kind === kind && x.orderId === orderId && (x.status !== 'completed' || x.feedback === 'pending')) : null;
    if (!c) {
      c = {id: uid(s, 'SC'), customerId: conv.customerId, conversationIds: [], kind, title, orderId: orderId || '', status: 'open', feedback: 'none', result: null, resultHistory: [], createdAt: now, completedAt: null, humanTouched: false};
      s.cases.unshift(c);
    }
    if (!conv.caseIds.includes(c.id)) conv.caseIds.push(c.id);
    if (!c.conversationIds.includes(conv.id)) c.conversationIds.push(conv.id);
    return c;
  }
  function handoff(s, conv, reason, now) {
    if (conv.state !== 'human' && conv.state !== 'queued') { conv.state = 'queued'; conv.ownerId = ''; conv.waitingSince = now; conv.firstHumanAt = null; }
    conv.handoffReason = reason;
    conv.caseIds.map(id => get(s, 'cases', id)).filter(c => c.status !== 'completed').forEach(c => c.humanTouched = true);
    const body = s.settings.accepting ? '已转入人工接待队列。你提供的信息会一并交给客服，不需要重新描述；等待时也可以继续补充。' : '人工客服当前不在线，问题已保留在待接待列表。你可以继续补充信息，之后在这里查看回复。';
    message(s, conv, 'system', body, now);
  }
  function complete(s, c, publicText, evidence, by, now) {
    if (c.result) c.resultHistory.push(copy(c.result));
    c.result = {publicText, evidence, by, at: now}; c.status = 'completed'; c.feedback = 'pending'; c.completedAt = now;
  }
  function gap(s, conv, query, category, now) {
    const prior = s.gaps.find(g => g.conversationId === conv.id && normalize(g.query) === normalize(query) && g.status !== 'closed');
    if (prior) return prior;
    const g = {id: uid(s, 'GAP'), conversationId: conv.id, query, category, status: 'new', knowledgeId: '', cause: '', review: '', validation: null, createdAt: now}; s.gaps.unshift(g); return g;
  }
  function aftersalesCase(s, conv, pending, orderId, now) {
    if (pending?.kind !== 'aftersales') return makeCase(s, conv, 'aftersales', '售后申请', orderId, now);
    assert(!pending.result && !s.tickets.some(t => t.caseId === pending.id), '已有办理记录，请继续原问题');
    const existing = orderId && s.cases.find(c => c.id !== pending.id && c.customerId === conv.customerId && c.kind === 'aftersales' && c.orderId === orderId && (c.status !== 'completed' || c.feedback === 'pending'));
    if (!existing) { pending.orderId = orderId; return pending; }
    // Collapse only the unfinished order-collection placeholder, retaining all conversation links.
    for (const conversation of s.conversations) {
      if (!conversation.caseIds.includes(pending.id)) continue;
      conversation.caseIds = [...new Set(conversation.caseIds.map(id => id === pending.id ? existing.id : id))];
      if (conversation.pendingCaseId === pending.id) conversation.pendingCaseId = '';
      for (const m of conversation.messages) if (m.caseId === pending.id) m.caseId = existing.id;
      if (!existing.conversationIds.includes(conversation.id)) existing.conversationIds.push(conversation.id);
    }
    s.cases = s.cases.filter(c => c.id !== pending.id);
    return existing;
  }
  function run(s, conv, query, now, options = {}) {
    const plan = intentions(query, conv.flow);
    const pending = conv.pendingCaseId && get(s, 'cases', conv.pendingCaseId);
    if (plan.onlyId && pending && pending.kind === 'aftersales') {
      const c = aftersalesCase(s, conv, pending, plan.id, now); conv.pendingCaseId = '';
      const valid = s.orders.some(o => o.id === plan.id && o.customerId === conv.customerId);
      const existing = valid && s.tickets.find(t => t.caseId === c.id);
      const body = existing ? `此问题已受理，工单 ${existing.id}。请继续原记录，无需重复提交。` : valid ? '订单已核对。请填写售后原因，核对后再提交申请。' : '暂时无法核对此订单，请检查订单号或联系人工客服。';
      message(s, conv, 'bot', body, now, {caseId: c.id, intake: valid && !existing, ...(existing ? {ticketId: existing.id} : {})});
      if (!valid) handoff(s, conv, '订单归属未通过核对', now);
      conv.runs.push({at: now, flowVersion: conv.flow.version, query, steps: [valid ? 'intake' : 'orderDenied']});
      return;
    }
    const results = classify(s, query, conv.customerId, now, conv.flow, options);
    conv.runs.push({at: now, flowVersion: conv.flow.version, query, steps: results.map(r => r.kind)});
    for (const r of results) {
      if (r.kind === 'answer') {
        const c = makeCase(s, conv, 'knowledge', query, '', now);
        const citation = {id: r.knowledge.id, version: r.knowledge.version, title: r.knowledge.title, source: r.knowledge.source, answer: r.knowledge.answer};
        complete(s, c, r.knowledge.answer, {kind: 'knowledge', citation}, 'bot', now);
        message(s, conv, 'bot', r.knowledge.answer, now, {caseId: c.id, citation});
      } else if (['order', 'askOrder', 'orderDenied', 'orderFailure'].includes(r.kind)) {
        const c = pending?.kind === 'order' && plan.onlyId ? pending : makeCase(s, conv, 'order', '查询订单与物流', plan.id, now);
        if (r.kind === 'order') {
          c.orderId = r.order.id; conv.pendingCaseId = '';
          const body = `${r.order.product}：${r.order.status}。${r.order.delivery}`;
          complete(s, c, body, {kind: 'local-order', id: r.order.id, snapshot: copy(r.order)}, 'bot', now);
          message(s, conv, 'bot', body, now, {caseId: c.id, orderId: r.order.id});
        } else if (r.kind === 'askOrder') { conv.pendingCaseId = c.id; message(s, conv, 'bot', '请提供订单号，也可以从“我的订单”选择要查询的订单。', now, {caseId: c.id}); }
        else { message(s, conv, 'bot', r.kind === 'orderDenied' ? '暂时无法核对此订单。请确认订单号及购买账户；我不会展示其他账户的订单信息。' : '订单查询暂时不可用，没有取得最新状态。我会将已有信息交给人工核实。', now, {caseId: c.id}); handoff(s, conv, r.kind === 'orderDenied' ? '订单归属未通过核对' : '订单查询失败', now); }
      } else if (r.kind === 'intake') {
        const c = aftersalesCase(s, conv, pending, r.orderId, now);
        if (r.orderId) conv.pendingCaseId = '';
        const existing = s.tickets.find(t => t.caseId === c.id);
        if (existing) message(s, conv, 'bot', `此问题已受理，工单 ${existing.id}。可以继续在原记录查看进度或补充信息，无需重复提交。`, now, {caseId: c.id, ticketId: existing.id});
        else if (!r.orderId) { conv.pendingCaseId = c.id; message(s, conv, 'bot', '请提供要申请售后的订单号。确认订单后，请您补充原因并核对申请。', now, {caseId: c.id}); }
        else if (!s.orders.some(o => o.id === r.orderId && o.customerId === conv.customerId)) { message(s, conv, 'bot', '暂时无法核对此订单，请检查订单号或联系人工客服。', now); handoff(s, conv, '售后订单需要人工核实', now); }
        else message(s, conv, 'bot', '可以为这笔订单登记售后。请填写原因并核对申请，提交后由客服继续核实；受理不代表退款完成。', now, {caseId: c.id, intake: true});
      } else {
        makeCase(s, conv, 'support', query, '', now);
        if (r.kind === 'gap' || r.kind === 'conflict') gap(s, conv, query, r.kind === 'gap' ? '知识缺口' : '知识冲突', now);
        if (r.kind !== 'handoff') message(s, conv, 'bot', r.kind === 'conflict' ? '查到的说明存在冲突，暂时无法确认。我会请人工核实。' : '目前没有找到可靠的答复依据。我会将这个问题交给人工核实。', now);
        handoff(s, conv, r.reason || (r.kind === 'conflict' ? '知识来源冲突' : '没有命中已发布知识'), now);
      }
    }
  }
  function validateArticle(a) {
    assert(a, '没有待验证的知识草稿');
    for (const key of ['title', 'question', 'answer', 'source', 'positive', 'negative']) text(a[key], key === 'source' ? '知识来源' : '知识必填项', key === 'answer' ? 4000 : 2000);
    assert(a.keywords.length >= 2 && a.keywords.length <= 20 && a.keywords.every(w => w.length <= 60), '请填写 2–20 个关键词，每个不超过 60 字');
    assert(Number.isFinite(Date.parse(a.effectiveAt)), '生效日期无效');
    assert(!a.expiresAt || Date.parse(a.expiresAt) > Date.parse(a.effectiveAt), '失效日期必须晚于生效日期');
    assert(normalize(a.positive) !== normalize(a.negative), '正例与反例不能相同');
  }
  function validateFlow(f) {
    assert(f, '没有待验证的策略草稿');
    assert(Array.isArray(f.humanWords) && f.humanWords.length > 0 && f.humanWords.every(w => w.length > 0 && w.length <= 30), '人工触发词不能为空，单词不超过 30 字');
    assert(f.humanWords.includes('人工'), '必须保留客户明确要求人工的路由');
    assert(typeof f.intakeEnabled === 'boolean', '售后受理配置无效');
  }
  function fingerprint(s) { return JSON.stringify({knowledge: s.knowledge.map(k => ({id: k.id, live: k.live, disabled: k.disabled})), flow: s.flow.live}); }
  function candidate(s, id, mode) {
    const x = copy(s);
    if (mode === 'knowledge') { const k = get(x, 'knowledge', id); assert(k.draft, '没有待验证的草稿'); k.live = {...copy(k.draft), version: (k.live?.version || 0) + 1}; k.disabled = false; }
    else { assert(x.flow.draft, '没有流程草稿'); x.flow.live = {...copy(x.flow.draft), version: x.flow.live.version + 1}; }
    return x;
  }
  function regression(s, now, articleId) {
    const cases = [
      {name: '明确转人工', query: '我要转人工', expected: 'handoff'},
      {name: '拒绝转人工不应升级', query: '不要转人工，我只问退货规则', absent: 'handoff'},
      {name: '本人订单查询', query: '查物流 SO20260926001', expected: 'order'},
      {name: '其他客户订单不可读', query: '查物流 SO20260926009', expected: 'orderDenied'},
      {name: '查询失败不能宣称成功', query: '查物流 SO20260926001', expected: 'orderFailure', fault: true},
      {name: '多诉求分别处理', query: '查物流 SO20260926001，再申请退货', expected: s.flow.live.intakeEnabled ? 'intake' : 'handoff', also: 'order'}
    ];
    const rows = cases.map(c => { const rs = classify(s, c.query, 'C001', now, s.flow.live, {orderFailure: c.fault}); const kinds = rs.map(r => r.kind); return {name: c.name, query: c.query, actual: kinds.join(' → '), pass: c.absent ? !kinds.includes(c.absent) : kinds.includes(c.expected) && (!c.also || kinds.includes(c.also))}; });
    for (const k of activeArticles(s, now)) {
      const positive = classify(s, k.live.positive, 'C001', now).find(r => r.knowledge?.id === k.id);
      const negative = classify(s, k.live.negative, 'C001', now).find(r => r.knowledge?.id === k.id);
      rows.push({name: `${k.id} 正例`, query: k.live.positive, actual: positive ? k.id : '未命中预期知识', pass: Boolean(positive)});
      rows.push({name: `${k.id} 反例`, query: k.live.negative, actual: negative ? '错误命中' : '未误命中', pass: !negative});
    }
    if (articleId) rows.push({name: '待发布知识生效区间', query: articleId, actual: activeArticles(s, now).some(k => k.id === articleId) ? '可用' : '尚未生效或已过期', pass: activeArticles(s, now).some(k => k.id === articleId)});
    return {at: now, fingerprint: fingerprint(s), rows, passed: rows.every(r => r.pass)};
  }
  function execute(state, identity, type, data = {}, now = Date.now()) {
    const s = copy(state), a = actor(s, identity);
    assert(roles[a.role]?.includes(type), '当前角色无权执行此操作');
    let value;
    switch (type) {
      case 'newConversation': {
        const c = makeConversation(s, a.id, now);
        if (data.caseId) { const issue = get(s, 'cases', data.caseId); owns(a, issue); c.caseIds.push(issue.id); issue.conversationIds.push(c.id); if (issue.status !== 'completed' || s.tickets.some(t => t.caseId === issue.id)) handoff(s, c, '继续跟进已有问题', now); }
        value = c.id; break;
      }
      case 'say': {
        const c = get(s, 'conversations', data.id); owns(a, c); const body = text(data.body, '问题');
        if (c.state === 'closed') { c.state = c.ownerHistory.length || c.caseIds.some(id => activeTicket(s, get(s, 'cases', id))) ? 'queued' : 'bot'; if (c.state === 'queued') {c.waitingSince = now; c.firstHumanAt = null;} }
        message(s, c, 'customer', body, now);
        if (c.state === 'bot') run(s, c, body, now);
        else if (!c.caseIds.some(id => get(s, 'cases', id).status !== 'completed')) {
          const issue = makeCase(s, c, 'support', body, '', now);
          issue.humanTouched = true;
          c.messages.at(-1).caseId = issue.id;
        }
        value = c.id; break;
      }
      case 'requestHuman': {
        const c = get(s, 'conversations', data.id); owns(a, c); assert(['bot', 'closed'].includes(c.state), '已经在人工接待流程中');
        if (!c.caseIds.some(id => get(s, 'cases', id).status !== 'completed')) makeCase(s, c, 'support', '人工协助', '', now);
        handoff(s, c, '客户主动要求人工协助', now); break;
      }
      case 'cancelQueue': { const c = get(s, 'conversations', data.id); owns(a, c); assert(c.state === 'queued', '当前不可取消排队'); c.state = 'bot'; c.ownerId = ''; message(s, c, 'system', '已取消当前排队。已有工单及未完成问题仍保留。', now); break; }
      case 'claimConversation': {
        const c = get(s, 'conversations', data.id); assert(c.state === 'queued' && !c.ownerId && within(a, c), '会话不在可领取队列中');
        assert(a.available && s.settings.accepting, '当前未开放接待，请先调整接待状态');
        assert(s.conversations.filter(x => x.state === 'human' && x.ownerId === a.id).length < s.settings.capacity, '已达到个人接待容量');
        c.state = 'human'; c.ownerId = a.id; if (!c.ownerHistory.includes(a.id)) c.ownerHistory.push(a.id);
        message(s, c, 'system', `${a.name}已接入，接下来由人工为您服务。`, now);
        c.caseIds.map(id => get(s, 'cases', id)).filter(x => x.status !== 'completed').forEach(x => x.humanTouched = true); break;
      }
      case 'reply': case 'note': {
        const c = get(s, 'conversations', data.id); agentOwns(a, c); assert(c.state === 'human', '会话不在人工接待状态');
        message(s, c, 'agent', text(data.body, type === 'note' ? '内部备注' : '回复'), now, {author: a.name, visibility: type === 'note' ? 'internal' : 'public'});
        if (type === 'reply') c.firstHumanAt ||= now; break;
      }
      case 'completeCase': {
        const c = get(s, 'cases', data.id), conv = get(s, 'conversations', data.conversationId); agentOwns(a, conv);
        assert(conv.state === 'human' && conv.caseIds.includes(c.id), '问题不属于当前接待');
        assert(!s.tickets.some(t => t.caseId === c.id), '已有办理工单，请从工单提交结果，不能绕过工单');
        assert(c.status !== 'completed', '此问题已记录处理结果');
        const conclusion = text(data.conclusion, '处理结论'), evidence = text(data.evidence, '核对依据');
        complete(s, c, conclusion, {kind: 'agent-record', text: evidence, actor: a.name}, a.id, now); c.humanTouched = true;
        for (const id of c.conversationIds) { const v = get(s, 'conversations', id); if (v.pendingCaseId === c.id) v.pendingCaseId = ''; }
        message(s, conv, 'agent', conclusion, now, {author: a.name, caseId: c.id}); conv.firstHumanAt ||= now; break;
      }
      case 'closeConversation': {
        const c = get(s, 'conversations', data.id);
        if (a.role === 'customer') owns(a, c);
        else { agentOwns(a, c); assert(c.state === 'human', '请先接管会话'); assert(c.caseIds.every(id => get(s, 'cases', id).status === 'completed' || activeTicket(s, get(s, 'cases', id))), '仍有未完成且无人跟进的问题，请记录结论或建立工单'); }
        assert(c.state !== 'closed', '会话已经结束'); c.state = 'closed'; c.ownerId = '';
        message(s, c, 'system', '本次沟通已结束。未完成的办理记录会继续保留，您可以在这里继续咨询。', now); break;
      }
      case 'feedback': {
        const c = get(s, 'cases', data.id); owns(a, c); assert(c.status === 'completed', '尚未形成可确认的处理结果');
        if (data.confirmed === true) { c.feedback = 'confirmed'; c.confirmedAt = now; }
        else {
          const reason = text(data.reason, '未解决原因'); c.feedback = 'disputed'; c.status = 'open'; c.completedAt = null;
          const t = s.tickets.find(t => t.caseId === c.id && t.status === 'done');
          if (t) { t.status = t.ownerId ? 'working' : 'new'; t.dueAt = now + s.settings.ticketHours * 3600000; t.history.push({at: now, publicText: `客户反馈仍需处理：${reason}`, actor: a.name}); }
          let conv = c.conversationIds.map(id => get(s, 'conversations', id)).find(v => v.state !== 'closed');
          if (!conv) { conv = makeConversation(s, a.id, now); conv.caseIds.push(c.id); c.conversationIds.push(conv.id); }
          message(s, conv, 'customer', `这个问题还没有解决：${reason}`, now, {caseId: c.id}); handoff(s, conv, '客户对处理结果提出异议', now);
          value = conv.id;
        }
        break;
      }
      case 'createTicket': {
        const title = text(data.title, '工单标题', 100), description = text(data.description, '问题描述');
        assert(data.confirmed === true, '请核对申请后再确认受理');
        let c = data.caseId && get(s, 'cases', data.caseId);
        if (a.role === 'customer') { assert(c, '请选择要办理的问题'); owns(a, c); assert(c.kind === 'aftersales', '该问题请由客服协助受理'); assert(s.orders.some(o => o.id === c.orderId && o.customerId === a.id), '订单归属尚未核对'); }
        else if (c) { const conv = get(s, 'conversations', data.conversationId); agentOwns(a, conv); assert(conv.state === 'human' && conv.caseIds.includes(c.id), '无法从这段会话受理此问题'); }
        else { get(s, 'customers', data.customerId); c = {id: uid(s, 'SC'), customerId: data.customerId, conversationIds: [], kind: 'support', title, orderId: '', status: 'open', feedback: 'none', result: null, resultHistory: [], createdAt: now, completedAt: null, humanTouched: true}; s.cases.unshift(c); }
        assert(c.status !== 'completed', '问题已完成；需要继续处理时请先反馈未解决');
        for (const id of c.conversationIds) { const v = get(s, 'conversations', id); if (v.pendingCaseId === c.id) v.pendingCaseId = ''; }
        const fp = JSON.stringify({caseId: c.id, title, description});
        const byKey = data.requestKey && s.tickets.find(t => t.requestKey === data.requestKey);
        if (byKey) { assert(byKey.requestFingerprint === fp, '提交标识被用于不同内容，请重新核对'); value = {id: byKey.id, created: false}; break; }
        const existing = activeTicket(s, c);
        if (existing) { value = {id: existing.id, created: false}; break; }
        assert(c.kind !== 'aftersales' || !s.tickets.some(t => t.customerId === c.customerId && t.orderId === c.orderId && t.status !== 'done' && get(s, 'cases', t.caseId).kind === 'aftersales'), '同一订单已有办理中的售后，请继续原工单');
        const t = {id: uid(s, 'TK'), customerId: c.customerId, teamId: 'service', caseId: c.id, title, description, orderId: c.orderId, status: 'new', priority: 'normal', ownerId: '', createdAt: now, dueAt: now + s.settings.ticketHours * 3600000, requestKey: data.requestKey || '', requestFingerprint: fp, history: [{at: now, publicText: '申请已受理，等待客服核实。', actor: a.name}]};
        s.tickets.unshift(t); c.humanTouched = true; c.status = 'open';
        for (const id of c.conversationIds) message(s, get(s, 'conversations', id), 'system', `已受理工单 ${t.id}：${title}。请在“服务进度”查看后续处理。`, now, {ticketId: t.id});
        value = {id: t.id, created: true}; break;
      }
      case 'claimTicket': { const t = get(s, 'tickets', data.id); assert(within(a, t) && !t.ownerId && t.status === 'new', '工单已被领取或不在可领取范围'); t.ownerId = a.id; t.status = 'working'; t.history.push({at: now, publicText: '客服已开始核实处理。', actor: a.name}); break; }
      case 'updateTicket': {
        const t = get(s, 'tickets', data.id); agentOwns(a, t);
        assert(['working', 'waiting_customer'].includes(t.status), '工单当前不可修改');
        assert(['working', 'waiting_customer', 'done'].includes(data.status), '工单状态无效');
        const publicText = text(data.publicText, '客户可见说明');
        const evidence = data.status === 'done' ? text(data.evidence, '结果核对依据') : String(data.evidence || '').trim();
        assert(evidence.length <= 2000 && String(data.internalText || '').length <= 2000, '核对依据或内部备注不能超过 2000 字');
        t.status = data.status; t.history.push({at: now, publicText, evidence, internalText: String(data.internalText || '').trim(), actor: a.name});
        const c = get(s, 'cases', t.caseId);
        if (t.status === 'done') complete(s, c, publicText, {kind: 'ticket-record', ticketId: t.id, text: evidence, actor: a.name}, a.id, now);
        else c.status = t.status === 'waiting_customer' ? 'waiting_customer' : 'open';
        for (const id of c.conversationIds) message(s, get(s, 'conversations', id), 'system', `${t.id}：${publicText}`, now, {ticketId: t.id}); break;
      }
      case 'supplement': {
        const t = get(s, 'tickets', data.id); owns(a, t); assert(t.status !== 'done', '已有处理结果；如有异议，请使用“仍需帮助”');
        t.history.push({at: now, publicText: `客户补充：${text(data.body, '补充信息')}`, actor: a.name});
        if (t.status === 'waiting_customer') t.status = t.ownerId ? 'working' : 'new'; get(s, 'cases', t.caseId).status = 'open'; break;
      }
      case 'assignTicket': case 'assignConversation': {
        const r = get(s, type === 'assignTicket' ? 'tickets' : 'conversations', data.id); managing(a, r);
        const next = get(s, 'staff', data.ownerId); assert(next.role === 'agent' && within(next, r), '请选择该服务组的客服');
        if (type === 'assignTicket') { assert(r.status !== 'done', '已完成工单不再转派'); r.ownerId = next.id; if (r.status === 'new') r.status = 'working'; r.history.push({at: now, publicText: '已安排客服继续处理。', actor: a.name, internalText: `转派给${next.name}`}); }
        else { assert(['queued', 'human'].includes(r.state), '仅能分配待接待或接待中的会话'); assert(next.available && s.conversations.filter(v => v.state === 'human' && v.ownerId === next.id && v.id !== r.id).length < s.settings.capacity, '目标客服不可接待或已满载'); r.ownerId = next.id; r.state = 'human'; if (!r.ownerHistory.includes(next.id)) r.ownerHistory.push(next.id); message(s, r, 'system', `${next.name}将继续为您服务，已有信息会保留。`, now); } break;
      }
      case 'presence': get(s, 'staff', a.id).available = Boolean(data.available); break;
      case 'serviceSettings': {
        const cap = Number(data.capacity), mins = Number(data.responseMinutes), hours = Number(data.ticketHours);
        assert(Number.isInteger(cap) && cap >= 1 && cap <= 20, '个人接待容量应为 1–20'); assert(Number.isFinite(mins) && mins >= 1 && mins <= 120, '首响目标应为 1–120 分钟'); assert(Number.isFinite(hours) && hours >= 1 && hours <= 168, '工单目标应为 1–168 小时');
        s.settings = {capacity: cap, responseMinutes: mins, ticketHours: hours, accepting: data.accepting === true}; break;
      }
      case 'flag': { const c = get(s, 'conversations', data.id); agentOwns(a, c); const q = [...c.messages].reverse().find(m => m.role === 'customer'); assert(q, '尚无客户提问'); gap(s, c, q.body, '答复疑义', now); break; }
      case 'saveKnowledge': {
        const draft = {title: text(data.title, '标题', 120), question: text(data.question, '标准问题', 300), keywords: split(data.keywords), answer: text(data.answer, '答复内容', 4000), source: text(data.source, '来源', 300), effectiveAt: data.effectiveAt, expiresAt: data.expiresAt || '', positive: text(data.positive, '正例问题', 300), negative: text(data.negative, '反例问题', 300)};
        validateArticle(draft); let k = data.id && get(s, 'knowledge', data.id);
        if (!k) { k = {id: uid(s, 'KB'), live: null, versions: [], disabled: false}; s.knowledge.push(k); }
        k.draft = draft; k.validation = null; value = k.id; break;
      }
      case 'testKnowledge': { const k = get(s, 'knowledge', data.id); validateArticle(k.draft); k.validation = regression(candidate(s, k.id, 'knowledge'), now, k.id); value = copy(k.validation); break; }
      case 'publishKnowledge': {
        const k = get(s, 'knowledge', data.id); const fresh = regression(candidate(s, k.id, 'knowledge'), now, k.id);
        assert(k.validation?.passed && k.validation.fingerprint === fresh.fingerprint && fresh.passed, '草稿或依赖已变化，或知识已失效；请重新测试且全部通过后发布');
        if (k.live) k.versions.push(copy(k.live)); k.live = {...copy(k.draft), version: (k.live?.version || 0) + 1, publishedAt: now}; k.draft = null; k.disabled = false; k.validation = null; break;
      }
      case 'disableKnowledge': { const k = get(s, 'knowledge', data.id); assert(k.live && !k.disabled, '知识未在使用中'); k.disabled = true; k.disabledReason = text(data.reason, '停用原因', 300); break; }
      case 'saveFlow': { const f = {humanWords: split(data.humanWords), intakeEnabled: data.intakeEnabled === true}; validateFlow(f); s.flow.draft = f; s.flow.validation = null; break; }
      case 'testFlow': { validateFlow(s.flow.draft); s.flow.validation = regression(candidate(s, '', 'flow'), now); value = copy(s.flow.validation); break; }
      case 'publishFlow': {
        const fresh = regression(candidate(s, '', 'flow'), now); assert(s.flow.validation?.passed && s.flow.validation.fingerprint === fresh.fingerprint && fresh.passed, '流程或知识已变化，请重新运行测试后发布');
        s.flow.versions.push(copy(s.flow.live)); s.flow.live = {...copy(s.flow.draft), version: s.flow.live.version + 1}; s.flow.draft = null; s.flow.validation = null; break;
      }
      case 'reviewGap': {
        const g = get(s, 'gaps', data.id); managing(a, get(s, 'conversations', g.conversationId)); assert(g.status !== 'closed', '已验收记录不可改判');
        assert(['confirmed', 'dismissed'].includes(data.status), '复核结论无效'); g.review = text(data.review, '复核依据'); g.status = data.status;
        if (g.status === 'confirmed') g.cause = text(data.cause, '根因说明'); break;
      }
      case 'linkGap': { const g = get(s, 'gaps', data.id); assert(['confirmed', 'fixing'].includes(g.status), '请先由经理确认问题'); get(s, 'knowledge', data.knowledgeId); g.knowledgeId = data.knowledgeId; g.status = 'fixing'; g.validation = null; break; }
      case 'acceptGap': {
        const g = get(s, 'gaps', data.id); managing(a, get(s, 'conversations', g.conversationId)); assert(g.status === 'fixing', '尚未关联整改措施');
        const k = get(s, 'knowledge', g.knowledgeId); assert(k.live && !k.draft && !k.disabled, '整改知识尚未发布，或还有待发布草稿');
        const rs = classify(s, g.query, get(s, 'conversations', g.conversationId).customerId, now);
        assert(rs.some(r => r.knowledge?.id === k.id), '原始问题未命中关联知识，不能验收');
        const all = regression(s, now); assert(all.passed, '全量回归未通过，不能验收');
        g.acceptance = text(data.acceptance, '验收说明'); g.validation = {at: now, fingerprint: fingerprint(s), version: k.live.version, rows: all.rows}; g.status = 'closed'; break;
      }
      case 'export': value = copy(s); break;
      default: throw new Error('未知操作');
    }
    if (type !== 'export') { s.revision++; event(s, a, type, data.id || value?.id || (typeof value === 'string' ? value : ''), '操作已记录', now); }
    return {state: s, value};
  }
  function customerView(s, customerId) {
    get(s, 'customers', customerId);
    return {
      customer: copy(get(s, 'customers', customerId)),
      orders: copy(s.orders.filter(o => o.customerId === customerId)),
      conversations: s.conversations.filter(c => c.customerId === customerId).map(c => ({id: c.id, customerId: c.customerId, state: c.state, caseIds: [...c.caseIds], createdAt: c.createdAt, updatedAt: c.updatedAt, messages: copy(c.messages.filter(m => m.visibility === 'public'))})),
      cases: s.cases.filter(c => c.customerId === customerId).map(c => ({id: c.id, kind: c.kind, title: c.title, orderId: c.orderId, status: c.status, feedback: c.feedback, conversationIds: [...c.conversationIds], createdAt: c.createdAt, result: c.result ? {publicText: c.result.publicText, at: c.result.at} : null})),
      tickets: s.tickets.filter(t => t.customerId === customerId).map(t => ({id: t.id, caseId: t.caseId, title: t.title, description: t.description, orderId: t.orderId, status: t.status, createdAt: t.createdAt, history: t.history.map(h => ({at: h.at, publicText: h.publicText, actor: h.actor}))}))
    };
  }
  function deskView(s, identity) {
    const a = actor(s, identity); assert(a.role === 'agent', '无权打开客服工作台');
    const conversations = s.conversations.filter(c => within(a, c) && ((c.state === 'queued' && !c.ownerId) || c.ownerId === a.id || (c.state === 'closed' && c.ownerHistory.includes(a.id))));
    const tickets = s.tickets.filter(t => within(a, t) && (t.ownerId === a.id || (!t.ownerId && t.status === 'new')));
    const relatedTickets = s.tickets.filter(t => within(a,t) && !tickets.some(x=>x.id===t.id) && conversations.some(c=>c.caseIds.includes(t.caseId)));
    const visibleCustomers = new Set([...conversations, ...tickets].map(x => x.customerId));
    return copy({conversations, tickets, relatedTickets, customers: s.customers.filter(c => visibleCustomers.has(c.id)), orders: s.orders.filter(o => visibleCustomers.has(o.customerId)), cases: s.cases.filter(c => conversations.some(x => x.caseIds.includes(c.id)) || tickets.some(t => t.caseId === c.id))});
  }
  function metrics(s, now = Date.now()) {
    const completed = s.cases.filter(c => c.status === 'completed');
    const confirmed = completed.filter(c => c.feedback === 'confirmed');
    return {conversations: s.conversations.length, cases: s.cases.length, completed: completed.length, confirmed: confirmed.length, botConfirmed: confirmed.filter(c => !c.humanTouched).length, waiting: s.conversations.filter(c => c.state === 'queued').length, activeTickets: s.tickets.filter(t => t.status !== 'done').length, overdue: s.tickets.filter(t => t.status !== 'done' && t.dueAt < now).length, gaps: s.gaps.filter(g => !['closed', 'dismissed'].includes(g.status)).length};
  }
  const api = {copy, get, split, roles, actor, retrieve, intentions, classify, execute, customerView, deskView, metrics, regression, fingerprint, activeArticles};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SupportDomain = api;
})(typeof window !== 'undefined' ? window : globalThis);
