(function (root) {
  'use strict';
  const V = root.SupportViews;
  const {e, icon, b, pill, date, empty, heading, search} = V;
  const NODE_TITLES = [
    ['intent', '确认诉求'], ['order', '核对订单'], ['logistics', '查询物流'],
    ['aftersales', '退换货办理'], ['information', '补充资料'],
    ['result', '记录处理结果'], ['callback', '回访安排'], ['close', '结束沟通']
  ];
  const STEP_TITLES = ['确认类型与原因', '核对规则及缺失信息', '核对申请', '登记受理'];
  const STATUS_LABELS = {idle: '未触发', todo: '待处理', doing: '处理中', waiting: '待客户补充', done: '已完成', na: '不适用', error: '异常'};
  const RUN_LABELS = {answer: '检索知识并答复', order: '核对订单', intake: '采集售后申请', gap: '未命中知识', handoff: '转人工', askOrder: '等待订单号', orderDenied: '订单核对未通过'};
  const CALLBACK_LABELS = {pending: '待回访', contacted: '已联系', cancelled: '已取消'};

  function due(conv, s) {
    if (conv.firstHumanAt || !conv.waitingSince || !['queued', 'human'].includes(conv.state)) return '';
    const left = Math.ceil((conv.waitingSince + s.settings.responseMinutes * 60000 - Date.now()) / 60000);
    return `<span class="sla ${left < 0 ? 'late' : ''}">${icon('clock', 12)}${left < 0 ? '首响已超 ' + Math.abs(left) + ' 分钟' : '首响剩余 ' + left + ' 分钟'}</span>`;
  }

  function beijingDate(at) {
    if (!at) return '—';
    const formatted = new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(at));
    return `${e(formatted)} <span class="timezone">UTC+08:00</span>`;
  }

  function nodeStatus(status) {
    return `<span class="sop-status status-${e(status)}">${e(STATUS_LABELS[status] || STATUS_LABELS.idle)}</span>`;
  }

  function connection(s, conv) {
    return root.SupportDomain.customerConnection(s, conv.customerId);
  }

  function connectionLabel(status) {
    return {online: '客户在线', interrupted: '连接中断待确认', offline: '客户已离线'}[status] || '客户在线';
  }

  function caseAttributes(conv, item) {
    return `data-conversation="${e(conv.id)}" data-case="${e(item.id)}"`;
  }

  function orderCard(order) {
    if (!order) return '<p class="sop-hint">尚未确认关联订单。请先核对客户本人订单。</p>';
    return `<div class="sop-order-card"><strong>${e(order.product)}</strong><small>${e(order.id)}</small><div class="row between">${pill(order.status)}<span>订单金额 ¥${e(order.price)}</span></div><p>${e(order.delivery || '暂无物流信息')}</p><small class="muted">来自订单记录；订单金额不代表可退金额。</small></div>`;
  }

  function callbackCard(ticket, editable) {
    const callback = ticket?.callback;
    if (!ticket) return '<p class="sop-hint">需要回访时，先关联有负责人的跟进工单。结束沟通时也可一并安排。</p>';
    const detail = callback ? `<div class="sop-record"><div class="row between"><strong>${e(CALLBACK_LABELS[callback.status] || '回访记录')}</strong>${callback.status === 'pending' && callback.at <= Date.now() ? pill('已到期', 'warn') : ''}</div><p>${e(callback.purpose)}</p><p class="callback-time">${beijingDate(callback.at)}</p><small>站内联系 · 负责人继承工单</small>${callback.note ? `<p class="muted">内部备注：${e(callback.note)}</p>` : ''}</div>` : '<p class="sop-hint">当前工单未安排回访。</p>';
    return `${detail}<div class="sop-actions">${b('查看工单 ' + e(ticket.id), 'ticket-detail', ticket.id, 'small')}${editable ? b(callback?.status === 'pending' ? '调整回访' : '安排回访', 'callback-plan', ticket.id, 'small') : ''}${editable && callback?.status === 'pending' ? b('登记回访结果', 'callback-result', ticket.id, 'small') : ''}</div>`;
  }

  function intentDetail(conv, item, ui, owned) {
    const draft = ui.drafts?.['sop-intent:' + item.id] || {};
    const first = conv.messages.find(message => message.role === 'customer');
    const latest = [...conv.messages].reverse().find(message => message.role === 'customer');
    const steps = conv.runs?.at(-1)?.steps.map(key => RUN_LABELS[key] || key).join(' → ');
    return `<dl class="sop-facts"><dt>最初问题</dt><dd>${e(first?.body || '尚未提问')}</dd><dt>最近补充</dt><dd>${e(latest?.body || '无')}</dd><dt>交接摘要</dt><dd>${e(conv.handoffReason || '暂无转人工原因')}</dd><dt>已执行步骤</dt><dd>${e(steps || '暂无自动处理记录')}</dd></dl><small class="sop-hint">依据实际消息与执行记录整理，请结合当前问题核对。</small>${owned ? `<form class="sop-form" data-form="sop-intent" data-id="${e(item.id)}" ${caseAttributes(conv, item)}><label>诉求类型<select name="kind">${V.options([['knowledge', '规则与知识咨询'], ['order', '订单与物流'], ['aftersales', '退换货申请'], ['support', '其他服务问题']], draft.kind ?? item.kind)}</select></label><label>当前问题<input name="title" maxlength="200" required value="${e(draft.title ?? item.title)}"></label><button type="submit" class="btn small primary">确认诉求</button></form>` : `<p class="sop-hint">当前问题：${e(item.title)}</p>`}`;
  }

  function nodeDetail(s, conv, item, node, sop, ui, owned, ticket) {
    const attrs = caseAttributes(conv, item);
    const order = s.orders.find(order => order.id === sop.orderId && order.customerId === conv.customerId);
    const editableTicket = owned && ticket?.ownerId === ui.agentId;
    if (node.key === 'intent') return intentDetail(conv, item, ui, owned);
    if (node.key === 'order') {
      const draft = ui.drafts?.['sop-order:' + item.id] || {};
      const orders = s.orders.filter(order => order.customerId === conv.customerId);
      return `${orderCard(order)}${owned && (!ticket || ticket.followupOnly) && item.status !== 'completed' ? `<form class="sop-form" data-form="sop-order" data-id="${e(item.id)}" ${attrs}><label>客户本人订单<select name="orderId" required>${V.options([['', '选择并核对订单'], ...orders.map(order => [order.id, `${order.id} · ${order.product}`])], draft.orderId ?? sop.orderId ?? '')}</select></label><button type="submit" class="btn small primary">确认关联订单</button><small class="sop-hint">更换订单后，相关核验需重新确认。</small></form>` : `<p class="sop-hint">${ticket&&!ticket.followupOnly ? '申请已登记，沿用原工单关联订单。' : '当前订单信息只读。'}</p>`}`;
    }
    if (node.key === 'logistics') return `${orderCard(order)}<p class="sop-hint">${e(node.reason)}</p>${owned && order ? b('核对并查询物流', 'sop-query-order', item.id, 'small primary', attrs)+(item.workflow?.logistics?`<p class="sop-hint">查询时间：${beijingDate(item.workflow.logistics.at)}</p>`+b('将查询结果插入回复','sop-insert-order',item.id,'small',attrs):'') : '<p class="sop-hint">确认订单并接管会话后可查询。</p>'}`;
    if (node.key === 'aftersales') {
      const prefill = sop.prefill || {};
      const service = {return: '退货退款', exchange: '换货'}[prefill.serviceType] || '待确认';
      return `${orderCard(order)}<dl class="sop-facts"><dt>服务类型 · 待核对提取</dt><dd>${e(service)}</dd><dt>申请原因 · 来自客户原话</dt><dd>${e(prefill.description || '尚未提供，需补充确认')}</dd><dt>换货诉求 · 待核对提取</dt><dd>${e(prefill.exchangeRequest || '尚未提供')}</dd>${prefill.extraNote ? `<dt>补充说明</dt><dd>${e(prefill.extraNote)}</dd>` : ''}</dl><p class="sop-hint">核对规则与必要信息后，预填内容会带入申请。登记申请后仍需核实处理。</p>${ticket&&!ticket.followupOnly ? `<div class="sop-actions">${b('继续原工单 ' + e(ticket.id), 'ticket-detail', ticket.id, 'small')}${pill(ticket.status, ticket.status === 'done' ? 'good' : '')}</div>` : owned && item.status !== 'completed' ? b('核对退换货申请', 'sop-intake', item.id, 'small primary', attrs) : ''}`;
    }
    if (node.key === 'information') return `<p>${e(node.reason || '当前未发现需要补充的资料。')}</p><p class="sop-hint">结合客户原话与申请字段确认缺失内容；发送追问不会自动完成资料核对。</p>${ticket ? b('查看工单与客户补充', 'ticket-detail', ticket.id, 'small') : ''}`;
    if (node.key === 'result') {
      const result = item.result;
      const evidence = result?.evidence;
      return `${result ? `<div class="sop-record"><strong>客户可见结果</strong><p>${e(result.publicText)}</p><small>${date(result.at, true)}</small>${evidence?.text ? `<div class="internal-evidence"><strong>内部核对依据</strong><p>${e(evidence.text)}</p></div>` : ''}</div>` : '<p class="sop-hint">尚未记录办理结果。普通回复和 AI 续答不会自动办结问题。</p>'}<div class="row sop-feedback">${pill(item.status, item.status === 'completed' ? 'good' : '')}${item.feedback === 'confirmed' ? pill('客户已确认', 'good') : item.feedback === 'pending' ? pill('待客户确认', 'warn') : ''}</div>${ticket ? b('在原工单记录结果', 'ticket-detail', ticket.id, 'small') : owned && item.status !== 'completed' ? `<div class="sop-actions">${b('记录结果', 'complete-case', item.id, 'small primary', attrs)}${b('建跟进工单', 'staff-intake', item.id, 'small', attrs)}</div>` : ''}`;
    }
    if (node.key === 'callback') return callbackCard(ticket, editableTicket);
    if (node.key === 'close') return `<p>${e(conv.state === 'closed' ? '本次沟通已结束，办理进度和关闭快照保留。' : '核对接待小结，为已触发的未完成事项安排后续负责人和目标时间。')}</p><div class="sop-actions">${owned ? b('整理小结并结束', 'close-conversation', conv.id, 'small primary') : ''}${b('查看关闭记录', 'close-history', conv.id, 'small')}</div>`;
    return '';
  }

  function suggestionCard(conv, item, sop, ui, owned) {
    const suggestion = sop.suggestion;
    const dismissed = suggestion?.token && ui.dismissedSuggestionTokens?.[conv.id + ':' + item.id] === suggestion.token;
    const attrs = caseAttributes(conv, item);
    const ready = suggestion?.status === 'ready' && !dismissed;
    const knowledge = suggestion?.knowledge;
    return `<section class="sop-suggestion"><div class="row between"><h3>${icon('book', 15)} 动态建议</h3>${pill(dismissed ? '暂不采用' : ready ? '请核对后使用' : suggestion?.status === 'conflict' ? '依据冲突' : '暂无可靠建议', ready ? '' : 'warn')}</div><small>针对：${e(item.title)}</small>${ready ? `<p class="suggestion-body">${e(suggestion.body)}</p>${knowledge ? `<div class="suggestion-source"><strong>${e(knowledge.title)} · v${e(knowledge.version)}</strong><small>${e(knowledge.source)}</small></div>` : ''}<p class="sop-hint">仅适用于当前问题和已核对订单；办理资格与金额仍需核实。</p><div class="sop-actions">${owned ? b('插入公开回复', 'dynamic-suggestion', item.id, 'small primary', attrs) : ''}${b('查看依据', 'suggestion-source', item.id, 'small', attrs)}${owned ? b('暂不采用', 'dismiss-suggestion', item.id, 'text', attrs) : ''}</div>` : `<p class="sop-hint">${e(dismissed ? '本条建议已暂不采用，后续新消息会重新核对依据。' : suggestion?.reason || '请先核实具体诉求和相关订单信息，再回复客户。')}</p>${!dismissed && suggestion?.status === 'none' ? '<div class="result-note"><strong>可先追问</strong><p>请您补充遇到的具体情况、发生时间，以及相关订单号；如有报错，可提供不含敏感信息的截图。</p><small>收集资料后继续核实，不据此承诺办理结果。</small></div>' : ''}`}${owned ? b('标记服务问题', 'flag', conv.id, 'text') : ''}</section>`;
  }

  V.sopBoard = function (s, conv, ui, owned) {
    const cases = s.cases.filter(item => conv.caseIds.includes(item.id) && item.customerId === conv.customerId);
    const item = cases.find(item => item.id === ui.sopCaseByConversation?.[conv.id]) || cases.find(item => item.status !== 'completed') || cases[0];
    const sop = item ? root.SupportDomain.sopView(s, conv.id, item.id) : {nodes: [], orderId: ''};
    const nodes = NODE_TITLES.map(([key, title]) => sop.nodes.find(node => node.key === key) || {key, title, status: key === 'close' && conv.state === 'closed' ? 'done' : 'idle', reason: item ? '当前未触发' : '尚未建立客户问题'});
    const pending = nodes.filter(node => ['todo', 'doing', 'waiting', 'error'].includes(node.status)).length;
    const hasOpen = item && Object.prototype.hasOwnProperty.call(ui.sopNodeByCase || {}, item.id);
    const openKey = hasOpen ? ui.sopNodeByCase[item.id] : nodes.find(node => ['todo', 'doing', 'waiting', 'error'].includes(node.status))?.key || 'intent';
    const ticket = item && s.tickets.find(ticket => ticket.caseId === item.id && ticket.customerId === conv.customerId);
    const customer = s.customers.find(customer => customer.id === conv.customerId);
    const mode = conv.state === 'human' ? '人工接待' : conv.state === 'queued' ? '等待人工' : conv.state === 'closed' ? '已结束 · 只读' : '自动接待';
    return `<aside class="sop-workbench" aria-label="SOP 看板"><header class="sop-workbench-header"><div class="row between"><h2>SOP 看板</h2><span class="sop-pending">${pending} 个待处理</span></div><div class="row">${pill(mode)}${pill(connectionLabel(connection(s, conv)), connection(s, conv) === 'online' ? 'good' : 'warn')}</div><div class="sop-case-tabs" aria-label="切换客户问题">${cases.map(current => `<button type="button" data-action="select-sop-case" data-id="${e(current.id)}" data-conversation="${e(conv.id)}" class="sop-case-tab ${current.id === item?.id ? 'active' : ''}" aria-pressed="${current.id === item?.id}"><span>${e(current.title)}</span><small>${e(current.id)} · ${current.status === 'completed' ? '结果已记录' : '待跟进'}</small></button>`).join('') || '<p class="sop-hint">客户提出问题后，在这里跟进对应流程。</p>'}</div><small class="sop-order-ref">关联订单：${e(sop.orderId || '尚未确认')}</small></header><div class="sop-workbench-scroll" data-scroll="sop"><ol class="sop-nodes">${nodes.map((node, index) => {
      const expanded = !!item && openKey === node.key;
      const followup = node.ticketId && s.tickets.find(ticket => ticket.id === node.ticketId && ticket.customerId === conv.customerId && ticket.caseId === item?.id);
      const steps = node.key === 'aftersales' ? STEP_TITLES.map((title, index) => node.steps?.[index] || {title, status: 'idle'}) : [];
      const canCorrect = owned && item && !['intent', 'result', 'close'].includes(node.key) && ['todo', 'doing', 'waiting', 'error'].includes(node.status);
      return `<li class="sop-node node-${e(node.key)} status-${e(node.status)} ${expanded ? 'expanded' : ''}" data-sop-node="${e(node.key)}"><button type="button" class="sop-node-toggle" data-action="toggle-sop-node" data-id="${e(node.key)}" data-case="${e(item?.id || '')}" aria-expanded="${expanded}" aria-controls="sop-detail-${e(conv.id)}-${e(node.key)}" ${item ? '' : 'disabled'}><span class="sop-number">${index + 1}</span><span class="sop-node-title">${e(node.title)}</span>${nodeStatus(node.status)}<span class="sop-chevron" aria-hidden="true">${expanded ? '−' : '+'}</span></button><p class="sop-node-reason">${e(node.reason || '当前未触发')}</p>${followup ? `<div class="sop-followup">已安排跟进 ${b(e(followup.id), 'ticket-detail', followup.id, 'text')}</div>` : ''}${steps.length ? `<ol class="sop-substeps">${steps.map(step => `<li><span>${e(step.title)}</span>${nodeStatus(step.status)}</li>`).join('')}</ol>` : ''}${expanded ? `<div class="sop-node-detail" id="sop-detail-${e(conv.id)}-${e(node.key)}">${nodeDetail(s, conv, item, node, sop, ui, owned, ticket)}${canCorrect ? `<div class="sop-corrections">${node.status !== 'waiting' ? b('等待客户补充', 'sop-wait', node.key, 'text', caseAttributes(conv, item)) : ''}${b('标记不适用', 'sop-na', node.key, 'text', caseAttributes(conv, item))}</div>` : ''}</div>` : ''}</li>`;
    }).join('')}</ol>${item ? suggestionCard(conv, item, sop, ui, owned) : ''}<section class="sop-customer-profile"><h3>客户资料</h3><div class="row"><span class="avatar">${e(customer?.name.slice(-2))}</span><div><strong>${e(customer?.name)}</strong><small>${e(customer?.level)} · ${e(customer?.id)}</small></div></div><p>${e(customer?.email)}</p><div class="sop-actions">${b('查看关闭记录', 'close-history', conv.id, 'small')}</div></section></div></aside>`;
  };

  function aiControl(s, conv, owned) {
    if (!owned) return '';
    const pending = root.SupportDomain.aiPending(s, conv.id);
    const enabled = !!conv.aiAssist?.enabled;
    const status = connection(s, conv);
    const detail = status !== 'online' ? '客户连接未恢复，AI 续答已暂停。' : enabled ? pending ? `等待 30 秒后可续答 · 剩余 ${pending.remaining} 轮` : `等待新的客户消息 · 剩余 ${conv.aiAssist.remaining} 轮` : '人工接待 · 输入或发送后暂停 AI 续答';
    return `<div class="ai-assist-control"><div><strong>${enabled ? '忙时 AI 续答已开启' : '忙时 AI 续答'}</strong><small>${e(detail)}</small></div><button type="button" class="btn small ${enabled ? 'ai-enabled' : ''}" data-action="ai-toggle" data-id="${e(conv.id)}" aria-pressed="${enabled}" ${!enabled && status !== 'online' ? 'disabled' : ''}>${enabled ? '暂停续答' : '开启续答'}</button></div>`;
  }

  function composer(s, conv, ui) {
    const note = ui.composeMode === 'note';
    const form = note ? 'note' : 'reply';
    return `<form class="composer ${note ? 'note-composer' : ''}" data-form="${form}" data-id="${e(conv.id)}"><div class="compose-tabs"><button type="button" data-action="compose-mode" data-id="reply" class="${note ? '' : 'active'}">公开回复</button><button type="button" data-action="compose-mode" data-id="note" class="${note ? 'active' : ''}">内部备注</button></div><label class="sr-only" for="agent-input">${note ? '内部备注' : '回复客户'}</label><textarea id="agent-input" data-focus="agent-input" name="body" rows="3" maxlength="2000" required placeholder="${note ? '仅同事可见，不会发送给客户' : '输入要发送给客户的内容…'}">${e(ui.drafts?.[form + ':' + conv.id]?.body || '')}</textarea><div class="row between"><span class="muted small-text">${note ? '内部备注与公开回复分别保存草稿。' : '发送回复不会自动完成客户问题。'}</span><button type="submit" class="btn primary">${note ? '保存备注' : '发送回复'} ${icon('send', 14)}</button></div></form>${aiControl(s, conv, true)}`;
  }

  V.inbox = function (s, data, ui, actor) {
    const group = ui.deskFilter || 'queue';
    const query = (ui.search.inbox || '').toLowerCase();
    const names = {queue: '待接待', mine: '我接待中', history: '我的历史'};
    const filtered = data.conversations.filter(conv => group === 'queue' ? conv.state === 'queued' : group === 'mine' ? conv.state === 'human' && conv.ownerId === actor.id : conv.state === 'closed').filter(conv => (conv.id + ' ' + (data.customers.find(customer => customer.id === conv.customerId)?.name || '') + ' ' + conv.messages.map(message => message.body).join(' ')).toLowerCase().includes(query));
    const selected = filtered.find(conv => conv.id === ui.deskConversation) || filtered[0];
    ui.visibleConversation = selected?.id || '';
    const customer = selected && data.customers.find(customer => customer.id === selected.customerId);
    const owned = selected?.state === 'human' && selected.ownerId === actor.id;
    const status = selected && connection(s, selected);
    const list = filtered.map(conv => {
      const person = data.customers.find(customer => customer.id === conv.customerId);
      const latest = [...conv.messages].reverse().find(message => message.role === 'customer');
      return `<button type="button" class="conversation-row ${conv.id === selected?.id ? 'selected' : ''}" data-action="select-conversation" data-id="${e(conv.id)}"><div class="row"><span class="avatar">${e(person?.name.slice(-2))}</span><strong>${e(person?.name)}</strong><time>${date(conv.updatedAt)}</time></div><p>${e(latest?.body || '尚未提问')}</p><div class="row between">${pill(conv.state, conv.state === 'queued' ? 'warn' : '')}${due(conv, s)}</div></button>`;
    }).join('');
    const offline = selected && selected.state !== 'closed' && status !== 'online' ? `<div class="connection-banner ${status === 'offline' ? 'offline' : ''}" role="status">${icon('clock', 15)}<div><strong>${status === 'offline' ? '客户已离线，请整理本次沟通' : '客户连接中断，在线状态待确认'}</strong><small>${status === 'offline' ? 'AI 续答已暂停。未完成事项安排妥当后，再保存记录并关闭。' : '暂不自动续答；连接恢复前保留当前办理进度。'}</small></div></div>` : '';
    return `${heading('会话接待', '接待客户咨询、查看上下文并跟进处理。', `<span class="muted">${actor.available ? '接待中' : '暂离'}</span>${b(actor.available ? '设为暂离' : '恢复接待', 'presence', actor.id, 'small')}`)}<div class="workbench-viewport"><div class="inbox-shell workbench-shell"><aside class="conversation-list"><div class="list-tools"><div class="segmented">${Object.entries(names).map(([key, label]) => `<button type="button" class="${key === group ? 'active' : ''}" data-action="inbox-filter" data-id="${key}">${label}</button>`).join('')}</div>${search('inbox', query, '搜索客户或对话内容')}</div><div class="list-caption">${e(names[group])}<span>${filtered.length}</span></div><div class="conversation-rows" data-scroll="conversations">${list || empty(query ? '没有匹配的会话' : '当前没有会话', query ? '换一个关键词试试。' : '客户发起人工请求后，会出现在待接待队列。')}</div></aside><section class="agent-conversation">${selected ? `<header class="conversation-header"><div><h2>${e(customer?.name)}</h2><small>${e(selected.id)} · ${e(connectionLabel(status))}</small></div><div class="row">${selected.state === 'queued' ? b('接管会话', 'claim-conversation', selected.id, 'primary') : owned ? b('结束沟通', 'close-conversation', selected.id, 'small') : pill('只读记录')}</div></header>${offline}<div class="messages" id="agent-messages">${selected.handoffReason ? `<div class="handoff-banner">${icon('bolt')}<div><strong>转人工原因</strong><p>${e(selected.handoffReason)}</p></div></div>` : ''}${V.messages(selected)}</div>${owned ? composer(s, selected, ui) : `<div class="read-only-bar">${selected.state === 'queued' ? '接管后即可回复，人工接待请求持续保留。' : '这段沟通已结束，历史记录只读保留。'}</div>`}` : empty('选择一段会话', '选择会话后查看消息和处理信息。')}</section>${selected ? V.sopBoard(s, selected, ui, owned) : `<aside class="sop-workbench sop-empty">${empty('SOP 看板', '选择会话后查看完整流程与客户资料。')}</aside>`}</div></div>`;
  };

  V.tickets = function (s, rows, ui, manager = false) {
    const filter = ui.ticketFilter || 'all';
    const query = (ui.search.tickets || '').toLowerCase();
    const now = Date.now();
    const list = rows.filter(ticket => {
      if (filter === 'callback_pending') return ticket.callback?.status === 'pending';
      if (filter === 'callback_due') return ticket.callback?.status === 'pending' && ticket.callback.at <= now;
      return filter === 'all' || filter === 'pool' && !ticket.ownerId || ticket.status === filter;
    }).filter(ticket => (ticket.id + ' ' + ticket.title + ' ' + ticket.description).toLowerCase().includes(query));
    return `${heading(manager ? '团队协同' : '工单处理', manager ? '查看团队待办、分配任务并跟进处理进度。' : '查看和处理工单，跟进客户补充、办理结果与回访。', manager ? '' : b(`${icon('plus')} 新建工单`, 'standalone-ticket', '', 'primary'))}<div class="panel"><div class="table-toolbar">${search('tickets', query, '搜索工单编号或问题')}<select aria-label="工单状态" data-select="ticket-filter">${V.options([['all', '全部状态'], ['pool', '待领取'], ['working', '处理中'], ['waiting_customer', '待客户补充'], ['done', '结果已记录'], ['callback_pending', '待回访'], ['callback_due', '已到期回访']], filter)}</select></div>${list.length ? `<div class="table-scroll"><table class="callback-ticket-table"><thead><tr><th>工单 / 客户问题</th><th>状态</th><th>负责人</th><th>受理时间</th><th>处理目标</th><th>回访时间</th><th>操作</th></tr></thead><tbody>${list.map(ticket => {
      const callback = ticket.callback;
      const editable = !manager && ticket.ownerId === ui.agentId;
      const overdue = callback?.status === 'pending' && callback.at <= now;
      const action = manager && (ticket.status !== 'done' || callback?.status === 'pending') ? b('转派', 'assign-ticket', ticket.id, 'small') : !manager && !ticket.ownerId ? b('领取', 'claim-ticket', ticket.id, 'small') : b('查看处理', 'ticket-detail', ticket.id, 'small');
      return `<tr><td><button type="button" class="table-title" data-action="ticket-detail" data-id="${e(ticket.id)}">${e(ticket.title)}</button><small>${e(ticket.id)} · ${e(s.customers.find(customer => customer.id === ticket.customerId)?.name || '未关联')}</small></td><td>${pill(ticket.status, ticket.status === 'waiting_customer' ? 'warn' : ticket.status === 'done' ? 'good' : '')}</td><td>${e(s.staff.find(actor => actor.id === ticket.ownerId)?.name || '待领取')}</td><td>${date(ticket.createdAt, true)}</td><td>${ticket.status === 'done' ? '—' : `<span class="${ticket.dueAt < now ? 'danger-text' : ''}">${date(ticket.dueAt, true)}${ticket.dueAt < now ? ' · 已超时' : ''}</span>`}</td><td class="callback-cell">${callback ? `<span class="${overdue ? 'danger-text' : ''}">${beijingDate(callback.at)}</span><small>${e(CALLBACK_LABELS[callback.status] || callback.status)}${overdue ? ' · 已到期' : ''}</small>` : '<span class="muted">未安排</span>'}</td><td><div class="ticket-row-actions">${action}${editable ? b(callback?.status === 'pending' ? '调整回访' : '安排回访', 'callback-plan', ticket.id, 'small') : ''}${editable && callback?.status === 'pending' ? b('登记回访结果', 'callback-result', ticket.id, 'small') : ''}</div></td></tr>`;
    }).join('')}</tbody></table></div>` : empty(query ? '没有匹配的工单' : '当前没有符合条件的工单', '请调整搜索词或筛选条件。')}</div>`;
  };
})(window);
