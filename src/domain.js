/* Pure domain commands. Local role checks model behavior; they are NOT server authorization. */
(function (root) {
  'use strict';
  const Copy = typeof module !== 'undefined' && module.exports ? require('./copy.js') : root.SupportCopy;
  const Commerce = typeof module !== 'undefined' && module.exports ? require('./commerce.js') : root.SupportCommerce;
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
    customer: ['newConversation', 'say', 'requestHuman', 'cancelQueue', 'feedback', 'createTicket', 'supplement', 'closeConversation', 'customerConnection', 'queryCommerce'],
    agent: ['claimConversation', 'reply', 'note', 'completeCase', 'closeConversation', 'createTicket', 'claimTicket', 'updateTicket', 'flag', 'presence', 'confirmIntent', 'bindOrder', 'queryOrder', 'markSop', 'setAiAssist', 'aiContinue', 'saveCallback', 'callbackResult', 'closeWithSummary', 'queryCommerce'],
    manager: ['assignTicket', 'assignConversation', 'reviewGap', 'acceptGap', 'serviceSettings'],
    operator: ['saveKnowledge', 'testKnowledge', 'publishKnowledge', 'disableKnowledge', 'saveFlow', 'testFlow', 'publishFlow', 'linkGap'],
    admin: ['export']
  };
  roles.customer.push('previewAftersale','confirmAftersale','submitReturn','submitSupplement','requestWithdrawal','serviceDispute');
  roles.agent.push('submitRefund','queryRefund','proposeHandoff','acceptHandoff','rejectHandoff','serviceFollowup','resolveLogistics','resolveServiceDispute','serviceReply');
  roles.manager.push('submitReview','proposeHandoff','expireHandoffs');
  roles.operator.push('runServiceEval');
  roles.admin.push('applySimulatedReceipt');
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
  // Missing markers retain legacy intake semantics.
  const acceptedTicket = (s, c) => s.tickets.find(t => t.caseId === c.id && t.followupOnly !== true);
  const otherAftersalesTicket = (s, c) => c.orderId && s.tickets.find(t => t.caseId !== c.id && t.customerId === c.customerId && t.orderId === c.orderId && t.status !== 'done' && get(s, 'cases', t.caseId).kind === 'aftersales');
  const activeArticles = (s, now) => s.knowledge.filter(k => k.live && !k.disabled && Date.parse(k.live.effectiveAt) <= now && (!k.live.expiresAt || now < Date.parse(k.live.expiresAt)));
  const mentionedItems=(s,query)=>s.schema===5?s.commerce.items.filter(i=>query.includes(i.id)||query.includes(i.name)||(i.skuId==='EC-SKU-CUP'&&/杯/.test(query))||(i.skuId==='EC-SKU-BAG'&&/袋/.test(query))||(i.skuId==='EC-SKU-BOX'&&/收纳盒|盒子/.test(query))).map(i=>i.id):[];
  function retrieve(s, query, now = Date.now(), scopeQuery = query, customerId='C001') {
    const q = normalize(query);
    const mentioned=mentionedItems(s,scopeQuery);
    const candidates = activeArticles(s, now).filter(k=>!mentioned.length||!k.live.scopeItemIds?.length||mentioned.every(id=>k.live.scopeItemIds.includes(id))).map(k => {
      const exact = q.includes(normalize(k.live.question));
      const hits = k.live.keywords.filter(w => q.includes(normalize(w))).length;
      return {k, exact, hits};
    }).filter(x => x.exact || x.hits >= 2).sort((a, b) => Number(b.exact) - Number(a.exact) || b.hits - a.hits);
    if (!candidates.length) return null;
    const first = candidates[0];
    if (candidates.some(x => x !== first && x.exact === first.exact && x.hits === first.hits && x.k.live.answer !== first.k.live.answer)) return {conflict: true};
    const article={id:first.k.id,...copy(first.k.live)};
    if(s.schema===5&&(article.id==='KB001'||/(退货|售后).*(政策|规则|条件)|(政策|规则|条件).*(退货|售后)/.test(article.title+' '+article.question)))return policyKnowledge(s,article,scopeQuery,customerId,now);
    return article;
  }
  function policyKnowledge(s,k,query,customerId,now){
    const mentioned=mentionedItems(s,query),rules=(s.commerce.rules||[]).filter(r=>s.commerce.items.some(i=>i.id===r.itemId&&s.orders.some(o=>o.id===i.orderId&&o.customerId===customerId))&&(!mentioned.length||mentioned.includes(r.itemId))&&(!k.scopeItemIds?.length||k.scopeItemIds.includes(r.itemId))&&Date.parse(r.effectiveAt)<=now&&(!r.expiresAt||now<Date.parse(r.expiresAt)));
    if(!rules.length||mentioned.some(id=>!rules.some(r=>r.itemId===id)))return null;
    return {...k,answer:rules.map(r=>`${s.commerce.items.find(i=>i.id===r.itemId).name}：签收破损可核对一件退货退款，模拟规则金额为 ${Commerce.money(r.amountCents)}。须由服务经理审核${r.requiresReturn?'，审核通过后寄回商品并由仓库验收':'，根据审批决定继续办理'}；退款成功以原请求的业务回执为准，咨询不代表已受理、已退款或客户已确认。规则 ${r.id} v${r.version} · ${r.source}`).join('\n'),ruleId:rules[0].id,ruleVersion:rules[0].version,ruleRefs:rules.map(r=>({id:r.id,version:r.version,itemId:r.itemId,source:r.source}))};
  }
  function intentions(query, config, commerce=false) {
    const lower = query.toLowerCase();
    query = stripSocialEdges(query);
    const declined = lower.replace(/人工(?:智能|费|成本)/g, '').replace(/(?:不需要|不要|不用|不想|无需|别)(?:帮我|给我|再|先)?(?:转接|转|找|联系)?人工(?:客服)?/g, '').replace(/人工(?:客服)?(?:就|先)?(?:不用|不要|不需要)了?/g, '');
    const human = config.humanWords.some(w => declined.includes(w.toLowerCase()));
    const id = query.match(/\b(?:EC-)?SO[A-Z0-9]+\b/i)?.[0].toUpperCase() || '';
    const onlyId = /^(?:订单号[是为：:]?\s*)?(?:EC-)?SO[A-Z0-9]+[。！!]?$/i.test(query.trim());
    const negatedReturn = /(不要|不想|不需要|暂不|先不).{0,6}(退货|退款|换货|申请)/.test(query);
    const intake = !negatedReturn && (/(申请|办理).{0,6}(退货|退款|换货|售后)/.test(query) || /(想|要|需要|帮我)(退货|退款|换货)/.test(query));
    const policyQuestion = /(怎么|如何|能不能|能.{0,8}吗|可以.{0,8}吗|规则|条件|流程|政策|无理由|退货运费|了解)/;
    const policy = /(退|售后)/.test(query) && (commerce
      ? !intake && !/(我要|我想|帮我|申请|办理)/.test(query) && policyQuestion.test(query)
      : /(规则|条件|政策|无理由|如何退|怎么退|退货运费|了解)/.test(query));
    const damage = /(破损|损坏|碎|坏|裂|漏水)/;
    const independentIssue = /(物流|支付|付款|扣款|扣.{0,8}(钱|笔|次)|包裹|快递|没(?:有)?收到|未收到|没拿到|没到|丢失|少发|漏发|停滞|催发货|地址|退款.{0,8}(没|未|不到|失败|未知))/;
    const mixedPolicy = commerce && policy && (independentIssue.test(query) || declined.split(/[，,。；;]|另外|还有|而且|但是|以及/).map(stripSocialEdges).filter(Boolean).some(part=>!(policyQuestion.test(part)&&/(退|售后)/.test(part))&&!damage.test(part)));
    const lookup = !/(不查|不要查)/.test(query) && (/(查|看|查询|到哪|在哪|进度).{0,8}(订单|物流|快递)/.test(query) || /(订单|物流|快递).{0,8}(到哪|在哪|进度|状态)/.test(query) || /^(订单|物流|快递)$/.test(query.trim()) || (commerce&&(/(查|看|查询|到哪|在哪|进度).{0,8}(包裹|支付)/.test(query)||/(包裹|支付).{0,8}(到哪|在哪|进度|状态)/.test(query)||/^(包裹|支付)$/.test(query.trim()))));
    return {human, id, onlyId, policy, mixedPolicy, intake, lookup};
  }
  const address = '(?:你们?|您们?|亲(?:爱的)?|老师|老板|客服(?:小姐姐|小哥哥)?|小姐姐|小哥哥)';
  const goodbye = '拜{2,}|再见|再会|(?:回头|回|下次|改天|明天|一会儿?)见|(?<![a-z0-9])8{2,}6?(?![a-z0-9])';
  const greeting = '你好|您好|在吗|在不在|哈[喽啰罗]|嗨|早(?:上好|安)?|上午好|中午好|下午好|晚上好|晚安|hello|hi|hey';
  const socialWords = '(?:'+greeting+')'+address+'?|(?:谢谢|多谢|感谢|谢[了啦哈])'+address+'?|辛苦'+address+'?了?|好(?:的|滴|嘞|吧)?|行|嗯+|哦+|噢+|收到|明白了?|了解了?|知道了?|清楚了?|ok(?:ay)?|'+goodbye;
  const closingWords = '没(?:有)?(?:事|问题)了?|没啥事了?|(?:不用|不需要|无需)了?';
  const socialText = query => query.toLowerCase().replace(/[\s，,。.!！?？、；;~～…]/g, '');
  function socialTokens(q,closing=true) {
    const word=new RegExp(socialWords+(closing?'|'+closingWords:''),'gy'),tokens=[];
    for(let i=0;i<q.length;){
      word.lastIndex=i;const match=word.exec(q);
      if(!match){i++;continue;}
      let end=word.lastIndex;
      while(/[呀啊啦呢哟喔呐嘞噢咯哈哒唷哇咧]/.test(q[end]||'')){
        word.lastIndex=end;if(word.test(q))break;
        end++;
      }
      tokens.push({start:i,end});i=end;
    }
    return tokens;
  }
  function stripSocialEdges(query) {
    const parts=[...query.matchAll(/[^\s，,。.!！?？、；;~～…]/g)],q=parts.map(x=>x[0].toLowerCase()).join('');
    const ids=[...query.matchAll(/\b(?:EC-)?SO[A-Z0-9]+\b/gi)];let idIndex=0;
    const tokens=socialTokens(q,false).filter(t=>{
      const start=parts[t.start].index,end=parts[t.end-1].index+1;
      while(idIndex<ids.length&&ids[idIndex].index+ids[idIndex][0].length<=start)idIndex++;
      return idIndex>=ids.length||ids[idIndex].index>=end;
    });
    let start=0,end=q.length;
    for(const token of tokens){if(token.start!==start)break;start=token.end;}
    for(const token of tokens.slice().reverse()){if(token.end!==end)break;end=token.start;}
    return start>=end?'':query.slice(parts[start].index,parts[end-1].index+1);
  }
  function socialReply(query) {
    const q = socialText(query);
    const tokens=socialTokens(q);
    if (!q || tokens.map(t=>q.slice(t.start,t.end)).join('')!==q) return '';
    if (/(8{2,}6?|拜|再见|再会|(?:回头|回|下次|改天|明天|一会儿?)见|没(?:有|啥)?事|没问题|不用|不需要|无需|晚安)/.test(q)) return '好的，祝您生活愉快。有需要可以再来咨询。';
    if (/(谢|辛苦)/.test(q)) return '不客气，有其他问题可以继续告诉我。';
    if (/(你好|您好|在吗|在不在|早|午好|晚上好|哈[喽啰罗]|嗨|hello|hi|hey)/.test(q)) return '您好，我在。请告诉我需要什么帮助。';
    return '好的，有需要可以继续告诉我。';
  }
  function classify(s, query, customerId, now = Date.now(), config = s.flow.live, options = {}) {
    const p = intentions(query, config, s.schema===5);
    if (p.human) return [{kind: 'handoff', reason: '客户要求人工协助'}];
    const social = socialReply(query);
    if (social) return [{kind: 'social', body: social}];
    if (p.mixedPolicy) return [{kind:'handoff',reason:'规则咨询包含其他业务诉求，需要人工逐项核实'}];
    const orderIds = new Set((query.match(/\b(?:EC-)?SO[A-Z0-9]+\b/gi) || []).map(id => id.toUpperCase()));
    if (orderIds.size > 1) return [{kind: 'handoff', reason: '同时涉及多个订单，需要逐项核实对应诉求'}];
    if(s.schema===5&&!p.policy&&(p.intake||/(没(?:有)?收到|未收到|没拿到|没到|破损|损坏|碎了|坏了|裂痕|漏水|丢了|丢失|少发|漏发|停滞|催发货)/.test(query)))return [{kind:'handoff',reason:'商品售后或物流异常需要人工逐项核实'}];
    if(s.schema===5&&p.lookup){
      const request=normalize(stripSocialEdges(query)).toUpperCase().replace(p.id,'');
      const simple=/^(?:(?:请|麻烦)(?:帮我)?|帮我|我想|我要)?(?:(?:查(?:询)?(?:一下|下)?|看(?:一下|下)?)(?:我的|这笔)?(?:订单|物流|快递|包裹|支付)(?:信息|详情|状态|进度)?|(?:我的)?(?:订单|物流|快递|包裹|支付)(?:到哪了?|在哪|状态|进度|信息|详情))$/;
      if(!simple.test(request))return [{kind:'handoff',reason:'查询包含其他描述，需要人工核实具体诉求'}];
    }
    const results = [];
    if (p.lookup || p.onlyId) {
      const order = p.id && s.orders.find(o => o.id === p.id && o.customerId === customerId);
      results.push(!p.id ? {kind: 'askOrder'} : !order ? {kind: 'orderDenied'} : options.orderFailure ? {kind: 'orderFailure'} : {kind: 'order', order: copy(order),...(s.schema===5?{commerce:Commerce.snapshot(s,order.id)}:{})});
    }
    if (p.intake) results.push({kind: config.intakeEnabled ? 'intake' : 'handoff', orderId: p.id, reason: '售后申请需要人工受理'});
    if (p.policy || !results.length) {
      const question = p.policy ? query.split(/[，,。；;]/).find(x => /(规则|条件|政策|无理由|如何退|怎么退|退货运费)/.test(x)) || query : query;
      let knowledge = retrieve(s, s.schema===5&&p.policy?question+' 退货 规则':question, now, query,customerId);
      if(s.schema===5&&p.policy&&knowledge&&!knowledge.conflict){knowledge=policyKnowledge(s,knowledge,query,customerId,now);if(!knowledge){results.push({kind:'handoff',reason:'该商品没有当前可用的已核实政策，请人工核对'});return results;}}
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
    let c = kind === 'aftersales' && orderId ? s.cases.find(x => x.customerId === conv.customerId && x.kind === kind && x.orderId === orderId && !x.workflow?.withdrawn && (x.status !== 'completed' || x.feedback === 'pending')) : null;
    if (!c) {
      c = {id: uid(s, 'SC'), customerId: conv.customerId, conversationIds: [], kind, title, orderId: orderId || '', status: 'open', feedback: 'none', result: null, resultHistory: [], createdAt: now, completedAt: null, humanTouched: false};
      s.cases.unshift(c);
    }
    if (!conv.caseIds.includes(c.id)) conv.caseIds.push(c.id);
    if (!c.conversationIds.includes(conv.id)) c.conversationIds.push(conv.id);
    return c;
  }
  function handoff(s, conv, reason, now) {
    pauseAi(conv,'已转交人工核实',now);
    if (conv.state !== 'human' && conv.state !== 'queued') { conv.state = 'queued'; conv.ownerId = ''; conv.waitingSince = now; conv.firstHumanAt = null; }
    conv.handoffReason = reason;
    if(s.schema!==5)conv.caseIds.map(id => get(s, 'cases', id)).filter(c => c.status !== 'completed').forEach(c => c.humanTouched = true);
    const body = s.settings.accepting ? '已转入人工接待队列。你提供的信息会一并交给客服，不需要重新描述；等待时也可以继续补充。' : '人工客服当前不在线，问题已保留在待接待列表。你可以继续补充信息，之后在这里查看回复。';
    message(s, conv, 'system', body, now);
  }
  function complete(s, c, publicText, evidence, by, now) {
    assert(!c.service||Commerce.resultReady(s,c),'商品办理须有对应业务结果回执，不能凭答复文本办结');
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
    assert(!pending.result && !acceptedTicket(s, pending), '已有办理记录，请继续原问题');
    const existing = orderId && s.cases.find(c => c.id !== pending.id && c.customerId === conv.customerId && c.kind === 'aftersales' && c.orderId === orderId && !c.workflow?.withdrawn && (c.status !== 'completed' || c.feedback === 'pending'));
    const followups = s.tickets.filter(t => t.caseId === pending.id);
    if (!existing) {
      if (pending.orderId !== orderId && pending.workflow) delete pending.workflow.logistics;
      pending.orderId = orderId; followups.forEach(t => t.orderId = orderId); return pending;
    }
    const original = activeTicket(s, existing) || s.tickets.find(t => t.caseId === existing.id);
    assert(!followups.length, `当前问题已有跟进工单 ${followups[0]?.id}，不能合并或丢弃历史。请从${original ? '工单列表' : '问题记录'}继续原记录 ${original?.id || existing.id}`);
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
    const plan = intentions(query, conv.flow, s.schema===5);
    if(s.schema===5&&!plan.human&&!plan.policy&&Commerce.collect(s,conv,query,now)){handoff(s,conv,'商品诉求已分别记录，需核对申请或异常',now);conv.runs.push({at:now,flowVersion:conv.flow.version,query,steps:['service-intent']});return;}
    const pending = conv.pendingCaseId && get(s, 'cases', conv.pendingCaseId);
    if (plan.onlyId && pending && pending.kind === 'aftersales') {
      const c = aftersalesCase(s, conv, pending, plan.id, now); conv.pendingCaseId = '';
      const valid = s.orders.some(o => o.id === plan.id && o.customerId === conv.customerId);
      const existing = valid && acceptedTicket(s, c);
      const body = existing ? `此问题已受理，工单 ${existing.id}。请继续原记录，无需重复提交。` : valid ? '订单已核对。请填写售后原因，核对后再提交申请。' : '暂时无法核对此订单，请检查订单号或联系人工客服。';
      message(s, conv, 'bot', body, now, {caseId: c.id, intake: valid && !existing, ...(existing ? {ticketId: existing.id} : {})});
      if (!valid) handoff(s, conv, '订单归属未通过核对', now);
      conv.runs.push({at: now, flowVersion: conv.flow.version, query, steps: [valid ? 'intake' : 'orderDenied']});
      return;
    }
    const results = classify(s, query, conv.customerId, now, conv.flow, options);
    conv.runs.push({at: now, flowVersion: conv.flow.version, query, steps: results.map(r => r.kind)});
    for (const r of results) {
      if (r.kind === 'social') {
        if (!conv.aiOptOut) message(s, conv, 'bot', r.body, now);
      } else if (r.kind === 'answer') {
        const c = makeCase(s, conv, 'knowledge', query, '', now);
        const citation = {id: r.knowledge.id, version: r.knowledge.version, title: r.knowledge.title, source: r.knowledge.source, answer: r.knowledge.answer,...(r.knowledge.ruleRefs?{ruleId:r.knowledge.ruleId,ruleVersion:r.knowledge.ruleVersion,ruleRefs:copy(r.knowledge.ruleRefs)}:{})};
        complete(s, c, r.knowledge.answer, {kind: 'knowledge', citation}, 'bot', now);
        message(s, conv, 'bot', r.knowledge.answer, now, {caseId: c.id, citation});
      } else if (['order', 'askOrder', 'orderDenied', 'orderFailure'].includes(r.kind)) {
        const c = pending?.kind === 'order' && plan.onlyId ? pending : makeCase(s, conv, 'order', '查询订单与物流', plan.id, now);
        if (r.kind === 'order') {
          c.orderId = r.order.id; conv.pendingCaseId = '';
          const body = r.commerce?Commerce.summary(r.commerce):`${r.order.product}：${r.order.status}。${r.order.delivery}`;
          if(!r.commerce||r.commerce.queryStatus==='ok')complete(s, c, body, {kind: r.commerce?'simulated-commerce':'local-order', id: r.order.id, snapshot: copy(r.commerce||r.order)}, 'bot', now);
          message(s, conv, 'bot', body, now, {caseId: c.id, orderId: r.order.id});
          if(r.commerce?.queryStatus!=='ok'&&r.commerce)handoff(s,conv,'订单事实查询未取得完整结果',now);
        } else if (r.kind === 'askOrder') { conv.pendingCaseId = c.id; message(s, conv, 'bot', '请提供订单号，也可以从“我的订单”选择要查询的订单。', now, {caseId: c.id}); }
        else { message(s, conv, 'bot', r.kind === 'orderDenied' ? '暂时无法核对此订单。请确认订单号及购买账户；我不会展示其他账户的订单信息。' : '订单查询暂时不可用，没有取得最新状态。我会将已有信息交给人工核实。', now, {caseId: c.id}); handoff(s, conv, r.kind === 'orderDenied' ? '订单归属未通过核对' : '订单查询失败', now); }
      } else if (r.kind === 'intake') {
        const c = aftersalesCase(s, conv, pending, r.orderId, now);
        recordIntake(conv,c,query,now);
        if (r.orderId) conv.pendingCaseId = '';
        const existing = acceptedTicket(s, c);
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
  const serviceFingerprint=s=>JSON.stringify({knowledge:s.knowledge.map(k=>({id:k.id,live:k.live,draft:k.draft,disabled:k.disabled})),flow:{live:s.flow.live,draft:s.flow.draft},rules:s.commerce?.rules,facts:s.schema===5?{orders:s.orders,items:s.commerce.items,payments:s.commerce.payments,packages:s.commerce.packages}:null});
  function serviceEvalCurrent(s,knowledgeId=''){
    if(s.schema!==5)return true;
    const expected=serviceFingerprint(s),k=knowledgeId?s.knowledge.find(k=>k.id===knowledgeId):null;
    return Boolean(k?.validation?.service?.pass&&k.validation.service.fingerprint===expected||(s.commerce.evaluations||[]).some(e=>e.knowledgeId===knowledgeId&&e.pass&&e.fingerprint===expected));
  }
  function candidate(s, id, mode) {
    const x = copy(s);
    if (mode === 'knowledge') { const k = get(x, 'knowledge', id); assert(k.draft, '没有待验证的草稿'); k.live = {...copy(k.draft), version: (k.live?.version || 0) + 1}; k.disabled = false; }
    else { assert(x.flow.draft, '没有流程草稿'); x.flow.live = {...copy(x.flow.draft), version: x.flow.live.version + 1}; }
    return x;
  }
  function regression(s, now, articleId) {
    const ownOrder=s.orders.find(o=>o.customerId==='C001')?.id||'SO20260926001',foreignOrder=s.orders.find(o=>o.customerId!=='C001')?.id||'SO20260926009';
    const cases = [
      {name: '明确转人工', query: '我要转人工', expected: 'handoff'},
      {name: '拒绝转人工不应升级', query: '不要转人工，我只问退货规则', absent: 'handoff'},
      {name: '本人订单查询', query: '查物流 '+ownOrder, expected: 'order'},
      {name: '其他客户订单不可读', query: '查物流 '+foreignOrder, expected: 'orderDenied'},
      {name: '查询失败不能宣称成功', query: '查物流 '+ownOrder, expected: 'orderFailure', fault: true},
      {name: '多诉求分别处理', query: '查物流 '+ownOrder+'，再申请退货', expected: s.schema===5?'handoff':s.flow.live.intakeEnabled?'intake':'handoff', ...(s.schema===5?{}:{also:'order'})}
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
  function serviceEvaluation(source,now,knowledgeId='',flowDraft=false){
    assert(source.schema===5,'流程评测仅适用于电商工作空间');
    const customer={id:'C001',role:'customer'},agent={id:'lin',role:'agent'},manager={id:'manager',role:'manager'},admin={id:'admin',role:'admin'};
    const check=(ok,why)=>assert(ok,why),rows=[];
    function base(){
      let s=copy(source);if(knowledgeId&&get(s,'knowledge',knowledgeId).draft)s=candidate(s,knowledgeId,'knowledge');if(flowDraft)s=candidate(s,'','flow');
      s.conversations=[];s.cases=[];s.tickets=[];s.gaps=[];s.events=[];
      ['aftersales','returns','refunds','occupancies','handoffs','notifications','evaluations'].forEach(k=>s.commerce[k]=[]);
      s.customers.forEach(c=>c.connection='online');
      return execute(s,customer,'newConversation',{},now).state;
    }
    const step=(s,a,type,data,at=now)=>execute(s,a,type,data,at);
    const form=s=>({conversationId:s.conversations[0].id,orderId:'EC-SO20261005001',itemId:'EC-ITEM-001',quantity:1,serviceType:'return_refund',reason:'保温杯收到破损，希望退货退款',evidenceRef:'DEMO-DAMAGE-001'});
    function request(){let s=base(),data=form(s),p=step(s,customer,'previewAftersale',data);data={...data,token:p.value.token,requestId:'eval-request',confirmed:true};const r=step(p.state,customer,'confirmAftersale',data);return {s:r.state,id:r.value,caseId:r.state.commerce.aftersales[0].caseId,data};}
    function approved(){const f=request();f.s=step(f.s,agent,'claimConversation',{id:f.s.conversations[0].id}).state;f.s=step(f.s,manager,'submitReview',{aftersaleId:f.id,decision:'approved',reason:'模拟人工确认破损规则'}).state;return f;}
    function pending(){const f=approved();f.s=step(f.s,customer,'submitReturn',{aftersaleId:f.id,trackingNumber:'DEMO-EVAL-RETURN'}).state;f.s=step(f.s,admin,'applySimulatedReceipt',{aftersaleId:f.id,kind:'warehouse_received',version:1}).state;f.s=step(f.s,admin,'applySimulatedReceipt',{aftersaleId:f.id,kind:'warehouse_passed',version:2}).state;f.s=step(f.s,agent,'submitRefund',{aftersaleId:f.id,requestId:'eval-refund'}).state;return f;}
    const reject=(fn,why)=>{let failed=false;try{fn();}catch{failed=true;}check(failed,why);};
    function run(id,title,fn){try{fn();rows.push({id,title,name:title,pass:true,reason:'实际领域命令、消息及状态断言通过'});}catch(err){rows.push({id,title,name:title,pass:false,reason:err.message});}}
    run('trigger-policy','规则咨询引用执行规则且不触发申请',()=>{let s=base();s=step(s,customer,'say',{id:s.conversations[0].id,body:'保温杯退货规则是什么？'}).state;const rule=s.commerce.rules.find(r=>r.itemId==='EC-ITEM-001'),answer=s.conversations[0].messages.findLast(m=>m.role==='bot'&&m.citation);check(s.commerce.aftersales.length===0&&!s.cases.some(c=>c.service)&&answer?.citation.ruleVersion===rule?.version&&answer.body.includes(Commerce.money(rule.amountCents))&&/经理.*审核/.test(answer.body)&&(!rule.requiresReturn||/寄回.*验收/.test(answer.body)),'应引用有效执行规则、金额和前置条件且不受理');});
    run('trigger-request','明确商品诉求只收集，客户确认后才受理',()=>{let s=base();s=step(s,customer,'say',{id:s.conversations[0].id,body:'保温杯破了想退货'}).state;check(s.cases.filter(c=>c.service).length===1&&!s.commerce.aftersales.length,'应保留未决诉求');const p=step(s,customer,'previewAftersale',form(s));check(!p.state.commerce.occupancies.length,'预览不占用');});
    run('two-items','收纳袋物流与保温杯退货分别绑定',()=>{let s=base();s=step(s,customer,'say',{id:s.conversations[0].id,body:'收纳袋没到，保温杯破了想退'}).state;check(s.cases.filter(c=>c.service).length===2&&s.cases.every(c=>!c.result)&&new Set(s.cases.map(c=>c.itemId)).size===2,'应有两个未决商品事项');});
    run('happy-path','核对、审核、寄回验收、退款、通知与反馈',()=>{const f=pending(),bag=JSON.stringify(f.s.commerce.items[1]);f.s=step(f.s,admin,'applySimulatedReceipt',{aftersaleId:f.id,kind:'refund_succeeded',version:3}).state;f.s=step(f.s,admin,'applySimulatedReceipt',{aftersaleId:f.id,kind:'notification_sent',version:4}).state;f.s=step(f.s,customer,'feedback',{id:f.caseId,confirmed:true}).state;check(f.s.commerce.refunds[0].amountCents===12900&&get(f.s,'cases',f.caseId).feedback==='confirmed'&&JSON.stringify(f.s.commerce.items[1])===bag,'成功回执与商品隔离须成立');});
    run('review-reject','拒绝明确说明并只释放未用占用',()=>{const f=request();f.s=step(f.s,manager,'submitReview',{aftersaleId:f.id,decision:'rejected',reason:'模拟不满足适用条件'}).state;check(f.s.commerce.occupancies[0].state==='released'&&get(f.s,'cases',f.caseId).result.evidence.decision==='rejected','拒绝结果须有决定依据');});
    run('supplement','补件接续原申请与原期限',()=>{const f=request(),due=get(f.s,'cases',f.caseId).dueAt;f.s=step(f.s,manager,'submitReview',{aftersaleId:f.id,decision:'needs_info',reason:'补充破损描述'}).state;f.s=step(f.s,customer,'submitSupplement',{aftersaleId:f.id,body:'杯体有裂痕',evidenceRef:'DEMO-DAMAGE-001'}).state;check(f.s.commerce.aftersales.length===1&&f.s.commerce.aftersales[0].status==='awaiting_review'&&get(f.s,'cases',f.caseId).dueAt===due,'不得新建或静默延长');});
    run('handoff-timeout','交接超时原负责人仍承接',()=>{const f=approved();f.s=step(f.s,agent,'proposeHandoff',{caseId:f.caseId,targetId:'zhou',reason:'晚班续办',dueAt:now+60000}).state;f.s=step(f.s,manager,'expireHandoffs',{},now+60001).state;check(f.s.commerce.handoffs[0].status==='expired'&&get(f.s,'cases',f.caseId).ownerId==='lin','超时不能丢责');});
    run('refund-unknown','未知查原流水且不能凭文本办结',()=>{const f=pending();f.s=step(f.s,admin,'applySimulatedReceipt',{aftersaleId:f.id,kind:'refund_unknown',version:3}).state;check(step(f.s,agent,'queryRefund',{aftersaleId:f.id}).value.requestId==='eval-refund'&&get(f.s,'cases',f.caseId).status==='open','应保留原请求和未决');reject(()=>step(f.s,agent,'updateTicket',{id:f.s.tickets[0].id,status:'done',publicText:'完成',evidence:'文字'}),'文本不得伪造退款');});
    run('refund-idempotent','确认重放与重复退款被守卫',()=>{const f=pending();f.s=step(f.s,customer,'confirmAftersale',f.data).state;f.s=step(f.s,agent,'submitRefund',{aftersaleId:f.id,requestId:'eval-refund'}).state;reject(()=>step(f.s,agent,'submitRefund',{aftersaleId:f.id,requestId:'different'}),'不能另建义务');check(f.s.commerce.refunds.length===1&&f.s.commerce.occupancies.length===1,'只执行一次');});
    run('changed-intent','改意图提出撤回，待回执后释放',()=>{const f=request();f.s=step(f.s,customer,'requestWithdrawal',{aftersaleId:f.id,reason:'想保留商品，撤回'}).state;check(f.s.commerce.occupancies[0].state==='reserved','本地撤回不能释放');f.s=step(f.s,admin,'applySimulatedReceipt',{aftersaleId:f.id,kind:'withdrawal_confirmed',version:1}).state;check(f.s.commerce.occupancies[0].state==='released','安全终止后方可释放');});
    run('query-failure','查询故障保持未决且不显示未支付',()=>{let s=base();s.commerce.payments[0].queryStatus='failed';s=step(s,customer,'say',{id:s.conversations[0].id,body:'查支付 EC-SO20261005001'}).state;check(s.cases.some(c=>c.status==='open'&&!c.result)&&s.conversations[0].state==='queued'&&!s.conversations[0].messages.at(-2).body.includes('未支付'),'失败不能算查询成功');});
    run('notification-failure','通知失败与退款结果、满意度独立',()=>{const f=pending();f.s=step(f.s,admin,'applySimulatedReceipt',{aftersaleId:f.id,kind:'refund_succeeded',version:3}).state;f.s=step(f.s,admin,'applySimulatedReceipt',{aftersaleId:f.id,kind:'notification_failed',version:4}).state;check(f.s.commerce.refunds[0].status==='succeeded'&&get(f.s,'cases',f.caseId).feedback==='pending'&&f.s.commerce.notifications[0].status==='failed','各状态不可互相替代');});
    return {id:uid(copy(source),'EV'),knowledgeId,at:now,fingerprint:serviceFingerprint(source),pass:rows.every(r=>r.pass),rows,dependencies:{flowVersion:source.flow.live.version,ruleVersions:source.commerce.rules.map(r=>({id:r.id,version:r.version})),knowledgeVersions:source.knowledge.map(k=>({id:k.id,version:k.live?.version||0,candidate:knowledgeId===k.id}))},simulated:true};
  }
  const SOP = [['intent','确认诉求'],['order','核对订单'],['logistics','查询物流'],['aftersales','退换货办理'],['information','补充资料'],['result','记录处理结果'],['callback','回访安排'],['close','结束沟通']];
  const wf = c => c.workflow ||= {overrides: {}};
  const latestCustomer = c => [...c.messages].reverse().find(m => m.role === 'customer');
  const currentOrder = (s, c) => s.orders.find(o => o.id === c?.orderId && o.customerId === c?.customerId);
  const customerConnection = (s, id) => get(s, 'customers', id).connection || 'online';
  function pauseAi(conv, reason, now) { if (conv.aiAssist?.enabled) { conv.aiAssist.enabled = false; conv.aiAssist.history.push({at: now, action: 'paused', reason}); } }
  function scopedCase(s, a, conversationId, caseId) {
    const conv = get(s, 'conversations', conversationId), c = get(s, 'cases', caseId);
    if(c.service)Commerce.access(s,a,c);else agentOwns(a, conv); assert(conv.state === 'human' && conv.caseIds.includes(c.id) && c.customerId === conv.customerId, '问题不属于当前接待');
    return {conv, c};
  }
  function bindCaseOrder(s, conv, c, orderId, now) {
    const id = text(orderId, '订单号', 80).toUpperCase();
    assert(s.orders.some(o => o.id === id && o.customerId === c.customerId), '订单归属尚未核对');
    if (c.orderId !== id) { assert(!c.result && !acceptedTicket(s, c), '已有办理记录，不能更换订单'); if (c.workflow) delete c.workflow.logistics; }
    if (c.kind === 'aftersales' && c.orderId !== id) c = aftersalesCase(s, conv, c, id, now);
    else c.orderId = id;
    s.tickets.filter(t => t.caseId === c.id && t.followupOnly === true).forEach(t => t.orderId = id);
    wf(c).orderCheckedAt = now;
    if (conv.pendingCaseId === c.id) conv.pendingCaseId = '';
    return c;
  }
  function recordIntake(conv,c,body,now) {
    const f=wf(c); f.prefill ||= {serviceType:'',description:'',exchangeRequest:'',extraNote:''};
    if (/换货/.test(body)) f.prefill.serviceType='exchange'; else if (/退货|退款/.test(body)) f.prefill.serviceType='return';
    const demand=body.split(/[，,。；;\n]/).map(clause=>{
      const match=clause.match(/(?:更换为|换成|换为)\s*(.+)/);
      return match && !/(不要|不用|不想|不需要|暂不|不能|别)/.test(clause.slice(0,match.index)) ? match[1].trim().slice(0,200) : '';
    }).find(Boolean);
    f.prefill.exchangeRequest=f.prefill.serviceType==='exchange' ? demand || '' : '';
    f.prefill.description=body;
    f.intentEvidence={messageId:latestCustomer(conv)?.id || '',text:body,at:now};
  }
  function recognise(s, conv, body, now) {
    if(s.schema===5){
      if(!intentions(body,conv.flow,true).policy&&Commerce.collect(s,conv,body,now))return;
      const services=conv.caseIds.map(id=>get(s,'cases',id)).filter(c=>c.service&&c.status!=='completed');
      const p=intentions(body,conv.flow,true);
      if(services.length&&!p.lookup&&!p.intake&&!p.policy&&!p.human){
        const m=conv.messages.at(-1);if(services.length===1){m.caseId=services[0].id;services[0].serviceVersion++;services[0].serviceHistory.push({at:now,text:'客户补充：'+body});}
        else message(s,conv,'system','补充已保留；请从对应商品事项提交材料，便于审核者准确关联。',now);return;
      }
    }
    const p = intentions(body, conv.flow,s.schema===5), ids = [...new Set((body.match(/\bSO[A-Z0-9]+\b/gi) || []).map(x => x.toUpperCase()))];
    const open = conv.caseIds.map(id => get(s, 'cases', id)).filter(c => c.status !== 'completed' && !c.workflow?.withdrawn);
    let c;
    if (ids.length <= 1 && !p.human && (p.intake || (p.onlyId && conv.pendingCaseId && get(s, 'cases', conv.pendingCaseId).kind === 'aftersales'))) {
      const pending = open.find(x => x.kind === 'aftersales' && !x.orderId && !x.result && !acceptedTicket(s, x));
      c = pending ? aftersalesCase(s, conv, pending, p.id, now) : makeCase(s, conv, 'aftersales', '售后申请', p.id, now);
      if (!p.onlyId) recordIntake(conv,c,body,now);
      if (p.lookup) {
        const lookup=open.find(x=>x.kind==='order' && x.orderId===p.id) || makeCase(s,conv,'order','查询订单与物流',p.id,now);
        lookup.humanTouched=true; wf(lookup).intentEvidence={messageId:latestCustomer(conv).id,text:body,at:now};
      }
      if (!c.orderId) conv.pendingCaseId = c.id;
    } else if (ids.length <= 1 && !p.human && (p.lookup || p.onlyId)) {
      c = open.find(x => x.kind === 'order' && (!x.orderId || x.orderId === p.id)) || makeCase(s, conv, 'order', '查询订单与物流', p.id, now);
      if (p.id && !c.result && !acceptedTicket(s, c)) { c.orderId = p.id; s.tickets.filter(t => t.caseId === c.id && t.followupOnly === true).forEach(t => t.orderId = p.id); }
      if (!p.id) conv.pendingCaseId = c.id;
    } else if (!open.length || ids.length > 1) c = makeCase(s, conv, 'support', body, '', now);
    else c = open.find(x => x.kind === 'support') || open.at(-1);
    c.humanTouched = true;
    conv.messages.at(-1).caseId = c.id;
    if (/(停止|不要|不用|别).{0,8}(AI|ai|机器人|自动回复)/.test(body)) { conv.aiOptOut = true; pauseAi(conv, '客户要求停止 AI 协助', now); }
  }
  function suggestion(s, conversationId, caseId, now = Date.now()) {
    const conv = get(s, 'conversations', conversationId), c = caseId ? get(s, 'cases', caseId) : conv.caseIds.length ? get(s, 'cases', conv.caseIds.at(-1)) : null;
    assert(!c || conv.caseIds.includes(c.id), '问题不属于当前会话');
    const m = latestCustomer(conv), query = m?.body || '', k = query ? retrieve(s, query, now,query,conv.customerId) : null;
    const token = JSON.stringify({conv: conv.id, owner: conv.ownerId, state: conv.state, message: m || null, case: c ? {id: c.id, kind: c.kind, orderId: c.orderId, status: c.status} : null, order: currentOrder(s, c) || null, referencedOrders: s.orders.filter(o=>o.customerId===conv.customerId && (query.toUpperCase().includes(o.id)||o.id===c?.orderId)).map(o=>({...o,...(s.schema===5?{commerce:Commerce.snapshot(s,o.id)}:{})})), knowledge: k, connection: customerConnection(s, conv.customerId)});
    if (!k || k.conflict) return {token, messageId: m?.id || '', query, body: '', status: k?.conflict ? 'conflict' : 'none', reason: k?.conflict ? '知识来源冲突，需要人工核实' : '尚无有效知识依据，请人工核实'};
    return {token, messageId: m.id, query, body: k.answer, status: 'ready', knowledge: {id: k.id, title: k.title, version: k.version, source: k.source, answer: k.answer,...(k.ruleRefs?{ruleId:k.ruleId,ruleVersion:k.ruleVersion,ruleRefs:copy(k.ruleRefs)}:{})}};
  }
  function sopView(s, conversationId, caseId, now = Date.now()) {
    const conv = get(s, 'conversations', conversationId), c = caseId ? get(s, 'cases', caseId) : conv.caseIds.length ? get(s, 'cases', conv.caseIds.at(-1)) : null;
    assert(!c || conv.caseIds.includes(c.id), '问题不属于当前会话');
    const f = c?.workflow || {}, order = currentOrder(s, c), t = c && (activeTicket(s, c) || s.tickets.find(x => x.caseId === c.id));
    const accepted = c && acceptedTicket(s, c);
    const bound = Boolean(order), isOrder = c?.kind === 'order', sale = c?.kind === 'aftersales', done = c?.status === 'completed';
    const answered = c && conv.messages.some(m => m.caseId === c.id && m.visibility === 'public' && !m.aiAssist && m.at >= c.createdAt && ['agent','bot'].includes(m.role));
    const states = !c ? {} : {intent: c.kind === 'support' && !f.intentConfirmedAt && !done && !c.result && !answered ? 'todo' : 'done', order: isOrder || sale ? (bound ? 'done' : 'todo') : 'idle', logistics: isOrder ? ((f.logistics && (!f.logistics.commerce || f.logistics.commerce.queryStatus==='ok')) || c.result?.evidence?.kind==='local-order' || (c.result?.evidence?.kind==='simulated-commerce' && c.result.evidence.snapshot.queryStatus==='ok') ? 'done' : 'todo') : 'idle', aftersales: sale ? (accepted ? 'done' : bound ? 'doing' : 'todo') : 'idle', information: t?.status === 'waiting_customer' ? 'waiting' : sale && !accepted ? 'todo' : 'idle', result: done ? 'done' : t ? (t.status==='waiting_customer'?'waiting':'doing') : 'todo', callback: t?.callback ? 'done' : 'idle'};
    const nodes = SOP.map(([key, title]) => {
      const override = f.overrides?.[key];
      let status = key === 'close' ? (conv.state === 'closed' ? 'done' : customerConnection(s, conv.customerId) === 'online' ? 'idle' : 'todo') : (states[key] || 'idle');
      let reason = status === 'idle' ? '当前诉求未触发此节点' : status === 'done' ? '已有可核对记录' : '需要继续处理';
      if (key !== 'close' && f.withdrawn) { status = 'na'; reason = f.withdrawn.reason; }
      else if (override && key !== 'close' && status !== 'done') { status = override.status; reason = override.reason; }
      if (key === 'order' && (isOrder || sale) && !bound) reason = c.orderId ? '订单归属尚未核对，请选择本人订单' : '等待客户提供订单';
      if (key==='intent' && f.intentEvidence) reason=`客户原话：${f.intentEvidence.text}`;
      const n = {key, title, status, reason, ...(t ? {ticketId: t.id} : {})};
      if (key === 'aftersales') n.steps = [{title:'确认类型与原因',status:sale?(accepted?'done':f.prefill?.serviceType?'doing':'todo'):'idle'},{title:'核对规则及缺失信息',status:sale?(accepted?'done':'todo'):'idle'},{title:'核对申请',status:sale?(accepted?'done':'todo'):'idle'},{title:'登记受理',status:sale?(accepted?'done':'todo'):'idle'}];
      return n;
    });
    const p = f.prefill || {};
    return {caseId:c?.id || '',caseTitle:c?.title || '尚无待处理问题',orderId:c?.orderId || '',nodes,prefill:{serviceType:accepted?.serviceType || p.serviceType || '',description:accepted?.description || p.description || '',exchangeRequest:accepted?.exchangeRequest || p.exchangeRequest || '',extraNote:accepted?.extraNote || p.extraNote || ''},suggestion:suggestion(s,conversationId,c?.id,now)};
  }
  function closePreview(s, conversationId, now = Date.now()) {
    const conv = get(s, 'conversations', conversationId), cases = conv.caseIds.map(id => get(s, 'cases', id)), tickets = s.tickets.filter(t => conv.caseIds.includes(t.caseId));
    const items = cases.filter(c => c.status !== 'completed').flatMap(c => sopView(s, conv.id, c.id, now).nodes.filter(n => n.key !== 'close' && !['idle','done','na'].includes(n.status)).map(n => {
      const t = tickets.find(t => t.id === n.ticketId);
      return {caseId:c.id,caseTitle:c.title,nodeKey:n.key,title:n.title,status:n.status,reason:n.reason,...(t?{ticketId:t.id,ownerId:t.ownerId,dueAt:t.dueAt}:{})};
    }));
    return {token:JSON.stringify({id:conv.id,state:conv.state,ownerId:conv.ownerId,messages:conv.messages,cases,tickets,connection:get(s,'customers',conv.customerId).connectionChangedAt || 0}),summary:cases.map(c=>`${c.title}：${c.status==='completed'?'已形成结果':'待继续跟进'}`).join('；').slice(0,1000),items,history:copy(conv.closures || [])};
  }
  function aiPending(s, conversationId, now = Date.now()) {
    const conv = get(s, 'conversations', conversationId), grant = conv.aiAssist, m = latestCustomer(conv);
    if (!grant?.enabled || grant.remaining < 1 || conv.state !== 'human' || !conv.ownerId || grant.ownerId !== conv.ownerId || conv.aiOptOut || customerConnection(s,conv.customerId) !== 'online' || !m || grant.respondedMessageIds.includes(m.id)) return null;
    const index = conv.messages.findIndex(x=>x.id===m.id);
    if (conv.messages.slice(index+1).some(x=>x.role==='agent' && x.visibility==='public')) return null;
    const c = m.caseId && conv.caseIds.includes(m.caseId) ? get(s,'cases',m.caseId) : conv.caseIds.length ? get(s,'cases',conv.caseIds.at(-1)) : null;
    if (c?.status==='completed' || c?.workflow?.withdrawn) return null;
    const sg = suggestion(s,conv.id,c?.id,now), p = intentions(m.body,conv.flow,s.schema===5);
    if(s.schema===5&&classify(s,m.body,conv.customerId,now,conv.flow).some(r=>r.kind==='handoff'))return null;
    if (p.human || socialReply(m.body) || new Set((m.body.match(/\bSO[A-Z0-9]+\b/gi)||[]).map(x=>x.toUpperCase())).size>1 || sg.status==='conflict') return null;
    let body = sg.status==='ready' ? sg.body : '', citation = sg.knowledge;
    if (p.lookup || p.onlyId) {
      const order = s.orders.find(o=>o.id===(p.id || c?.orderId) && o.customerId===conv.customerId);
      const facts=order&&s.schema===5?Commerce.snapshot(s,order.id):null;
      body = facts?(facts.queryStatus==='ok'?Commerce.summary(facts):''):order?`${order.product}：${order.status}。${order.delivery}`:!p.id&&!c?.orderId?'请提供订单号，我会继续核对订单信息。':''; citation = null;
    } else if (p.intake || c?.kind==='aftersales') { body = currentOrder(s,c) ? '请补充退换货原因及具体要求，客服核对申请后会继续受理。' : '请提供本人订单号，以便核对售后申请。'; citation = null; }
    if (!body) return null;
    return {id:conv.id,ownerId:conv.ownerId,messageId:m.id,token:JSON.stringify({suggestion:sg.token,generation:grant.generation,remaining:grant.remaining,connectionAt:get(s,'customers',conv.customerId).connectionChangedAt || 0,body}),dueAt:Math.max(m.at,grant.grantedAt)+30000,remaining:grant.remaining,body,...(citation?{citation}:{})};
  }
  function saveCallback(s, a, ticketId, data, now) {
    const t = get(s,'tickets',ticketId); agentOwns(a,t);
    const at = Number(data.at); assert(Number.isFinite(at) && at>now,'回访时间须晚于当前时间');
    const purpose = text(data.purpose,'回访目的',1000), note = String(data.note || '').trim(); assert(note.length<=1000,'回访备注不能超过 1000 字');
    const history = t.callback ? [...t.callback.history,{at:now,action:'rescheduled',previous:copy({...t.callback,history:undefined}),actorId:a.id}] : [];
    t.callback = {purpose,at,note,status:'pending',history}; return t;
  }
  function followupTicket(s,a,c,now,dueAt) {
    let t = activeTicket(s,c);
    if (t) { agentOwns(a,t); return t; }
    const duplicate = c.kind === 'aftersales' && otherAftersalesTicket(s, c);
    assert(!duplicate, `同一订单已有办理中的售后，请从工单列表继续原工单 ${duplicate?.id}`);
    t = {id:uid(s,'TK'),customerId:c.customerId,teamId:'service',caseId:c.id,title:`跟进：${c.title}`.slice(0,100),description:'按会话关闭记录继续跟进未完成事项。',orderId:c.orderId,status:'working',priority:'normal',ownerId:a.id,createdAt:now,dueAt,followupOnly:true,requestKey:'',requestFingerprint:'',history:[{at:now,publicText:'已安排客服继续跟进。',actor:a.name}]};
    s.tickets.unshift(t); c.humanTouched=true; return t;
  }
  function intakeToken(s,caseId,orderId,conversationId) {
    const c=get(s,'cases',caseId), conv=conversationId?get(s,'conversations',conversationId):c.conversationIds.map(id=>get(s,'conversations',id)).find(v=>v.customerId===c.customerId);
    assert(conv && conv.caseIds.includes(c.id) && conv.customerId===c.customerId,'问题不属于当前会话');
    const order=s.orders.find(o=>o.id===String(orderId || c.orderId).toUpperCase() && o.customerId===c.customerId);
    assert(order,'订单归属尚未核对');
    return JSON.stringify({caseId:c.id,customerId:c.customerId,kind:c.kind,orderId:c.orderId,status:c.status,result:c.result,order,policy:retrieve(s,'退货规则'),conversationId:conv.id,ownerId:conv.ownerId,state:conv.state,message:latestCustomer(conv) || null,tickets:s.tickets.filter(t=>t.caseId===c.id || (t.customerId===c.customerId && t.orderId===order.id)).map(t=>({id:t.id,caseId:t.caseId,status:t.status,ownerId:t.ownerId,followupOnly:t.followupOnly===true}))});
  }
  function intakeFingerprint(data,title,description) {
    return JSON.stringify({caseId:data.caseId,conversationId:data.conversationId || '',orderId:String(data.orderId || '').toUpperCase(),title,description,serviceType:data.serviceType,exchangeRequest:String(data.exchangeRequest || '').trim(),extraNote:String(data.extraNote || '').trim()});
  }
  function receipt(t,a,data,fp,now) {
    if (data.structured && data.requestKey) { t.intakeReceipts ||= []; t.intakeReceipts.push({requestKey:data.requestKey,fingerprint:fp,actorId:a.id,at:now}); }
  }
  function validWorkflow(s) {
    const obj=x=>x && typeof x==='object' && !Array.isArray(x), str=x=>typeof x==='string', time=x=>Number.isFinite(x), arr=Array.isArray;
    const hasAgent=id=>s.staff.some(a=>a.id===id && a.role==='agent');
    const callback=x=>obj(x) && str(x.purpose) && x.purpose.length>0 && x.purpose.length<=1000 && time(x.at) && str(x.note) && x.note.length<=1000 && ['pending','contacted','cancelled'].includes(x.status) && arr(x.history) && x.history.every(h=>obj(h) && time(h.at) && hasAgent(h.actorId));
    return s.customers.every(c=>(c.connection===undefined || ['online','interrupted','offline'].includes(c.connection)) && (c.connectionChangedAt===undefined || time(c.connectionChangedAt))) &&
      s.cases.every(c=>c.workflow===undefined || (obj(c.workflow) && (c.workflow.withdrawn===undefined || (obj(c.workflow.withdrawn) && time(c.workflow.withdrawn.at) && str(c.workflow.withdrawn.reason) && hasAgent(c.workflow.withdrawn.actorId))) && (c.workflow.intentEvidence===undefined || (obj(c.workflow.intentEvidence) && str(c.workflow.intentEvidence.messageId) && str(c.workflow.intentEvidence.text) && time(c.workflow.intentEvidence.at))) && (c.workflow.intentConfirmedAt===undefined || time(c.workflow.intentConfirmedAt)) && (c.workflow.orderCheckedAt===undefined || time(c.workflow.orderCheckedAt)) && (c.workflow.logistics===undefined || (obj(c.workflow.logistics) && time(c.workflow.logistics.at) && hasAgent(c.workflow.logistics.actorId) && c.workflow.logistics.order?.id===c.orderId && c.workflow.logistics.order?.customerId===c.customerId)) && (c.workflow.prefill===undefined || (obj(c.workflow.prefill) && ['', 'return','exchange'].includes(c.workflow.prefill.serviceType) && ['description','exchangeRequest','extraNote'].every(k=>str(c.workflow.prefill[k])))) && (c.workflow.overrides===undefined || (obj(c.workflow.overrides) && Object.entries(c.workflow.overrides).every(([k,v])=>SOP.some(([key])=>key===k && k!=='close') && obj(v) && ['na','waiting','todo'].includes(v.status) && str(v.reason) && v.reason.length>0 && time(v.at) && hasAgent(v.actorId)))))) &&
      s.tickets.every(t=>(t.followupOnly===undefined || typeof t.followupOnly==='boolean') && (t.followupOnly!==true || (t.serviceType===undefined && t.intakeReceipts===undefined)) && (t.intakeReceipts===undefined || (arr(t.intakeReceipts) && new Set(t.intakeReceipts.map(r=>r?.requestKey)).size===t.intakeReceipts.length && t.intakeReceipts.every(r=>obj(r) && str(r.requestKey) && r.requestKey.length>0 && str(r.fingerprint) && time(r.at) && (r.actorId===t.customerId || hasAgent(r.actorId))))) && (t.serviceType===undefined || (['return','exchange'].includes(t.serviceType) && str(t.exchangeRequest) && str(t.extraNote) && t.exchangeRequest.length<=200 && t.extraNote.length<=1000 && (t.serviceType!=='exchange' || t.exchangeRequest.length>0) && s.cases.some(c=>c.id===t.caseId && c.kind==='aftersales' && c.customerId===t.customerId && c.orderId===t.orderId))) && (t.callback===undefined || (callback(t.callback) && s.staff.some(a=>a.id===t.ownerId && a.role==='agent' && a.teams.includes(t.teamId))))) &&
      s.conversations.every(c=>(c.aiOptOut===undefined || typeof c.aiOptOut==='boolean') && (c.aiAssist===undefined || (obj(c.aiAssist) && typeof c.aiAssist.enabled==='boolean' && hasAgent(c.aiAssist.ownerId) && time(c.aiAssist.grantedAt) && Number.isInteger(c.aiAssist.generation) && c.aiAssist.generation>0 && Number.isInteger(c.aiAssist.remaining) && c.aiAssist.remaining>=0 && c.aiAssist.remaining<=2 && arr(c.aiAssist.respondedMessageIds) && c.aiAssist.respondedMessageIds.every(id=>c.messages.some(m=>m.id===id && m.role==='customer')) && arr(c.aiAssist.history) && c.aiAssist.history.every(h=>obj(h) && time(h.at) && str(h.action)) && (!c.aiAssist.enabled || (c.state==='human' && c.ownerId===c.aiAssist.ownerId && !c.aiOptOut && customerConnection(s,c.customerId)==='online')))) && (c.closures===undefined || (arr(c.closures) && new Set(c.closures.map(x=>x.id)).size===c.closures.length && c.closures.every(x=>obj(x) && str(x.id) && time(x.at) && hasAgent(x.actorId) && str(x.reason) && str(x.summary) && x.summary.length<=1000 && str(x.requestKey) && str(x.requestFingerprint) && arr(x.items) && arr(x.sop) && arr(x.callbacks) && x.items.every(i=>obj(i) && str(i.caseId) && SOP.some(([key])=>key===i.nodeKey && key!=='close') && ['existing','new','callback','na','withdrawn'].includes(i.action) && str(i.reason))))));
  }
  function execute(state, identity, type, data = {}, now = Date.now()) {
    const s = copy(state), a = actor(s, identity);
    assert(roles[a.role]?.includes(type), '当前角色无权执行此操作');
    if (a.role==='customer' && type!=='customerConnection') assert(customerConnection(s,a.id)==='online','当前连接不可用，请恢复在线后操作');
    if(s.schema===5)Commerce.ensure(s);
    let value;
    switch (type) {
      case 'previewAftersale':case 'confirmAftersale':case 'submitReview':case 'submitReturn':case 'submitSupplement':case 'requestWithdrawal':case 'submitRefund':case 'queryRefund':case 'applySimulatedReceipt':case 'proposeHandoff':case 'acceptHandoff':case 'rejectHandoff':case 'expireHandoffs':case 'serviceFollowup':case 'resolveLogistics':case 'serviceDispute':case 'resolveServiceDispute':case 'serviceReply':
        value=Commerce.command(s,a,type,data,now);break;
      case 'runServiceEval':{
        assert(s.schema===5,'请进入电商工作空间');value=serviceEvaluation(s,now,data.knowledgeId||'');s.commerce.evaluations.push(copy(value));break;
      }
      case 'confirmIntent': {
        const {conv,c} = scopedCase(s,a,data.conversationId,data.caseId);
        assert(!c.service||data.kind===c.kind,'商品诉求不能通过通用确认更换业务类型');
        assert(['knowledge','order','aftersales','support'].includes(data.kind),'诉求类型无效');
        assert(c.kind===data.kind || (!c.result && !acceptedTicket(s,c)),'已有办理记录，不能更换诉求类型');
        c.kind=data.kind; if (data.title) c.title=text(data.title,'诉求说明',200); wf(c).intentConfirmedAt=now; pauseAi(conv,'诉求核对已更新',now); value=c.id; break;
      }
      case 'bindOrder': {
        const {conv,c} = scopedCase(s,a,data.conversationId,data.caseId); assert(['order','aftersales'].includes(c.kind),'此诉求不需要绑定订单');
        assert(!c.service||data.orderId===c.orderId,'商品事项已绑定原订单，不能换绑');
        value=bindCaseOrder(s,conv,c,data.orderId,now).id; pauseAi(conv,'订单核对已更新',now); break;
      }
      case 'queryOrder': {
        const {c} = scopedCase(s,a,data.conversationId,data.caseId), order=currentOrder(s,c); assert(order,'请先核对本人订单');
        const facts=s.schema===5?Commerce.snapshot(s,order.id):null;
        wf(c).logistics={at:now,order:copy(order),actorId:a.id,...(facts?{commerce:facts}:{})}; value={body:facts?Commerce.summary(facts):`${order.product}：${order.status}。${order.delivery}`,order:{...copy(order),...(facts?{commerce:facts}:{})}}; break;
      }
      case 'queryCommerce': {
        const order=s.orders.find(o=>o.id===data.orderId);assert(order,'暂时无法核对此订单');
        if(a.role==='customer')owns(a,order);
        else{const conv=get(s,'conversations',data.conversationId);agentOwns(a,conv);assert(conv.state==='human'&&order.customerId===conv.customerId,'请核对已接管客户的本人订单');}
        value=Commerce.snapshot(s,order.id,data);break;
      }
      case 'markSop': {
        const {c} = scopedCase(s,a,data.conversationId,data.caseId);
        assert(!c.service,'商品办理节点由业务记录和回执决定，不能人工标为不适用');
        assert(SOP.some(([key])=>key===data.nodeKey) && data.nodeKey!=='close','节点无效');
        assert(['na','waiting','todo'].includes(data.status),'节点状态无效');
        const node=sopView(s,data.conversationId,c.id,now).nodes.find(n=>n.key===data.nodeKey);
        assert(node.status!=='done','已有完成依据，不能覆盖节点状态');
        assert(!(c.kind==='aftersales' && acceptedTicket(s,c) && data.status==='na'),'已受理售后须继续原工单');
        wf(c).overrides ||= {}; wf(c).overrides[data.nodeKey]={status:data.status,reason:text(data.reason,'节点说明',500),at:now,actorId:a.id}; break;
      }
      case 'setAiAssist': {
        const conv=get(s,'conversations',data.id); agentOwns(a,conv); assert(conv.state==='human','请先接管会话'); assert(typeof data.enabled==='boolean','授权状态无效');
        if (!data.enabled) { pauseAi(conv,'客服暂停 AI 协助',now); break; }
        assert(!conv.aiOptOut,'客户已要求停止 AI 协助'); assert(customerConnection(s,conv.customerId)==='online','客户当前不在线');
        if (conv.aiAssist?.enabled) break;
        const prior=conv.aiAssist;
        conv.aiAssist={enabled:true,ownerId:a.id,grantedAt:now,generation:(prior?.generation || 0)+1,remaining:2,respondedMessageIds:prior?.respondedMessageIds || [],history:[...(prior?.history || []),{at:now,action:'authorized',actorId:a.id}]}; break;
      }
      case 'aiContinue': {
        const conv=get(s,'conversations',data.id); agentOwns(a,conv); const p=aiPending(s,conv.id,now);
        assert(p && p.messageId===data.messageId && p.token===data.token && now>=p.dueAt,'AI 协助已失效或尚未到发送时间');
        message(s,conv,'bot',p.body,now,{aiAssist:true,...(p.citation?{citation:copy(p.citation)}:{})});
        conv.aiAssist.remaining--; conv.aiAssist.respondedMessageIds.push(p.messageId);
        conv.aiAssist.history.push({at:now,action:'sent',authorizedBy:conv.aiAssist.ownerId,messageId:p.messageId,source:p.citation?copy(p.citation):'本人订单事实或信息收集'});
        if (!conv.aiAssist.remaining) pauseAi(conv,'本次授权次数已用完',now); value=conv.messages.at(-1).id; break;
      }
      case 'customerConnection': {
        assert(['online','interrupted','offline'].includes(data.status),'连接状态无效'); const customer=get(s,'customers',a.id);
        customer.connection=data.status; customer.connectionChangedAt=now;
        if (data.status!=='online') s.conversations.filter(c=>c.customerId===a.id).forEach(c=>pauseAi(c,'客户连接已中断',now)); break;
      }
      case 'saveCallback': { value=saveCallback(s,a,data.ticketId,data,now).id; break; }
      case 'callbackResult': {
        const t=get(s,'tickets',data.ticketId); agentOwns(a,t); assert(t.callback?.status==='pending','当前没有待处理回访');
        assert(['contacted','unreachable','cancelled'].includes(data.result),'回访结果无效'); const summary=text(data.summary,'回访结果说明',1000);
        if (data.result==='unreachable') { assert(Number.isFinite(Number(data.nextAt)) && Number(data.nextAt)>now,'未联系到客户时须设置下次回访时间'); t.callback.at=Number(data.nextAt); }
        else t.callback.status=data.result;
        t.callback.history.push({at:now,result:data.result,summary,nextAt:data.result==='unreachable'?Number(data.nextAt):null,actorId:a.id}); break;
      }
      case 'closeWithSummary': {
        const conv=get(s,'conversations',data.id), requestKey=text(data.requestKey,'提交标识',200), requestFingerprint=JSON.stringify(data);
        const previous=conv.closures?.find(x=>x.requestKey===requestKey);
        if (previous) { assert(previous.actorId===a.id && previous.requestFingerprint===requestFingerprint,'关闭标识已用于其他内容'); value=previous.id; break; }
        agentOwns(a,conv); assert(conv.state==='human','请先接管会话');
        const preview=closePreview(s,conv.id,now); assert(data.token===preview.token,'会话或跟进安排已变化，请重新核对关闭记录');
        const reason=text(data.reason,'关闭原因',500), summary=text(data.summary,'会话总结',1000);
        assert(Array.isArray(data.items) && data.items.length===preview.items.length,'请逐项安排未完成事项');
        assert(Array.isArray(data.callbacks || []),'回访安排格式无效');
        const callbacks=data.callbacks || [], keys=new Set(), arrangements=new Map(), targetTimes=new Map(), disposition=[];
        assert(new Set(callbacks.map(x=>x.caseId)).size===callbacks.length,'每个问题只能安排一条回访');
        for (const item of data.items) {
          const key=`${item.caseId}:${item.nodeKey}`, original=preview.items.find(x=>x.caseId===item.caseId && x.nodeKey===item.nodeKey);
          assert(original && !keys.has(key),'未完成事项重复或已变化'); keys.add(key);
          assert(['existing','new','callback','na','withdrawn'].includes(item.action),'遗留事项安排无效');
          const why=text(item.reason,'跟进安排说明',500), c=get(s,'cases',item.caseId); let t;
          if (['na','withdrawn'].includes(item.action)) {
            assert(c.status !== 'completed','已完成问题不能标为不适用或客户撤回');
            assert(!(c.kind==='aftersales' && acceptedTicket(s,c)),'已受理售后不能通过关闭取消');
            assert(!s.tickets.some(t=>t.caseId===c.id && t.status!=='done'),'已有办理任务，请保留跟进安排');
            wf(c).overrides ||= {}; wf(c).overrides[item.nodeKey]={status:'na',reason:why,at:now,actorId:a.id};
          } else {
            const dueAt=Number(item.dueAt || (item.ticketId && get(s,'tickets',item.ticketId).dueAt) || now+s.settings.ticketHours*3600000);
            assert(Number.isFinite(dueAt) && dueAt>now,'跟进目标时间须晚于当前时间');
            if (item.action==='existing') {
              t=get(s,'tickets',item.ticketId); assert(t.caseId===c.id && t.customerId===conv.customerId && t.status!=='done' && t.ownerId && within(a,t),'请关联同一问题且已分配负责人的办理中工单');
              if (dueAt!==t.dueAt) { agentOwns(a,t); t.dueAt=dueAt; }
            } else {
              if (item.action==='callback') assert(callbacks.some(x=>x.caseId===c.id),'请填写对应问题的回访计划');
              t=arrangements.get(c.id) || followupTicket(s,a,c,now,dueAt); agentOwns(a,t); t.dueAt=dueAt;
            }
            assert(!targetTimes.has(t.id) || targetTimes.get(t.id)===t.dueAt,'同一工单的跟进目标时间必须一致');
            targetTimes.set(t.id,t.dueAt); arrangements.set(c.id,t);
          }
          disposition.push({...copy(original),action:item.action,reason:why,...(t?{ticketId:t.id,ownerId:t.ownerId,dueAt:t.dueAt}:{})});
        }
        for (const caseId of conv.caseIds) {
          const caseItems=disposition.filter(x=>x.caseId===caseId);
          if (caseItems.length && caseItems.every(x=>['na','withdrawn'].includes(x.action))) wf(get(s,'cases',caseId)).withdrawn={at:now,actorId:a.id,reason:caseItems.map(x=>x.reason).join('；').slice(0,1000)};
        }
        for (const plan of callbacks) {
          assert(conv.caseIds.includes(plan.caseId),'回访问题不属于当前会话'); const c=get(s,'cases',plan.caseId);
          let t=arrangements.get(c.id) || activeTicket(s,c) || s.tickets.find(t=>t.caseId===c.id);
          if (!t) t=followupTicket(s,a,c,now,Number(plan.at));
          saveCallback(s,a,t.id,plan,now); arrangements.set(c.id,t);
        }
        const snapshot={id:uid(s,'CL'),at:now,actorId:a.id,reason,summary,items:disposition,connection:customerConnection(s,conv.customerId),sop:conv.caseIds.map(id=>copy(sopView(s,conv.id,id,now).nodes).map(node=>node.key==='close'?{...node,status:'done',reason:'本次沟通已结束'}:node)),callbacks:[...arrangements.values()].filter(t=>t.callback).map(t=>({ticketId:t.id,ownerId:t.ownerId,...copy(t.callback)})),requestKey,requestFingerprint};
        conv.closures ||= []; conv.closures.push(snapshot); pauseAi(conv,'会话已结束',now); conv.state='closed'; conv.ownerId='';
        message(s,conv,'system','本次沟通已结束，已记录后续跟进安排。未完成的办理记录会继续保留。',now); value=snapshot.id; break;
      }
      case 'newConversation': {
        const c = makeConversation(s, a.id, now);
        if (data.caseId) { const issue = get(s, 'cases', data.caseId); owns(a, issue); c.caseIds.push(issue.id); issue.conversationIds.push(c.id); if (issue.status !== 'completed' || s.tickets.some(t => t.caseId === issue.id)) handoff(s, c, '继续跟进已有问题', now); }
        value = c.id; break;
      }
      case 'say': {
        const c = get(s, 'conversations', data.id); owns(a, c); assert(customerConnection(s,a.id)==='online','当前连接不可用，请恢复在线后发送'); const body = text(data.body, '问题');
        const social = !intentions(body,c.flow).human && socialReply(body);
        if (c.state !== 'bot' && social) {
          message(s,c,'customer',body,now);
          if (!c.aiOptOut) message(s,c,'bot',social,now);
          value=c.id; break;
        }
        if (c.state === 'closed') { c.state = c.ownerHistory.length || c.caseIds.some(id => activeTicket(s, get(s, 'cases', id))) ? 'queued' : 'bot'; if (c.state === 'queued') {c.waitingSince = now; c.firstHumanAt = null;} }
        message(s, c, 'customer', body, now);
        if (c.state === 'bot') run(s, c, body, now);
        else recognise(s, c, body, now);
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
        c.caseIds.map(id => get(s, 'cases', id)).filter(x => x.status !== 'completed').forEach(x => {x.humanTouched=true;if(x.service&&!x.ownerId){x.ownerId=a.id;x.serviceVersion++;s.tickets.filter(t=>t.caseId===x.id&&!t.ownerId).forEach(t=>{t.ownerId=a.id;t.status=t.status==='new'?'working':t.status;});}}); break;
      }
      case 'reply': case 'note': {
        const c = get(s, 'conversations', data.id),targetId=type==='reply'&&(data.caseId||data.suggestionCaseId||data.orderCaseId||(c.caseIds.length===1?c.caseIds[0]:'')),target=targetId&&get(s,'cases',targetId);
        if(target?.service)Commerce.access(s,a,target);else agentOwns(a, c); assert(c.state === 'human', '会话不在人工接待状态');
        let citation, orderId, caseId;
        if (type === 'reply' && data.suggestionToken) { const sg = suggestion(s,c.id,data.suggestionCaseId,now); assert(sg.status==='ready' && sg.token===data.suggestionToken,'推荐依据已变化，请重新核对后发送'); citation=copy(sg.knowledge); }
        if (type === 'reply' && (data.orderCaseId !== undefined || data.orderSnapshot !== undefined)) {
          const issue=get(s,'cases',data.orderCaseId), order=currentOrder(s,issue);
          assert(c.caseIds.includes(issue.id) && issue.customerId===c.customerId && order,'订单不属于当前接待问题');
          const snapshot={...copy(order),...(s.schema===5?{commerce:Commerce.snapshot(s,order.id)}:{})};
          assert(JSON.stringify(snapshot)===JSON.stringify(data.orderSnapshot),'订单事实已变化，请重新查询并核对后发送'); orderId=order.id;
        }
        if (type === 'reply') {
          caseId = data.caseId || data.suggestionCaseId || data.orderCaseId || (c.caseIds.length === 1 ? c.caseIds[0] : '');
          if (caseId) {
            const issue = get(s,'cases',caseId);
            assert(c.caseIds.includes(caseId) && issue.customerId === c.customerId,'问题不属于当前接待');
            assert((!data.suggestionCaseId || data.suggestionCaseId === caseId) && (!data.orderCaseId || data.orderCaseId === caseId),'回复依据与问题不一致');
            wf(issue).intentConfirmedAt ||= now;
          }
        }
        pauseAi(c,'人工已接手回复',now);
        message(s, c, 'agent', text(data.body, type === 'note' ? '内部备注' : '回复'), now, {author: a.name, visibility: type === 'note' ? 'internal' : 'public', ...(caseId?{caseId}:{}), ...(citation?{citation}:{}), ...(orderId?{orderId}:{})});
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
        pauseAi(conv,'人工已记录处理结果',now);
        message(s, conv, 'agent', conclusion, now, {author: a.name, caseId: c.id}); conv.firstHumanAt ||= now; break;
      }
      case 'closeConversation': {
        const c = get(s, 'conversations', data.id);
        if (a.role === 'customer') owns(a, c);
        else { agentOwns(a, c); assert(c.state === 'human', '请先接管会话'); assert(c.caseIds.every(id => get(s, 'cases', id).status === 'completed' || activeTicket(s, get(s, 'cases', id))), '仍有未完成且无人跟进的问题，请记录结论或建立工单'); }
        assert(c.state !== 'closed', '会话已经结束'); pauseAi(c,'会话已结束',now); c.state = 'closed'; c.ownerId = '';
        message(s, c, 'system', '本次沟通已结束。未完成的办理记录会继续保留，您可以在这里继续咨询。', now); break;
      }
      case 'feedback': {
        const c = get(s, 'cases', data.id); owns(a, c); assert(c.status === 'completed', '尚未形成可确认的处理结果');
        assert(!c.service||Commerce.resultReady(s,c),'业务结果尚未核实');
        if(c.service&&data.confirmed!==true){value=Commerce.command(s,a,'serviceDispute',{caseId:c.id,reason:data.reason},now);break;}
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
        if(data.caseId)assert(!s.cases.find(c=>c.id===data.caseId)?.service,'请从商品申请入口核对，不能通过旧工单登记办理');
        const title = text(data.title, '工单标题', 100), description = text(data.description, '问题描述');
        assert(data.confirmed === true, '请核对申请后再确认受理');
        assert(s.schema!==5||(!data.structured&&(!data.caseId||get(s,'cases',data.caseId).kind!=='aftersales')),'当前入口仅提供售后咨询，请联系人工客服核实商品级申请');
        const inputFingerprint=data.structured?intakeFingerprint(data,title,description):'';
        const priorReceipt=data.structured && data.requestKey && s.tickets.find(t=>t.intakeReceipts?.some(r=>r.requestKey===data.requestKey));
        if (priorReceipt) {
          const r=priorReceipt.intakeReceipts.find(r=>r.requestKey===data.requestKey);
          assert(r.fingerprint===inputFingerprint && r.actorId===a.id,'提交标识被用于不同内容，请重新核对');
          if (a.role==='customer') owns(a,priorReceipt); else { const conv=get(s,'conversations',data.conversationId); agentOwns(a,conv); assert(conv.state==='human' && conv.caseIds.includes(priorReceipt.caseId),'无法从这段会话受理此问题'); }
          value={id:priorReceipt.id,created:false}; break;
        }
        let c = data.caseId && get(s, 'cases', data.caseId);
        if (a.role === 'customer') { assert(c, '请选择要办理的问题'); owns(a, c); assert(c.kind === 'aftersales', '该问题请由客服协助受理'); if (!data.structured) assert(s.orders.some(o => o.id === c.orderId && o.customerId === a.id), '订单归属尚未核对'); }
        else if (c) { const conv = get(s, 'conversations', data.conversationId); agentOwns(a, conv); assert(conv.state === 'human' && conv.caseIds.includes(c.id), '无法从这段会话受理此问题'); }
        else { get(s, 'customers', data.customerId); c = {id: uid(s, 'SC'), customerId: data.customerId, conversationIds: [], kind: 'support', title, orderId: '', status: 'open', feedback: 'none', result: null, resultHistory: [], createdAt: now, completedAt: null, humanTouched: true}; s.cases.unshift(c); }
        let structured = null;
        if (data.structured === true) {
          assert(c.kind==='aftersales','结构化售后仅适用于退换货诉求');
          if (data.previewToken!==undefined) assert(data.previewToken===intakeToken(s,c.id,data.orderId || c.orderId,data.conversationId),'订单或接待信息已变化，请返回修改并重新核对申请');
          assert(['return','exchange'].includes(data.serviceType),'请选择退货或换货');
          const exchangeRequest=data.serviceType==='exchange'?text(data.exchangeRequest,'换货要求',200):String(data.exchangeRequest || '').trim(), extraNote=String(data.extraNote || '').trim();
          assert(exchangeRequest.length<=200 && extraNote.length<=1000,'换货要求或补充备注过长');
          let conv=data.conversationId?get(s,'conversations',data.conversationId):c.conversationIds.map(id=>get(s,'conversations',id)).find(v=>v.customerId===c.customerId);
          assert(conv && conv.customerId===c.customerId && conv.caseIds.includes(c.id),'问题不属于当前会话');
          c=bindCaseOrder(s,conv,c,data.orderId || c.orderId,now);
          structured={serviceType:data.serviceType,exchangeRequest,extraNote};
        }
        assert(c.status !== 'completed', '问题已完成；需要继续处理时请先反馈未解决');
        for (const id of c.conversationIds) { const v = get(s, 'conversations', id); if (v.pendingCaseId === c.id) v.pendingCaseId = ''; }
        const fp = JSON.stringify({caseId: c.id, title, description,...(structured || {})});
        const byKey = data.requestKey && s.tickets.find(t => t.requestKey === data.requestKey);
        if (byKey) { assert(byKey.requestFingerprint === fp, '提交标识被用于不同内容，请重新核对'); value = {id: byKey.id, created: false}; break; }
        const existing = activeTicket(s, c);
        if (existing?.followupOnly === true && c.kind === 'aftersales') {
          assert(structured, '请核对完整退换货申请后再确认受理');
          if (a.role === 'agent') agentOwns(a, existing);
          const duplicate=otherAftersalesTicket(s,c); assert(!duplicate, `同一订单已有办理中的售后，请从工单列表继续原工单 ${duplicate?.id}`);
          Object.assign(existing, {title,description,orderId:c.orderId,...structured,followupOnly:false,requestKey:data.requestKey || '',requestFingerprint:fp});
          receipt(existing,a,data,inputFingerprint,now); existing.history.push({at:now,publicText:'退换货申请已核对受理，继续在本工单跟进。',actor:a.name});
          c.humanTouched=true;
          for (const id of c.conversationIds) message(s,get(s,'conversations',id),'system',`已核对受理工单 ${existing.id}：${title}。后续继续在原记录办理。`,now,{ticketId:existing.id});
          value={id:existing.id,created:false,upgraded:true}; break;
        }
        if (existing) { receipt(existing,a,data,inputFingerprint,now); value = {id: existing.id, created: false}; break; }
        const duplicate=c.kind === 'aftersales' && otherAftersalesTicket(s,c);
        assert(!duplicate, `同一订单已有办理中的售后，请从工单列表继续原工单 ${duplicate?.id}`);
        const t = {id: uid(s, 'TK'), customerId: c.customerId, teamId: 'service', caseId: c.id, title, description, orderId: c.orderId, status: 'new', priority: 'normal', ownerId: '', createdAt: now, dueAt: now + s.settings.ticketHours * 3600000, requestKey: data.requestKey || '', requestFingerprint: fp, history: [{at: now, publicText: '申请已受理，等待客服核实。', actor: a.name}]};
        if (structured) { Object.assign(t,structured); receipt(t,a,data,inputFingerprint,now); }
        s.tickets.unshift(t); c.humanTouched = true; c.status = 'open';
        for (const id of c.conversationIds) message(s, get(s, 'conversations', id), 'system', `已受理工单 ${t.id}：${title}。请在“服务进度”查看后续处理。`, now, {ticketId: t.id});
        value = {id: t.id, created: true}; break;
      }
      case 'claimTicket': { const t=get(s,'tickets',data.id);assert(within(a,t)&&!t.ownerId&&t.status==='new','工单已被领取或不在可领取范围');t.ownerId=a.id;t.status='working';t.history.push({at:now,publicText:'客服已开始核实处理。',actor:a.name});const c=get(s,'cases',t.caseId);if(c.service){assert(!c.ownerId,'商品事项已由其他客服负责，请核对交接');c.ownerId=a.id;c.humanTouched=true;c.serviceVersion++;}break; }
      case 'updateTicket': {
        const t = get(s, 'tickets', data.id); agentOwns(a, t);
        assert(!get(s,'cases',t.caseId).service,'商品业务工单须通过对应办理命令与结果回执更新');
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
        const serviceCases=s.schema===5?(type==='assignTicket'?[get(s,'cases',r.caseId)]:r.caseIds.map(id=>get(s,'cases',id))).filter(c=>c.service):[];
        assert(!serviceCases.some(c=>c.ownerId),'已有商品责任须提出待接收交接，不能直接转派');
        const next = get(s, 'staff', data.ownerId); assert(next.role === 'agent' && within(next, r), '请选择该服务组的客服');
        if (type === 'assignTicket') { assert(r.status !== 'done' || r.callback?.status === 'pending', '已完成且无待回访的工单不再转派'); r.ownerId = next.id; if (r.status === 'new') r.status = 'working'; r.history.push({at: now, publicText: '已安排客服继续处理。', actor: a.name, internalText: `转派给${next.name}`}); }
        else { assert(['queued', 'human'].includes(r.state), '仅能分配待接待或接待中的会话'); assert(next.available && s.conversations.filter(v => v.state === 'human' && v.ownerId === next.id && v.id !== r.id).length < s.settings.capacity, '目标客服不可接待或已满载'); pauseAi(r,'会话已转派',now); r.ownerId = next.id; r.state = 'human'; if (!r.ownerHistory.includes(next.id)) r.ownerHistory.push(next.id); message(s, r, 'system', `${next.name}将继续为您服务，已有信息会保留。`, now); }
        serviceCases.forEach(c=>{c.ownerId=next.id;c.humanTouched=true;c.serviceVersion++;s.tickets.filter(t=>t.caseId===c.id&&!t.ownerId).forEach(t=>{t.ownerId=next.id;t.status=t.status==='new'?'working':t.status;});});break;
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
        if(s.schema===5){const scopes=Array.isArray(data.scopeItemIds)?data.scopeItemIds:split(data.scopeItemIds||'');assert(scopes.every(id=>s.commerce.items.some(i=>i.id===id)),'知识商品范围无效');draft.scopeItemIds=[...new Set(scopes)];draft.ruleSource=text(data.ruleSource||data.source,'规则来源',300);draft.reviewer=text(data.reviewer||'知识运营','审核责任',120);if(data.effectiveFrom)draft.effectiveAt=new Date(data.effectiveFrom).toISOString();if(data.effectiveTo)draft.expiresAt=new Date(data.effectiveTo).toISOString();}
        validateArticle(draft); let k = data.id && get(s, 'knowledge', data.id);
        if (!k) { k = {id: uid(s, 'KB'), live: null, versions: [], disabled: false}; s.knowledge.push(k); }
        k.draft = draft; k.validation = null; value = k.id; break;
      }
      case 'testKnowledge': { const k = get(s, 'knowledge', data.id); validateArticle(k.draft); k.validation = regression(candidate(s, k.id, 'knowledge'), now, k.id);if(s.schema===5){k.validation.service=serviceEvaluation(s,now,k.id);k.validation.passed&&=k.validation.service.pass;s.commerce.evaluations.push(copy(k.validation.service));}value = copy(k.validation); break; }
      case 'publishKnowledge': {
        const k = get(s, 'knowledge', data.id); const fresh = regression(candidate(s, k.id, 'knowledge'), now, k.id);
        assert(k.validation?.passed && k.validation.fingerprint === fresh.fingerprint && fresh.passed, '草稿或依赖已变化，或知识已失效；请重新测试且全部通过后发布');
        assert(s.schema!==5||(serviceEvalCurrent(s,k.id)&&serviceEvaluation(s,now,k.id).pass),'办理规则失效或事实依赖已变化，请重跑完整流程测试');
        if (k.live) k.versions.push(copy(k.live)); k.live = {...copy(k.draft), version: (k.live?.version || 0) + 1, publishedAt: now}; k.draft = null; k.disabled = false; k.validation = null; break;
      }
      case 'disableKnowledge': { const k = get(s, 'knowledge', data.id); assert(k.live && !k.disabled, '知识未在使用中'); k.disabled = true; k.disabledReason = text(data.reason, '停用原因', 300); break; }
      case 'saveFlow': { const f = {humanWords: split(data.humanWords), intakeEnabled: data.intakeEnabled === true}; validateFlow(f); s.flow.draft = f; s.flow.validation = null; break; }
      case 'testFlow': { validateFlow(s.flow.draft); s.flow.validation = regression(candidate(s, '', 'flow'), now);if(s.schema===5){s.flow.validation.service=serviceEvaluation(s,now,'',true);s.flow.validation.passed&&=s.flow.validation.service.pass;s.commerce.evaluations.push(copy(s.flow.validation.service));}value = copy(s.flow.validation); break; }
      case 'publishFlow': {
        const fresh = regression(candidate(s, '', 'flow'), now); assert(s.flow.validation?.passed && s.flow.validation.fingerprint === fresh.fingerprint && fresh.passed, '流程或知识已变化，请重新运行测试后发布');
        assert(s.schema!==5||(s.flow.validation.service?.pass&&s.flow.validation.service.fingerprint===serviceFingerprint(s)&&serviceEvaluation(s,now,'',true).pass),'业务依赖变化或规则失效，请重跑完整流程测试');
        s.flow.versions.push(copy(s.flow.live)); s.flow.live = {...copy(s.flow.draft), version: s.flow.live.version + 1}; s.flow.draft = null; s.flow.validation = null; break;
      }
      case 'reviewGap': {
        const g = get(s, 'gaps', data.id); managing(a, get(s, 'conversations', g.conversationId)); assert(g.status !== 'closed', '已验收记录不可改判');
        assert(['confirmed', 'dismissed'].includes(data.status), '复核结论无效'); g.review = text(data.review, '复核依据'); g.status = data.status;
        if(g.status==='confirmed'){g.cause=text(data.cause,'根因说明');if(s.schema===5){g.causeType=data.causeType||'knowledge';assert(['knowledge','routing','business','workflow','collaboration','notification'].includes(g.causeType),'根因类别无效');const conv=get(s,'conversations',g.conversationId),m=conv.messages.filter(m=>m.role==='customer'&&normalize(m.body)===normalize(g.query)).at(-1);g.sourceCaseIds=m?.caseIds?.length?copy(m.caseIds):[m?.caseId||conv.caseIds.at(-1)].filter(Boolean);g.sourceCaseId=g.sourceCaseIds[0]||'';}}break;
      }
      case 'linkGap': { const g = get(s, 'gaps', data.id); assert(['confirmed', 'fixing'].includes(g.status), '请先由经理确认问题');if(s.schema===5&&g.causeType&&g.causeType!=='knowledge'){g.remediation=text(data.remediation,'流程整改说明');const allowed={routing:['trigger-policy','trigger-request','two-items','changed-intent'],business:['query-failure','refund-unknown','refund-idempotent'],workflow:['happy-path','review-reject','supplement'],collaboration:['handoff-timeout'],notification:['notification-failure']};assert(allowed[g.causeType].includes(data.scenarioId),'请选择对应根因的复验场景');g.scenarioId=data.scenarioId;g.knowledgeId='';}else{get(s, 'knowledge', data.knowledgeId);g.knowledgeId=data.knowledgeId;} g.status = 'fixing'; g.validation = null; break; }
      case 'acceptGap': {
        const g = get(s, 'gaps', data.id); managing(a, get(s, 'conversations', g.conversationId)); assert(g.status === 'fixing', '尚未关联整改措施');
        if(s.schema===5&&g.causeType&&g.causeType!=='knowledge'){
          const all=serviceEvaluation(s,now),originals=(g.sourceCaseIds||[g.sourceCaseId]).filter(Boolean).map(id=>get(s,'cases',id));
          assert(all.pass&&all.rows.some(r=>r.id===g.scenarioId&&r.pass),'完整流程或关联失败场景尚未通过');
          assert(originals.length&&originals.every(c=>c.status==='completed'&&Commerce.resultReady(s,c)),'原始失败事项尚无完整解决证据，不能仅凭示例验收');
          if(g.causeType==='notification')assert(originals.every(c=>s.commerce.notifications.some(n=>n.caseId===c.id&&n.status==='sent'&&n.receipt?.kind==='notification_sent')),'原事项通知尚无有效送达回执');
          if(g.causeType==='collaboration')assert(originals.every(c=>{const h=s.commerce.handoffs.filter(h=>h.caseId===c.id).at(-1);return h?.status==='accepted'&&c.ownerId===h.targetId&&s.tickets.filter(t=>t.caseId===c.id).every(t=>t.ownerId===c.ownerId);}), '原交接尚无接收与责任落实证据');
          if(g.causeType==='business')assert(originals.every(c=>c.result?.evidence?.kind==='simulated-refund'||c.result?.evidence?.kind==='simulated-commerce'&&c.result.evidence.snapshot?.queryStatus==='ok'||c.service&&Commerce.resultReady(s,c)),'原业务失败尚无成功回执或实际核对依据');
          g.acceptance=text(data.acceptance,'验收说明');g.validation={...all,sourceCaseIds:originals.map(c=>c.id)};g.status='closed';break;
        }
        const k = get(s, 'knowledge', g.knowledgeId); assert(k.live && !k.draft && !k.disabled, '整改知识尚未发布，或还有待发布草稿');
        const rs = classify(s, g.query, get(s, 'conversations', g.conversationId).customerId, now);
        assert(rs.some(r => r.knowledge?.id === k.id), '原始问题未命中关联知识，不能验收');
        const all = regression(s, now); assert(all.passed, '全量回归未通过，不能验收');if(s.schema===5)assert(serviceEvaluation(s,now).pass,'完整业务流程未通过，不能验收');
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
      connection: customerConnection(s, customerId),
      ...(s.schema===5?{services:s.cases.filter(c=>c.customerId===customerId&&c.service).map(c=>Commerce.project(s,c))}:{}),
      orders: s.orders.filter(o => o.customerId === customerId).map(o=>({...copy(o),...(s.schema===5?{commerce:Commerce.snapshot(s,o.id)}:{})})),
      conversations: s.conversations.filter(c => c.customerId === customerId).map(c => ({id: c.id, customerId: c.customerId, state: c.state, caseIds: [...c.caseIds], createdAt: c.createdAt, updatedAt: c.updatedAt, messages: c.messages.filter(m => m.visibility === 'public').map(m => Object.fromEntries(Object.entries(copy(m)).filter(([key]) => ['id','role','body','at','visibility','author','caseId','ticketId','orderId','intake','citation','aiAssist'].includes(key))))})),
      cases: s.cases.filter(c => c.customerId === customerId).map(c => ({id: c.id, kind: c.kind, title: c.title, orderId: c.orderId, status: c.status, feedback: c.feedback, conversationIds: [...c.conversationIds], createdAt: c.createdAt, result: c.result ? {publicText: c.result.publicText, at: c.result.at} : null})),
      tickets: s.tickets.filter(t => t.customerId === customerId).map(t => ({id: t.id, caseId: t.caseId, title: t.title, description: t.description, serviceType:t.serviceType || '',exchangeRequest:t.exchangeRequest || '',extraNote:t.extraNote || '',orderId: t.orderId, status: t.status, createdAt: t.createdAt, history: t.history.map(h => ({at: h.at, publicText: h.publicText, actor: h.actor}))}))
    };
  }
  function deskView(s, identity) {
    const a = actor(s, identity); assert(a.role === 'agent', '无权打开客服工作台');
    const conversations = s.conversations.filter(c => within(a, c) && ((c.state === 'queued' && !c.ownerId) || c.ownerId === a.id || (c.state === 'closed' && c.ownerHistory.includes(a.id))));
    const tickets = s.tickets.filter(t => within(a, t) && (t.ownerId === a.id || (!t.ownerId && t.status === 'new')));
    const relatedTickets = s.tickets.filter(t => within(a,t) && !tickets.some(x=>x.id===t.id) && conversations.some(c=>c.caseIds.includes(t.caseId)));
    const visibleCustomers = new Set([...conversations, ...tickets].map(x => x.customerId));
    const handoffs=s.schema===5?(s.commerce.handoffs||[]).filter(h=>h.targetId===a.id&&h.status==='pending'):[];handoffs.forEach(h=>visibleCustomers.add(get(s,'cases',h.caseId).customerId));
    return copy({conversations,tickets,relatedTickets,handoffs,customers:s.customers.filter(c=>visibleCustomers.has(c.id)),orders:s.orders.filter(o=>visibleCustomers.has(o.customerId)),cases:s.cases.filter(c=>conversations.some(x=>x.caseIds.includes(c.id))||tickets.some(t=>t.caseId===c.id)||handoffs.some(h=>h.caseId===c.id))});
  }
  function serviceView(s,identity,{caseId}){
    const a=actor(s,identity),c=get(s,'cases',caseId);assert(s.schema===5,'请选择电商工作空间');
    if(c.service){Commerce.access(s,a,c,{read:true});return {...Commerce.project(s,c,{internal:a.role!=='customer'}),service:true};}
    const conv=s.conversations.find(v=>c.conversationIds.includes(v.id)&&v.ownerId===a.id);
    const teamId=c.teamId||s.conversations.find(v=>c.conversationIds.includes(v.id))?.teamId;
    if(a.role==='customer')owns(a,c);else assert(within(a,{teamId})&&(a.role==='manager'||a.role==='agent'&&(conv||s.tickets.some(t=>t.caseId===c.id&&t.ownerId===a.id))),'无权查看此事项');
    return {...Commerce.project(s,c),service:false,ownerName:conv?s.staff.find(x=>x.id===conv.ownerId)?.name:'服务责任组',history:[],result:c.result?{at:c.result.at,publicText:c.result.publicText,evidence:copy(c.result.evidence)}:null};
  }
  function metrics(s, now = Date.now()) {
    const completed = s.cases.filter(c => c.status === 'completed');
    const confirmed = completed.filter(c => c.feedback === 'confirmed');
    return {conversations:s.conversations.length,cases:s.cases.length,completed:completed.length,confirmed:confirmed.length,botConfirmed:confirmed.filter(c=>!c.humanTouched).length,waiting:s.conversations.filter(c=>c.state==='queued').length,activeTickets:s.tickets.filter(t=>t.status!=='done').length,overdue:s.tickets.filter(t=>t.status!=='done'&&t.dueAt<now).length,gaps:s.gaps.filter(g=>!['closed','dismissed'].includes(g.status)).length,...(s.schema===5?{service:Commerce.metrics(s)}:{})};
  }
  const api={copy,get,split,roles,actor,retrieve,intentions,classify,execute,customerView,deskView,serviceView,serviceEvalCurrent,metrics,regression,fingerprint,activeArticles,sopView,suggestion,closePreview,aiPending,customerConnection,validWorkflow,intakeToken};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SupportDomain = api;
})(typeof window !== 'undefined' ? window : globalThis);
