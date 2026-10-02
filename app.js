/* 知序 V3：保留原十页布局，新增事项与受理、知识治理、发布回归和整改联动。 */
'use strict';
const Core = window.CustomerDemo;
const answerRule = `至少命中 ${Core.minKeywordHits} 个关键词，或问题包含标准问题`;
// V3.1 调整了知识作答门槛与回归口径，旧 V3 数据（如旧关键词）不再沿用，原键保留不覆盖。
const STORAGE_KEY = 'zhixu-customer-demo-v3.1';
const CUSTOMER_VIEW = /(?:^|[?&])view=customer(?:&|$)/.test(location.search || '');
let storageAvailable = true;
let persistenceBlocked = false;
let persistenceMessage = '';
let originalStoredValue = null;
let state;
try {
  const raw = originalStoredValue = localStorage.getItem(STORAGE_KEY);
  const saved = raw ? JSON.parse(raw) : null;
  const valid = saved && saved.schema === 3 && Array.isArray(saved.items) && Array.isArray(saved.releases) && Array.isArray(saved.evaluations) && saved.runtime && Array.isArray(saved.sessions) && Array.isArray(saved.knowledge) && Array.isArray(saved.tickets) && Array.isArray(saved.issues) && saved.robot && saved.draft && saved.published;
  if (raw && !valid) throw new Error('数据格式不兼容');
  state = valid ? saved : Core.newState();
} catch {
  state = Core.newState();
  storageAvailable = false;
  persistenceBlocked = true;
  persistenceMessage = '已有数据暂时无法读取，当前是临时工作空间，不会覆盖原记录。请在系统设置导出原始保存副本。';
}
if (window.CustomerPresentation && !persistenceBlocked) {
  const upgrade = window.CustomerPresentation.upgrade(state);
  try {
    if (upgrade.changed) {
      const backupKey = STORAGE_KEY + ':before-product-copy-v1';
      if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, JSON.stringify(state));
    }
    state = upgrade.state;
  } catch {
    // Do not overwrite the old workspace when the pre-upgrade backup fails.
    storageAvailable = false;
    persistenceBlocked = true;
    persistenceMessage = '更新前的数据备份未能保存，当前操作仅临时保留，不会覆盖原记录。请在系统设置导出原始保存副本。';
  }
}
Core.ensureGraphState(state);
state.workspace ||= { forms: {} };
state.workspace.forms ||= {};
const ui = { page: 'overview', session: state.workspace.session || state.sessions[0]?.id, play: state.workspace.play || state.sessions.find(s => s.name === '林小夏')?.id, node: state.workspace.node || 'router', qualityTab: 'issues', flowTest: null, returnTo: null, modalContext: null, filters: { knowledge: '', knowledgeStatus: '', tickets: '', ticketStatus: '', sessions: '', sessionStatus: '', qualityStatus: '' } };
const navItems = [
  ['工作空间', 'overview', '工作台', 'grid'], ['', 'playground', '渠道预览', 'play'],
  ['机器人与知识', 'robot', '机器人配置', 'bot'], ['', 'workflow', '流程编排', 'flow'], ['', 'knowledge', '知识库', 'book'],
  ['服务运营', 'sessions', '会话中心', 'chat'], ['', 'tickets', '工单中心', 'ticket'], ['', 'quality', '质检与日志', 'shield'],
  ['系统管理', 'integrations', '接入与集成', 'plug'], ['', 'architecture', '系统设置', 'layers']
];
const sessionNames = { bot: '机器人接待', waiting: '等待接管', human: '人工服务', offline: '人工离线', ended: '已结束' };
const sessionColors = { bot: 'blue', waiting: 'orange', human: 'green', offline: 'orange', ended: '' };
const knowledgeNames = { draft: '草稿', published: '已发布', disabled: '已停用' };
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const e = escapeHTML;
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const badge = (text, color = '') => `<span class="badge ${color}">${e(text)}</span>`;
const dateTime = time => new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const clockTime = time => new Date(time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
const empty = text => `<div class="empty">${e(text)}</div>`;
const button = (text, action, args = '', style = '') => `<button type="button" class="btn ${style}" data-action="${action}" ${args}>${text}</button>`;
const heading = (title, subtitle, actions = '') => `<div class="page-heading"><div><h1>${e(title)}</h1><p>${e(subtitle)}</p></div><div class="row">${actions}</div></div>`;
const selectOptions = (values, selected) => values.map(v => { const [id, text] = Array.isArray(v) ? v : [v, v]; return `<option value="${e(id)}" ${id === selected ? 'selected' : ''}>${e(text)}</option>`; }).join('');
const search = (filter, placeholder) => `<div class="search-field">${icon('search')}<input data-filter="${filter}" aria-label="${e(placeholder)}" placeholder="${e(placeholder)}" value="${e(ui.filters[filter])}"></div>`;
function save() {
  if (persistenceBlocked) {
    storageAvailable = false;
    $('#storage-warning').textContent = persistenceMessage;
    $('#storage-warning').hidden = false;
    return;
  }
  Object.assign(state.workspace, { session: ui.session, play: ui.play, node: ui.node });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageAvailable = true; }
  catch { storageAvailable = false; }
  $('#storage-warning').hidden = storageAvailable;
}
let toastTimer;
function toast(text) { $('#toast').textContent = text + (storageAvailable ? '' : '（仅当前页面有效，未持久保存）'); $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3300); }
function modal(title, body) {
  $('#modal-content').innerHTML = `<div class="modal-head"><h2 id="modal-title">${e(title)}</h2><button class="icon-btn" type="button" data-action="close-modal" aria-label="关闭弹窗">${icon('close')}</button></div><div class="modal-body">${body}</div>`;
  if (!$('#modal').open) $('#modal').showModal();
  restoreForms($('#modal'));
  $('#modal').querySelector('input:not([type="hidden"]),textarea,select')?.focus();
}
function closeModal() { $('#modal').close(); ui.modalContext = null; }
function dismissConfirmation() { $('#confirm-dialog').close(); ui.confirm=null; }
function go(page) {
  dismissConfirmation();
  if (location.hash.slice(1) !== page) history.pushState(null, '', '#' + page);
  render(); $('#page').focus({preventScroll:true}); window.scrollTo(0,0);
}
const formKey = form => `${form.dataset.form}:${form.dataset.id || form.dataset.session || 'new'}${form.dataset.form==='new-ticket'?':'+(form.dataset.visitor==='true'?'visitor':'staff'):''}`;
const formValues = form => Object.fromEntries(new FormData(form));
function showDraftStatus(form) {
  if (['flow-test','knowledge-test'].includes(form.dataset.form)) return;
  const dirty = Boolean(state.workspace.forms[formKey(form)]);
  let notice = form.querySelector('.draft-notice');
  if (!notice) {
    notice = document.createElement('div'); notice.className = 'draft-notice';
    notice.innerHTML = '<span>输入已暂存，尚未提交</span><button type="button" class="text-link" data-action="discard-input">放弃输入</button>';
    form.prepend(notice);
  }
  notice.hidden = !dirty;
  const chat = form.querySelector('[data-chat-input]');
  if (chat) form.querySelector('[type="submit"]').disabled = chat.disabled || !chat.value.trim();
}
function restoreForms(root) {
  root.querySelectorAll('form[data-form]').forEach(form => {
    if (form.dataset.form === 'node') return;
    form.dataset.baseline = JSON.stringify(formValues(form));
    const draft = state.workspace.forms[formKey(form)];
    if (draft) Object.entries(draft).forEach(([name,value]) => { const field = form.elements.namedItem(name); if (field) field.value = value; });
    showDraftStatus(form);
  });
}
function rememberForm(form) {
  if (!form || form.dataset.form === 'node') return;
  const values = formValues(form);
  if (JSON.stringify(values) === form.dataset.baseline) delete state.workspace.forms[formKey(form)];
  else state.workspace.forms[formKey(form)] = values;
  showDraftStatus(form); save();
}
function clearFormDraft(form) { delete state.workspace.forms[formKey(form)]; }
function askConfirm(title, message, label, run) {
  ui.confirm = run;
  $('#confirm-content').innerHTML = `<div class="modal-head"><h2>${e(title)}</h2></div><div class="modal-body"><p>${e(message)}</p><div class="form-footer">${button('取消','cancel-confirm')}${button(e(label),'accept-confirm','','primary')}</div></div>`;
  $('#confirm-dialog').showModal();
}
function invalidateTest() { ui.flowTest = null; }
function saveNodeInput(form) {
  const data = formValues(form);
  let modeChanged = false;
  if (form.dataset.nodeId) {
    const node = state.draft.graph.nodes.find(n => n.id === form.dataset.nodeId);
    if (!node) return;
    modeChanged = data.mode !== undefined && data.mode !== node.config.mode;
    node.label = data.label; delete data.label;
    Object.assign(node.config, data);
    for (const [key, value] of Object.entries(node.config)) if (value === 'inherit') delete node.config[key];
    if ('enabled' in node.config) node.config.enabled = node.config.enabled === true || node.config.enabled === 'true';
  } else {
    if ('intakeEnabled' in data) data.intakeEnabled = data.intakeEnabled === 'true';
    Object.assign(state.draft, data);
  }
  invalidateTest(); save();
  if (modeChanged) { render(); return; }
  const status = $('#flow-draft-status');
  if (status) status.textContent = Core.flowChanged(state) ? '草稿已自动保存 · 待发布' : '与发布版本一致';
  const publish = $('[data-action="publish-flow"]');
  if (publish) publish.disabled = !Core.flowChanged(state);
  const result = $('#flow-test-result');
  if (result) result.innerHTML = empty('参数已更新，请重新运行测试。');
  document.querySelectorAll('.graph-node.executed,.graph-edge.executed').forEach(el => el.classList.remove('executed','trace-active'));
  $('.graph-debug')?.remove?.();
  if (form.dataset.nodeId) {
    const title = document.querySelector(`[data-graph-node="${form.dataset.nodeId}"] .graph-node-head strong`);
    const node = state.draft.graph.nodes.find(n => n.id === form.dataset.nodeId);
    if (title) title.textContent = node.label;
    document.querySelector(`[data-graph-node="${node.id}"]`)?.setAttribute?.('aria-label', `节点：${node.label}（${Core.Graph.types[node.type].name}）`);
  }
  const validation = $('#graph-validation');
  if (validation) validation.innerHTML = window.CustomerFlowEditor.diagnostics(state.draft.graph, state.workspace.graphView?.showErrors);
  document.querySelectorAll('.evaluation .badge').forEach(el => { el.textContent = '历史结论已失效，请重验'; el.className = 'badge orange'; });
}
function graphChanged(options = {}) {
  if (!options.layoutOnly) invalidateTest();
  save(); render();
}
function renderNav() {
  const m = Core.metrics(state), counts = { sessions: m.waiting, tickets: m.tickets, quality: m.issues };
  $('#navigation').innerHTML = navItems.map(([group, key, title, glyph]) => `${group ? `<div class="nav-group">${group}</div>` : ''}<button type="button" class="nav-link ${ui.page === key ? 'active' : ''}" data-nav="${key}" title="${title}" ${ui.page === key ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${title}</span>${counts[key] ? `<span class="nav-count">${counts[key]}</span>` : ''}</button>`).join('');
  $('#crumb').textContent = navItems.find(x => x[1] === ui.page)?.[2] || '工作台';
}
function render() {
  const requested = CUSTOMER_VIEW ? 'playground' : location.hash.slice(1);
  ui.page = navItems.some(x => x[1] === requested) ? requested : 'overview';
  if (CUSTOMER_VIEW) {
    document.body.classList.add('customer-mode');
    $('#navigation').innerHTML = '';
  } else renderNav();
  const operatorLabel = $('#current-operator');
  if (operatorLabel) operatorLabel.textContent = state.operator;
  const views = { overview: renderOverview, playground: renderPlayground, robot: renderRobot, workflow: renderWorkflow, knowledge: renderKnowledge, sessions: renderSessions, tickets: renderTickets, quality: renderQuality, integrations: renderIntegrations, architecture: renderArchitecture };
  $('#page').innerHTML = views[ui.page]();
  restoreForms($('#page'));
  if (ui.page === 'workflow') window.CustomerFlowEditor.mount($('.graph-editor'), { state, ui, onChange: graphChanged, onSelect: (id, edge) => { ui.node = id; (state.workspace.graphView ||= {}).edge = edge; render(); }, onView: save, onError: toast });
  document.querySelectorAll('.chat-body').forEach(el => { el.scrollTop = el.scrollHeight; });
  $('#storage-warning').hidden = storageAvailable;
  save();
}

function renderItems(session, staff = false) {
  const items = Core.sessionItems(state, session);
  if (!items.length) return '<p class="tiny muted">提问后按诉求建立服务事项；结束聊天不会自动解决事项。</p>';
  return `<div class="service-items">${items.map(i => {
    const active = !['resolved','cancelled'].includes(i.status);
    const canSubmit = i.type === 'aftersales' && i.objectId && active && !i.tickets.length && (staff || Core.canSelfIntake(session, i));
    return `<article class="service-item" data-item-id="${i.id}"><div class="row between"><strong>${e(i.title)}</strong>${badge(Core.itemNames[i.status],i.status==='resolved'?'green':i.status==='awaiting_confirmation'?'blue':'orange')}</div><p class="tiny muted">${e(i.id)} · ${e(Core.itemTypes[i.type])}${i.objectId?' · '+e(i.objectId):''}</p><p class="tiny muted">首次受理 ${dateTime(i.created)}${i.resolvedAt?' · 确认 '+dateTime(i.resolvedAt):''}</p><div class="item-actions">${!staff && Core.canConfirmItem(state,i)?button('这项已解决','confirm-item',`data-id="${i.id}"`,'small primary'):''}${canSubmit?button('填写并确认售后申请','item-ticket',`data-id="${i.id}" data-session="${session.id}" data-visitor="${!staff}"`,'small'):''}${active&&session.status==='bot'&&i.status==='clarifying'?button('继续处理','resume-item',`data-id="${i.id}" data-session="${session.id}"`,'small'):''}${!staff&&['resolved','awaiting_confirmation'].includes(i.status)?button('仍需帮助','item-help',`data-id="${i.id}"`,'small'):''}${session.status==='ended'&&active?button('关联原事项再咨询','continue-item',`data-id="${i.id}"`,'small'):''}${i.tickets.map(tid=>{const t=Core.getTicket(state,tid);return `<button class="text-link" data-action="${staff?'ticket-detail':'ticket-read'}" data-id="${tid}">${e(tid)} · ${e(t.status)}${t.disputed?' / 异议待核':''} →</button>`;}).join('')}</div></article>`;
  }).join('')}</div>`;
}
function renderRuntime(compact = false) {
  const r = Core.capacityState(state);
  return `<section class="card runtime-card"><div class="card-head"><div><h2>接待设置</h2><p>服务组状态与接待容量立即生效。</p></div>${badge(r.humanMode === 'offline' ? '离线' : r.full ? '忙碌' : '可接待', r.humanMode === 'online' && !r.full ? 'green' : 'orange')}</div><div class="card-body"><form data-form="runtime"><div class="form-grid"><div class="field"><label for="runtime-mode">服务组状态</label><select id="runtime-mode" name="humanMode">${selectOptions([['online','在线'],['busy','忙碌'],['offline','离线']],r.humanMode)}</select></div><div class="field"><label for="runtime-tool">订单查询</label><select id="runtime-tool" name="toolEnabled">${selectOptions([['true','启用'],['false','停用']],String(r.toolEnabled))}</select></div></div><div class="form-grid"><div class="field"><label for="runtime-capacity">同时接待上限</label><input type="number" id="runtime-capacity" name="capacity" min="1" max="10" value="${r.capacity}" required></div><div class="field"><label for="runtime-operator">当前坐席</label><select id="runtime-operator" name="operator">${selectOptions(state.agents,state.operator)}</select></div></div><div class="field"><label for="runtime-reason">变更原因</label><input id="runtime-reason" name="reason" maxlength="300" required placeholder="填写调整原因，便于后续追溯"></div><div class="form-error" role="alert"></div><div class="row between"><span class="tiny muted">正在接待 ${r.occupied} / ${r.capacity}</span><button class="btn small primary" type="submit">保存接待设置</button></div></form></div></section>`;
}
function renderEvaluation(record) {
  if (!record) return empty('尚无回归记录，请先运行发布回归。');
  const current = Core.evaluationCurrent(state, record);
  return `<div class="evaluation"><div class="row between">${badge(!current ? '配置已变更，请重新回归' : record.passed ? '回归通过' : '回归未通过', !current ? 'orange' : record.passed ? 'green' : 'red')}<span class="tiny muted">${e(record.id)} · ${record.cases.filter(c => c.pass).length}/${record.cases.length} · ${dateTime(record.time)}</span></div><p class="tiny muted section-space">校验路由、知识引用、异常承接及发布配置的一致性。</p><div class="table-wrap"><table><thead><tr><th>用例</th><th>输入 / 期望</th><th>实际结果</th><th>判定</th></tr></thead><tbody>${record.cases.map(c => `<tr><td>${e(c.id)}</td><td class="wrap-cell"><strong>${e(c.query)}</strong><div class="secondary">${e(c.expected)}</div></td><td class="wrap-cell">${e(c.actual)}</td><td>${badge(c.pass ? '通过' : '未通过', c.pass ? 'green' : 'red')}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function assertIssue(q) { if(q?.status!=='已确认')throw new Error('请先确认问题及整改责任人'); }

function renderOverview() {
  const m = Core.metrics(state);
  const cards = [['服务事项',m.itemTotal,'按客户诉求统计','chat'],['客户已确认',m.confirmed,'已完成且经客户确认的事项','check'],['待处理事项',m.pendingItems,`其中 ${m.awaiting} 项待客户确认`,'clock'],['待处理工单',m.tickets,'包含待复核的客户异议','ticket']];
  const pending = state.items.filter(i => !['resolved','cancelled'].includes(i.status)).slice(0,8);
  return heading('服务工作台','查看待办、接待客户并跟进处理结果。',`<button class="btn primary" data-nav="sessions">${icon('chat')}进入接待</button>`)+
    `<div class="metric-grid">${cards.map(([label,value,foot,glyph]) => `<div class="card metric"><div class="row between"><span class="metric-label">${e(label)}</span><span class="metric-icon">${icon(glyph)}</span></div><div class="metric-value">${value}<span class="tiny muted"> 项</span></div><small>${e(foot)}</small></div>`).join('')}</div>`+
    `<section class="card"><div class="card-head"><div><h2>待处理事项</h2><p>优先跟进未完成的服务请求。</p></div><span class="tiny muted">更新于 ${dateTime(Core.now())}</span></div><div class="table-wrap"><table><thead><tr><th>事项</th><th>状态</th><th>业务对象</th><th>关联工单</th><th>操作</th></tr></thead><tbody>${pending.map(i => `<tr><td><strong>${e(i.title)}</strong><div class="secondary">${e(i.id)}</div></td><td>${badge(Core.itemNames[i.status],i.status === 'awaiting_confirmation' ? 'blue' : 'orange')}</td><td>${e(i.objectId || '—')}</td><td>${e(i.tickets.join('、') || '暂无工单')}</td><td>${i.sessionIds.length ? button('处理会话','open-session',`data-id="${e(i.sessionIds.at(-1))}"`,'small') : i.tickets.length ? button('处理工单','ticket-detail',`data-id="${e(i.tickets[0])}"`,'small') : '<span class="tiny muted">暂无关联记录</span>'}</td></tr>`).join('')}</tbody></table>${!pending.length ? empty('暂无待处理事项') : ''}</div></section>`+
    `<div class="grid-2 section-space"><section class="card"><div class="card-head"><h2>服务待办</h2></div><div class="card-body"><div class="definition-row"><span>等待人工接管</span><button class="text-link" data-nav="sessions">${m.waiting} 个会话 →</button></div><div class="definition-row"><span>待复核问题</span><button class="text-link" data-nav="quality">${m.issues} 项 →</button></div><div class="definition-row"><span>待完成整改</span><button class="text-link" data-action="open-remediations">${m.corrections} 项 →</button></div></div></section><section class="card"><div class="card-head"><h2>服务配置</h2></div><div class="card-body"><div class="definition-row"><span>当前生效知识</span><button class="text-link" data-nav="knowledge">${m.knowledge} 条 →</button></div><div class="definition-row"><span>已发布流程</span><button class="text-link" data-nav="workflow">v${state.published.version} →</button></div><div class="definition-row"><span>接待设置</span><button class="text-link" data-nav="architecture">查看设置 →</button></div></div></section></div><p class="tiny muted section-space">统计范围：当前工作空间。服务事项与工单分别计数，结束会话不会自动完成待办。</p>`;
}
function renderIntakeProgress(session, message) {
  const item=Core.getItem(state,message.itemId),last=item.tickets.length?Core.getTicket(state,item.tickets.at(-1)):null;
  return `<div class="intake-card"><strong>售后受理 · 当前${last?'已登记 '+e(last.id):'尚未提交'}</strong><p>${last?'工单 '+e(last.status)+(last.disputed?' · 异议待核':'')+'；事项 '+e(Core.itemNames[item.status]):'请核对订单与问题描述后提交申请。'}</p>${last?button('查看当前进度',ui.page==='playground'?'ticket-read':'ticket-detail',`data-id="${last.id}"`,'small'):button('填写并确认售后申请','item-ticket',`data-id="${item.id}" data-session="${session.id}" data-visitor="${ui.page==='playground'}"`,'small')}</div>`;
}
function renderMessages(s) {
  return s.messages.map((m, index) => {
    if (m.role === 'system') return `<div class="message system"><div class="bubble">${e(m.text)}${m.ticketId ? `<br><button class="text-link" data-action="${ui.page==='playground'?'ticket-read':'ticket-detail'}" data-id="${m.ticketId}">查看工单进度 →</button>` : ''}</div></div>`;
    const isUser = m.role === 'user', name = isUser ? s.name : m.role === 'agent' ? (m.agentName || '客服小林') : s.robot.name;
    return `<div class="message ${isUser ? 'user' : ''}"><span class="avatar ${isUser ? '' : 'blue'}">${isUser ? e(s.name.slice(0,1)) : m.role === 'agent' ? '林' : icon('bot')}</span><div class="message-content"><div class="message-meta">${e(name)} · ${clockTime(m.time)}</div><div class="bubble">${e(m.text)}</div>${m.citation ? `<button class="source-button" data-action="source" data-id="${s.id}" data-index="${index}">${icon('book')}来源：${e(m.citation.title)} · v${m.citation.version}</button>` : ''}${m.order ? renderOrder(m.order) : ''}${m.intake&&m.itemId?renderIntakeProgress(s,m):''}${m.citation?`<p class="citation-state">${e(Core.citationStatus(state,m.citation))}</p>`:''}</div></div>`;
  }).join('');
}
function renderOrder(order) {
  return `<div class="order-card"><div class="row"><div class="product-image">${e(order.icon)}</div><div><h3>${e(order.product)}</h3><p>¥ ${e(order.price)} · 1 件</p></div></div><div class="order-details"><span>订单状态</span><span>${e(order.status)}</span><span>订单编号</span><span>${e(order.id)}</span><span>配送进展</span><span>${e(order.delivery)}</span><span>收件人</span><span>${e(order.receiver)}</span></div><div class="tiny subtle" style="margin-top:8px;font-size:9px">订单信息${order.queriedAt?' · 查询时间 '+dateTime(order.queriedAt):''}</div></div>`;
}
function renderTrace(trace) {
  if (!trace?.length) return '<div class="trace-empty">发送消息后，在这里查看路由与处理结果。</div>';
  return `<div class="trace">${trace.map((t, i) => `<div class="trace-step ${['error','warning'].includes(t.status) ? 'error' : ''}"><h3>${String(i+1).padStart(2,'0')} · ${e(t.label)}</h3><p>${e(t.detail)}</p>${t.status !== 'success' ? badge(({error:'异常',warning:'兜底',waiting:'等待'})[t.status] || t.status,'orange') : ''}</div>`).join('')}</div>`;
}

function renderPlayground() {
  const s = state.sessions.find(item => item.id === ui.play);
  const customerMode = CUSTOMER_VIEW || document.body.classList.contains('customer-mode');
  const history = state.sessions.filter(item => item.name === '林小夏' || item.id === ui.play);
  const controls = customerMode ? '' : `<a class="btn" href="?view=customer#playground">打开客户页面</a><select aria-label="预览会话" data-play-select><option value="">选择已有会话</option>${history.map(item => `<option value="${e(item.id)}" ${item.id === ui.play ? 'selected' : ''}>${e(item.id)} · ${e(item.name)} · ${e(sessionNames[item.status])}</option>`).join('')}</select>${button('新建会话','new-chat')}`;
  const entries = `<div class="service-entry"><button data-action="entry" data-query="七天无理由退货有什么条件？"><strong>服务规则</strong><small>了解退换货与服务政策</small></button><button data-action="entry" data-query="帮我查订单"><strong>订单物流</strong><small>查询订单及配送进度</small></button><button data-action="entry" data-query="我要申请退货"><strong>申请售后</strong><small>提交问题并跟进处理</small></button></div>`;
  const customerId = s?.customerId || Core.orders[0]?.customerId;
  const customerHistory = state.sessions.filter(item => item.customerId === customerId && item.name === (s?.name || '林小夏'));
  const consultations = customerMode && customerHistory.length ? `<section class="card section-space"><div class="card-head"><h2>我的咨询</h2></div><div class="card-body">${customerHistory.map(item => `<div class="section-space">${button(`${dateTime(item.created)} · ${item.id} · ${sessionNames[item.status]}`, 'open-visitor', `data-id="${e(item.id)}" ${item.id === ui.play ? 'disabled' : ''}`, 'small')}<p class="tiny muted">${e(item.summary || '服务咨询')}${item.tickets.length ? ' · '+e(item.tickets.join('、')) : ''}</p></div>`).join('')}</div></section>` : '';
  const orders = Core.orders.filter(order => order.customerId === customerId);
  const orderPanel = `<aside class="card customer-orders"><div class="card-head"><h2>我的订单</h2></div><div class="card-body">${orders.map(order => `<article class="customer-order"><strong>${e(order.product)}</strong><p class="tiny muted">${e(order.id)}</p><div class="row between">${badge(order.status,'blue')}<button class="text-link" data-action="entry" data-query="${e('查询订单 '+order.id)}">查询进度 →</button></div><button class="text-link section-space" data-action="entry" data-query="${e('我要申请退货 '+order.id)}">申请售后</button></article>`).join('') || '<p class="tiny muted">暂无订单</p>'}</div></aside>`;
  const title = customerMode ? '青禾生活 · 在线客服' : '渠道预览';
  if (!s) return heading(title,'咨询服务问题，查询订单或办理售后。',controls)+`<div class="customer-service-layout"><section class="card start-panel"><div class="bot-avatar">${icon('bot')}</div><h2>有什么可以帮你？</h2><p>请选择服务，也可以直接描述你遇到的问题。</p>${button('开始咨询','new-chat','','primary')}${entries}</section><div>${orderPanel}${consultations}</div></div>`;
  const inactive = s.status === 'ended', r = Core.capacityState(state);
  const notes = { waiting: r.full ? '当前咨询较多，已为你排队。你可以继续补充问题，或提交工单跟进。' : '正在为你接入人工客服，请稍候。你可以继续补充问题。', human: `${s.owner}正在为你服务。`, offline: '人工客服当前离线。可以提交问题，也可以继续自助咨询；处理进度可在这里查看。', ended: '本次咨询已结束，未完成的服务事项和工单可继续跟进。' };
  const chat = `<section class="card chat-panel"><div class="chat-title"><div class="bot-avatar">${icon('bot')}</div><div><h3>${e(s.robot.name)}</h3><small>${e(s.robot.description)}</small></div><span class="spacer"></span>${badge(sessionNames[s.status],sessionColors[s.status])}</div>${notes[s.status] ? `<div class="chat-status">${e(notes[s.status])}</div>` : ''}<div class="chat-body" aria-live="polite">${renderMessages(s)}</div><div class="chat-tools">${s.status === 'bot' ? button('转人工','visitor-handoff',`data-id="${e(s.id)}"`,'small') : ''}${['waiting','offline'].includes(s.status) ? button(s.status === 'waiting' ? '取消排队' : '继续自助咨询','resume-bot',`data-id="${e(s.id)}"`,'small') : ''}${!inactive ? button('提交问题','new-ticket',`data-session="${e(s.id)}" data-visitor="true"`,'small') : ''}${!inactive ? button('结束咨询','visitor-finish',`data-id="${e(s.id)}"`,'small') : ''}</div>${!inactive ? `<form class="chat-input" data-form="visitor-message" data-id="${e(s.id)}"><textarea name="message" data-chat-input maxlength="2000" aria-label="访客消息" placeholder="${s.status === 'bot' ? '请描述你需要咨询或办理的事情…' : '可以继续补充问题或相关信息…'}"></textarea><div class="send-foot"><small>Enter 发送 · Shift+Enter 换行</small><button class="btn primary small" type="submit" disabled>发送 ${icon('send')}</button></div></form>` : `<div class="card-body">${button('发起新咨询','new-chat','','primary')}</div>`}<div class="items-panel"><h3>我的服务事项</h3><p class="tiny muted">查看处理进度，问题解决后请确认结果。</p>${renderItems(s)}</div></section>`;
  const trace = customerMode ? '' : `<details class="card section-space preview-diagnostics"><summary>会话执行记录 · ${e(s.id)} · 流程 v${s.flow.version}</summary>${renderTrace(s.runs.at(-1)?.trace)}<div class="card-body">${button('查看坐席会话','open-session',`data-id="${e(s.id)}"`,'small')}</div></details>`;
  return heading(title,customerMode ? '服务问题、订单查询与售后处理。' : '查看客户接待页面与当前会话的服务结果。',controls)+`<div class="customer-service-layout">${chat}<div>${orderPanel}${consultations}</div></div>${trace}`;
}
function sessionSummary(s) { return Core.sessionSummary(s, state); }
function renderSessions() {
  const list = state.sessions.filter(s => (!ui.filters.sessionStatus || s.status===ui.filters.sessionStatus) && `${s.id} ${s.name} ${s.messages.map(m=>m.text).join(' ')}`.toLowerCase().includes(ui.filters.sessions.trim().toLowerCase())).sort((a,b)=>(b.messages.at(-1)?.time||b.created).localeCompare(a.messages.at(-1)?.time||a.created));
  let s = list.find(s=>s.id===ui.session) || list[0];
  if (s) ui.session = s.id;
  const right = s ? `<div class="session-detail"><div class="chat-title"><span class="avatar green">${e(s.name.slice(0,1))}</span><div><h3>${e(s.name)}</h3><small>${e(s.id)} · ${e(s.channel)}</small></div><span class="spacer"></span>${['waiting','offline'].includes(s.status)?button(s.status==='offline'?'接管留言':'接管会话','takeover',`data-id="${s.id}"`,'primary small'):badge(sessionNames[s.status],sessionColors[s.status])}</div><div class="chat-body">${renderMessages(s)}</div><div class="chat-tools">${button('创建工单','new-ticket',`data-session="${s.id}"`,'small')}${button('标记问题','mark-issue',`data-id="${s.id}"`,'small')}${button('结束会话','agent-finish',`data-id="${s.id}" ${s.status!=='human'||s.owner!==state.operator?'disabled':''}`,'small')}<button class="text-link" data-action="open-visitor" data-id="${s.id}">查看接待预览 →</button></div><form class="chat-input" data-form="agent-message" data-id="${s.id}"><textarea name="message" data-chat-input aria-label="坐席回复" maxlength="2000" placeholder="${s.status==='human'&&s.owner===state.operator?'输入人工回复…':'取得当前会话接管权后可以回复'}" ${s.status!=='human'||s.owner!==state.operator?'disabled':''}></textarea><div class="send-foot"><small>Enter 发送 · Shift+Enter 换行</small><button type="submit" class="btn primary small" ${s.status!=='human'||s.owner!==state.operator?'disabled':''}>发送回复 ${icon('send')}</button></div></form></div><aside class="context-panel"><h3>访客信息</h3><div class="definition-row"><span>客户</span><strong>${e(s.name)}</strong></div><div class="definition-row"><span>来源渠道</span><strong>${e(s.channel)}</strong></div><div class="definition-row"><span>开始时间</span><strong>${dateTime(s.created)}</strong></div><div class="definition-row"><span>流程版本</span><strong>v${s.flow.version}</strong></div><div class="divider"></div><h3>服务事项</h3>${renderItems(s,true)}<div class="divider"></div><h3>转接摘要</h3><div class="summary-box">${e(sessionSummary(s))}</div><div class="divider"></div><h3>关联工单</h3>${s.tickets.length?s.tickets.map(id=>`<button class="source-button full-width" data-action="ticket-detail" data-id="${id}">${icon('ticket')}${e(id)}<span class="spacer"></span>查看 →</button>`).join(''):'<p class="tiny muted">暂无关联工单</p>'}<div class="divider"></div><h3>最近执行轨迹</h3>${renderTrace(s.runs.at(-1)?.trace)}</aside>` : empty('没有符合筛选条件的会话');
  return heading('会话中心','把机器人处理过的信息，连续交给人工客服。',`${ui.returnTo?button(ui.returnTo.kind==='issue'?'返回问题复核':'返回工单详情','return-context'):''}<span class="tiny muted">${Core.metrics(state).waiting} 个会话等待接管</span>`) + `<section class="card session-layout"><aside class="session-list"><div class="toolbar">${search('sessions','搜索客户、问题或会话号')}<select data-filter="sessionStatus" aria-label="会话状态">${selectOptions([['','全部状态'],...Object.entries(sessionNames)],ui.filters.sessionStatus)}</select></div>${list.map(s=>`<button class="session-item ${s.id===ui.session?'active':''}" data-action="select-session" data-id="${s.id}"><div class="row between"><strong>${e(s.name)}</strong><span class="when">${clockTime(s.messages.at(-1)?.time||s.created)}</span></div><div class="preview">${e(s.summary||'客户进入会话')}</div><div class="row between" style="margin-top:9px">${badge(sessionNames[s.status],sessionColors[s.status])}<span class="when">${e(s.id)}</span></div></button>`).join('')||empty('无匹配会话')}</aside>${right}</section><div class="section-space">${renderRuntime()}</div>`;
}
function renderRobot() {
  return heading('机器人配置','维护服务身份与欢迎语，保存后对新会话生效。',button('预览已保存配置','verify-live','','primary'))+`<div class="grid-2"><section class="card"><div class="card-head"><h2>基础信息</h2></div><div class="card-body"><form data-form="robot"><div class="field"><label for="robot-name">机器人名称<span class="required">*</span></label><input id="robot-name" name="name" required maxlength="30" value="${e(state.robot.name)}"></div><div class="field"><label for="robot-description">服务说明<span class="required">*</span></label><input id="robot-description" name="description" required maxlength="80" value="${e(state.robot.description)}"></div><div class="field"><label for="robot-greeting">欢迎语<span class="required">*</span></label><textarea id="robot-greeting" name="greeting" required maxlength="300">${e(state.robot.greeting)}</textarea><span class="help">客户发起咨询时展示。</span></div><div class="form-error" role="alert"></div><div class="form-footer"><button class="btn primary" type="submit">保存配置</button></div></form></div></section><section class="card"><div class="card-head"><h2>服务能力</h2></div><div class="card-body"><div class="definition-row"><span>问答方式</span><strong>知识匹配与服务流程</strong></div><div class="definition-row"><span>知识范围</span><strong>当前生效 FAQ</strong></div><div class="definition-row"><span>流程版本</span><strong>v${state.published.version}</strong></div><div class="definition-row"><span>模型服务</span>${badge('未接入')}</div><div class="divider"></div><button class="text-link" data-nav="workflow">管理服务流程 →</button><div class="section-space"><button class="text-link" data-nav="integrations">查看接入配置 →</button></div></div></section></div>`;
}
function nodeForm() { return window.CustomerFlowEditor.nodeForm(state, ui.node); }
function renderWorkflow() {
  if (ui.flowTest && (ui.flowTest.runtimeKey !== JSON.stringify(Core.capacityState(state)) || ui.flowTest.flowKey !== Core.fingerprint(state.draft, state.knowledge))) invalidateTest();
  const changed = Core.flowChanged(state);
  return heading('流程编排', '添加节点、连接分支，在测试中查看真实执行路径。', `<span class="badge ${changed ? 'orange' : 'green'}" id="flow-draft-status">${changed ? '草稿已自动保存 · 待发布' : '与发布版本一致'}</span>${button('运行发布回归','evaluate-flow')}${button('发布流程','publish-flow',changed ? '' : 'disabled','primary')}${button('新建会话验证发布版','verify-live')}`) +
    renderQueryCompatibility() + window.CustomerFlowEditor.render(state, ui) +
    `<section class="card section-space"><div class="card-head"><div><h2>草稿测试</h2><p>沿当前画布连线运行，不创建会话或工单。结构完整后才可测试。</p></div>${badge('草稿执行','blue')}</div><form data-form="flow-test" class="toolbar"><input name="question" aria-label="流程测试问题" placeholder="例如：加急查询订单 SO20260926001" value="${e(ui.flowTest?.query || '查询订单 SO20260926001')}" maxlength="2000" required style="flex:1"><select name="orderResponse" aria-label="订单查询测试响应">${selectOptions([['success','正常查询'],['timeout','查询超时']],ui.flowTest?.response || 'success')}</select><button class="btn primary" type="submit">${icon('play')}运行测试</button></form><div id="flow-test-result">${ui.flowTest ? `<div class="test-result"><div><h3 style="margin-bottom:12px">访客看到的结果</h3>${ui.flowTest.result.messages.map(m => `<div class="bubble">${e(m.text)}</div>${m.order ? renderOrder(m.order) : ''}`).join('')}<div class="note section-space">发布后新建会话使用这张图；旧会话保留原版本。</div></div>${renderTrace(ui.flowTest.result.trace)}</div>` : '<div class="empty" style="padding:27px">运行测试后，画布会高亮经过的节点与连线。</div>'}</div></section>` +
    `<section class="card section-space"><div class="card-head"><div><h2>发布回归与历史</h2><p>检查客服主线、异常承接和存量知识引用。草稿变更后重新回归；恢复历史先进入草稿。</p></div>${button('运行发布回归','evaluate-flow','','small')}</div><div class="card-body">${state.flowValidation ? renderEvaluation(state.flowValidation) : empty('尚无当前草稿的发布回归记录。')}<div class="table-wrap section-space"><table><thead><tr><th>版本</th><th>发布说明</th><th>测试依据</th><th>时间 / 操作者</th><th>操作</th></tr></thead><tbody>${[...state.releases].reverse().map(r => `<tr><td>v${r.version}</td><td>${e(r.reason)}</td><td>${e(r.validationId)}</td><td>${dateTime(r.time)} · ${e(r.operator)}</td><td>${r.version !== state.published.version ? button('恢复为草稿','rollback-flow',`data-id="${r.version}"`,'small') : '当前版本'}</td></tr>`).join('')}</tbody></table></div></div></section>`;
}

function renderKnowledge() {
  const items=state.knowledge.filter(k=>(!ui.filters.knowledgeStatus||k.status===ui.filters.knowledgeStatus||ui.filters.knowledgeStatus==='pending'&&k.draft)&&`${k.title} ${k.standardQuestion} ${k.answer} ${k.keywords} ${k.id} ${k.draft?.title||''}`.toLowerCase().includes(ui.filters.knowledge.trim().toLowerCase()));
  return heading('FAQ 与知识库','先保存草稿，再验证引用与分支，最后发布给客户使用。',`${button('检索已发布内容','knowledge-test')}${button('新建 FAQ','edit-knowledge','','primary')}`)+`<section class="card"><div class="toolbar">${search('knowledge','搜索标题、标准问题、内容或编号')}<select data-filter="knowledgeStatus" aria-label="知识状态">${selectOptions([['','全部状态'],...Object.entries(knowledgeNames),['pending','有待发布修改']],ui.filters.knowledgeStatus)}</select><span class="spacer"></span><span class="tiny muted">${state.knowledge.length} 条 · ${Core.metrics(state).knowledge} 条当前生效</span></div><div class="table-wrap"><table><thead><tr><th>标题 / 标准问题</th><th>范围 / 维护人</th><th>状态 / 版本</th><th>生效区间</th><th>操作</th></tr></thead><tbody>${items.map(k=>`<tr data-knowledge-row="${k.id}" class="${ui.focusKnowledge===k.id?'highlight-row':''}"><td class="wrap-cell"><strong>${e(k.title)}</strong><div class="secondary">${e(k.id)} · ${e(k.standardQuestion)}</div></td><td>${e(k.scope)}<div class="secondary">${e(k.owner)}</div></td><td>${badge(knowledgeNames[k.status]+' v'+k.version,Core.isKnowledgeActive(k)?'green':'orange')}${k.draft?`<div class="secondary">待发布草稿 v${k.draft.version}</div>`:''}${k.status==='published'&&!Core.isKnowledgeActive(k)?'<div class="secondary">当前不在生效范围</div>':''}</td><td>${dateTime(k.effectiveAt)}<div class="secondary">至 ${k.expiresAt?dateTime(k.expiresAt):'长期有效'}</div></td><td><div class="row wrap">${button('编辑','edit-knowledge',`data-id="${k.id}"`,'small')}${k.draft||k.status!=='published'?`${button('草稿回归','evaluate-knowledge',`data-id="${k.id}"`,'small')}${button('发布','publish-knowledge',`data-id="${k.id}"`,'small')}`:''}${k.status==='published'?button('停用','disable-knowledge',`data-id="${k.id}"`,'small'):''}</div></td></tr>`).join('')}</tbody></table>${!items.length?empty('没有匹配知识，请调整筛选'):''}</div><div class="stats-footer">维护标准问答、适用范围、来源与有效期。保存草稿后完成回归，再发布供客户使用。</div></section>`;
}
function knowledgeModal(id, issueId = '') {
  const record=state.knowledge.find(k=>k.id===id), k=record?.draft||record;
  const issue=issueId?state.issues.find(q=>q.id===issueId):null;
  const toLocal=t=>t?new Date(new Date(t).getTime()-new Date(t).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
  ui.modalContext=null;
  modal(record?'编辑知识':'新建 FAQ',`<form data-form="knowledge" data-id="${e(id||'')}" data-issue="${e(issueId)}">${record?.status==='published'?`<div class="note blue">当前 v${record.version} 持续参与回答；保存草稿不会撤下原答案。发布必须有匹配的回归记录。</div>`:''}${issue?`<div class="note">关联整改 ${e(issue.id)}，原问题：${e(issue.query||issue.evidence)}。只预填问题，答案和来源需人工维护。</div>`:''}<div class="field"><label for="knowledge-title">知识标题<span class="required">*</span></label><input id="knowledge-title" name="title" value="${e(k?.title||'')}" required maxlength="80"></div><div class="field"><label for="knowledge-question">标准问题<span class="required">*</span></label><input id="knowledge-question" name="standardQuestion" value="${e(k?.standardQuestion||issue?.query||issue?.evidence||'')}" required maxlength="200"></div><div class="form-grid"><div class="field"><label for="knowledge-category">分类</label><select id="knowledge-category" name="category">${selectOptions(['通用服务','产品知识','售后政策','会员权益','活动规则'],k?.category||'通用服务')}</select></div><div class="field"><label for="knowledge-keywords">匹配关键词<span class="required">*</span></label><input id="knowledge-keywords" name="keywords" value="${e(k?.keywords||'')}" required maxlength="200" placeholder="礼品卡,分次使用"><span class="help">${answerRule}，才会作答。</span></div></div><div class="field"><label for="knowledge-answer">标准答案<span class="required">*</span></label><textarea id="knowledge-answer" name="answer" required maxlength="2000" style="min-height:130px">${e(k?.answer||'')}</textarea></div><div class="form-grid"><div class="field"><label for="knowledge-scope">适用范围<span class="required">*</span></label><input id="knowledge-scope" name="scope" required maxlength="80" value="${e(k?.scope||'青禾生活')}"></div><div class="field"><label for="knowledge-owner">维护人<span class="required">*</span></label><input id="knowledge-owner" name="owner" required maxlength="80" value="${e(k?.owner||'客服运营')}"></div></div><div class="field"><label for="knowledge-source">来源说明<span class="required">*</span></label><textarea id="knowledge-source" name="source" required maxlength="1000" placeholder="填写政策文件、知识来源与审核依据。">${e(k?.source||'')}</textarea></div><div class="form-grid"><div class="field"><label for="knowledge-effective">生效时间（当前浏览器时区）</label><input id="knowledge-effective" type="datetime-local" name="effectiveAt" required value="${toLocal(k?.effectiveAt||Core.now())}"></div><div class="field"><label for="knowledge-expiry">失效时间（可空）</label><input id="knowledge-expiry" type="datetime-local" name="expiresAt" value="${toLocal(k?.expiresAt)}"></div></div><div class="form-error" role="alert"></div><div class="form-footer">${button('暂存并关闭','close-modal')}<button class="btn primary" type="submit" name="intent" value="draft">保存草稿</button><button class="btn" type="submit" name="intent" value="test">保存并运行草稿回归</button></div></form>`);
}
function renderTickets() {
  const list = state.tickets.filter(t=>(!ui.filters.ticketStatus||t.status===ui.filters.ticketStatus)&&`${t.id} ${t.title} ${t.owner}`.includes(ui.filters.tickets));
  return heading('工单中心','把需要持续跟进的问题留在工单里。',button(`${icon('plus')}新建工单`,'new-ticket','','primary'))+
    `<section class="card"><div class="toolbar">${search('tickets','搜索工单标题、编号或负责人')}<select data-filter="ticketStatus" aria-label="工单状态">${selectOptions([['','全部状态'],...Object.keys(Core.transitions)],ui.filters.ticketStatus)}</select><span class="spacer"></span><span class="tiny muted">共 ${list.length} 个工单</span></div><div class="table-wrap"><table><thead><tr><th>工单编号 / 标题</th><th>类型</th><th>优先级</th><th>状态</th><th>负责人</th><th>关联会话</th><th>操作</th></tr></thead><tbody>${list.map(t=>`<tr><td><strong>${e(t.title)}</strong><div class="secondary">${e(t.id)} · ${dateTime(t.created)}</div></td><td>${e(t.category)}</td><td>${badge(t.priority,t.priority==='紧急'?'red':'')}</td><td>${badge(t.status,t.status==='已完成'?'green':t.status==='待分配'?'orange':'blue')}${t.disputed?'<div class="secondary danger-text">异议待核</div>':''}<div class="secondary">${e(t.itemId)}</div></td><td>${e(t.owner||'待分配')}</td><td>${t.sessionId?`<button class="text-link" data-action="open-session" data-id="${t.sessionId}">${e(t.sessionId)}</button>`:'—'}</td><td><button class="text-link" data-action="ticket-detail" data-id="${t.id}">查看详情</button></td></tr>`).join('')}</tbody></table>${!list.length?empty('没有匹配的工单，可以从会话中创建'):''}</div><div class="stats-footer">工单按受理、分配、补充与结果确认持续跟进。</div></section>`;
}
function ticketModal(sessionId, visitor = false, selectedItemId = '') {
  const s=state.sessions.find(s=>s.id===sessionId), eligible=s?Core.sessionItems(state,s).filter(i=>!['resolved','cancelled'].includes(i.status)):[];
  const i=selectedItemId?Core.getItem(state,selectedItemId):eligible.length===1?eligible[0]:null;
  if(i&&i.tickets.some(id=>!['已完成','已撤销'].includes(Core.getTicket(state,id).status)||Core.getTicket(state,id).disputed)) {
    const tid=i.tickets.find(id=>!['已完成','已撤销'].includes(Core.getTicket(state,id).status)||Core.getTicket(state,id).disputed);ticketDetail(tid,visitor);toast('已有此事项的工单，继续原记录，未重复创建');return;
  }
  if(visitor && i?.type==='aftersales' && !Core.canSelfIntake(s, i)) { toast('此会话未开放自助售后受理，请由客服协助登记'); return; }
  const title=i?.title||'', description=i?.request||(s?Core.sessionSummary(s,state):'');
  ui.modalContext=null;
  modal(visitor?'提交问题 · 先预览再确认':'创建关联工单',`<form data-form="new-ticket" data-session="${e(sessionId||'')}" data-visitor="${visitor}" data-request-key="${e('submit-'+Core.uid(state,'REQ'))}"><div class="note blue">${s?'关联会话 '+e(s.id):'独立受理将同时建立一个服务事项'}。登记只代表受理，退款等业务结果由人工核实。</div>${s?`<div class="field"><label for="ticket-item">归属事项<span class="required">*</span></label><select id="ticket-item" name="itemId" ${eligible.length?'required':''}>${selectOptions([['',eligible.length?'请选择归属事项':'新建独立服务事项'],...eligible.map(i=>[i.id,i.id+' · '+i.title])],i?.id||'')}</select></div>`:''}<div class="field"><label for="ticket-title">问题标题<span class="required">*</span></label><input id="ticket-title" name="title" maxlength="80" required value="${e(title)}"></div><div class="form-grid"><div class="field"><label for="ticket-category">问题类型</label><select id="ticket-category" name="category">${selectOptions(['售后服务','订单物流','知识咨询','其他问题'],i?.type==='order'?'订单物流':i?.type==='knowledge'?'知识咨询':i?.type==='aftersales'?'售后服务':'其他问题')}</select></div>${visitor?'<input type="hidden" name="priority" value="普通">':`<div class="field"><label for="ticket-priority">优先级</label><select id="ticket-priority" name="priority">${selectOptions(['普通','较高','紧急'],'普通')}</select></div>`}</div><div class="field"><label for="ticket-object">订单线索${i?.type==='aftersales'?'<span class="required">*</span>':''}</label><input id="ticket-object" name="objectId" maxlength="80" value="${e(i?.objectId||'')}" placeholder="例如 SO20260926001；客服会核实，不作为资格证明">${visitor?'<p class="help">自助售后需使用本次咨询确认的订单号；更换订单请回到咨询窗口重新申请。</p>':''}</div><div class="field"><label for="ticket-description">问题描述<span class="required">*</span></label><textarea id="ticket-description" name="description" required maxlength="2000" style="min-height:120px">${e(description)}</textarea></div><div class="form-error" role="alert"></div><div class="form-footer">${button('暂存并关闭','close-modal')}<button class="btn primary" type="submit">预览并确认提交</button></div></form>`);
}
function ticketDetail(id, readOnly = false) {
  const t=Core.getTicket(state,id), item=Core.getItem(state,t.itemId);
  ui.modalContext={kind:'ticket',id};
  modal(t.id+' · '+t.title,`<div class="row wrap">${badge(t.status,t.status==='已完成'?'green':'blue')}${t.disputed?badge('异议待核','orange'):''}${badge(Core.itemNames[item.status])}<span class="tiny muted">事项 ${e(item.id)} · ${e(t.category)}</span></div><div class="summary-box section-space">${e(readOnly&&!t.customerSubmitted?'客服已根据本次咨询建立此工单：'+t.title:t.description)}${t.objectId?'\n订单线索：'+e(t.objectId):''}</div>${!readOnly&&t.sessionId?`<button class="text-link section-space" data-action="open-session" data-id="${t.sessionId}">查看关联会话 ${e(t.sessionId)} →</button>`:''}<div class="divider"></div>${!readOnly&&t.disputed?`<form data-form="ticket-dispute-review" data-id="${t.id}"><div class="note orange">客户异议：${e(t.disputeReason)}。工单保留已完成，事项已立即回到待人工。</div><div class="field"><label for="dispute-decision">复核处置</label><select id="dispute-decision" name="decision">${selectOptions([['reopen','异议成立，重开原工单'],['dismiss','经证据核实，维持原结果']],'reopen')}</select></div><div class="field"><label for="dispute-reason">客户可见复核说明</label><textarea id="dispute-reason" name="reason" required maxlength="1000"></textarea></div><div class="field"><label for="dispute-evidence">内部复核证据</label><textarea id="dispute-evidence" name="evidence" required maxlength="1000" placeholder="填写已核验的业务记录、凭证编号与核验结论"></textarea></div><div class="form-error" role="alert"></div><button class="btn primary" type="submit">确认复核处置</button></form>`:!readOnly&&Core.transitions[t.status].length?`<form data-form="ticket-progress" data-id="${t.id}"><div class="form-grid"><div class="field"><label for="ticket-owner">负责人</label><select id="ticket-owner" name="owner">${selectOptions([['','请选择负责人'],...state.agents],t.owner)}</select></div><div class="field"><label for="ticket-next">下一状态<span class="required">*</span></label><select id="ticket-next" name="status" required>${selectOptions([['','请选择下一状态'],...Core.transitions[t.status]],'')}</select></div></div><div class="field"><label for="ticket-note">客户可见处理说明</label><textarea id="ticket-note" name="note" maxlength="1000" placeholder="待补充时说清缺什么；完成时说明实际处理结果。"></textarea></div><div class="field"><label for="ticket-internal">内部备注（不发送给客户）</label><textarea id="ticket-internal" name="internalNote" maxlength="1000"></textarea></div><div class="field"><label for="ticket-evidence">结果证据（完成时必填，仅内部可见）</label><textarea id="ticket-evidence" name="evidence" maxlength="1000" placeholder="填写业务凭证编号及核验结论，请勿填写完整账户或敏感身份信息。"></textarea></div><div class="form-error" role="alert"></div><div class="form-footer"><button class="btn primary" type="submit">更新工单</button></div></form>`:`<div class="note">${t.disputed?'正在复核你的未解决异议。':t.status==='已完成'?'处理环节已完成。请回到服务事项确认结果；仍有问题可提出异议。':'已保存问题，请在这里查看处理进度。'}</div>`}<h3 class="section-space">流转记录</h3>${[...t.history].reverse().map(h=>`<div class="timeline-item">${e(h.text)}${!readOnly&&h.internalNote?`<div class="internal-note">内部备注：${e(h.internalNote)}</div>`:''}${!readOnly&&h.evidence?`<div class="internal-note">内部证据：${e(h.evidence)}</div>`:''}<small>${dateTime(h.time)}</small></div>`).join('')}${readOnly&&t.status==='待客户补充'?`<form data-form="ticket-reply" data-id="${t.id}" class="section-space"><div class="field"><label for="ticket-reply">补充说明<span class="required">*</span></label><textarea id="ticket-reply" name="reply" required maxlength="1000" placeholder="会话结束后仍可提交，将重新核对负责人可用性。"></textarea></div><div class="form-error" role="alert"></div><button class="btn primary" type="submit">提交补充说明</button></form>`:''}${readOnly&&t.status==='已完成'&&!t.disputed?`<form data-form="ticket-dispute" data-id="${t.id}" class="section-space"><div class="field"><label for="ticket-objection">仍未解决？说明当前问题</label><textarea id="ticket-objection" name="reason" required maxlength="1000"></textarea></div><div class="form-error" role="alert"></div><button class="btn" type="submit">提出未解决异议</button></form>`:''}${readOnly?`<div class="form-footer">${button('返回咨询','close-modal','','primary')}</div>`:''}`);
}
function renderQuality() {
  const issues = state.issues.filter(q=>!ui.filters.qualityStatus||q.status===ui.filters.qualityStatus);
  const runs = state.sessions.flatMap(s=>s.runs.map(r=>({...r,sessionId:s.id,name:s.name}))).sort((a,b)=>b.time.localeCompare(a.time));
  const issueTable = `<div class="toolbar"><span class="tiny muted">异常是待复核线索，不自动判定为服务违规。</span><span class="spacer"></span><select data-filter="qualityStatus" aria-label="复核状态">${selectOptions([['','全部复核状态'],'待复核','已确认','已排除','信息不足'],ui.filters.qualityStatus)}</select></div><div class="table-wrap"><table><thead><tr><th>问题类型</th><th>证据摘要</th><th>关联会话</th><th>复核状态</th><th>操作</th></tr></thead><tbody>${issues.map(q=>`<tr><td><strong>${e(q.type)}</strong><div class="secondary">${e(q.id)}</div></td><td style="white-space:normal;max-width:300px">${e(q.evidence.slice(0,100))}</td><td><button class="text-link" data-action="open-session" data-id="${q.sessionId}">${e(q.sessionId)}</button></td><td>${badge(q.status,q.status==='待复核'?'orange':q.status==='已确认'?'red':'green')}</td><td><button class="text-link" data-action="issue-detail" data-id="${q.id}">查看并复核</button></td></tr>`).join('')}</tbody></table>${!issues.length?empty('当前没有待查看的问题记录'):''}</div>`;
  const runTable = `<div class="table-wrap"><table><thead><tr><th>执行记录</th><th>客户 / 会话</th><th>流程版本</th><th>结果</th><th>时间</th><th>操作</th></tr></thead><tbody>${runs.map(r=>`<tr><td><strong>${e(r.id)}</strong></td><td>${e(r.name)}<div class="secondary">${e(r.sessionId)}</div></td><td>v${r.version}</td><td>${badge(r.trace.some(t=>t.status==='error')?'包含异常':r.trace.some(t=>(t.type||t.node)==='human')?'转人工':'已响应',r.trace.some(t=>t.status==='error')?'orange':'blue')}</td><td>${dateTime(r.time)}</td><td><button class="text-link" data-action="run-detail" data-id="${r.id}" data-session="${r.sessionId}">执行详情</button></td></tr>`).join('')}</tbody></table>${!runs.length?empty('尚无执行记录'):''}</div>`;
  return heading('质检与日志','从问题原文和执行路径出发，确定真正需要改进的地方。',badge('规则线索 + 人工复核','blue')) +
    `<section class="card"><div class="tab-row"><button class="tab ${ui.qualityTab==='issues'?'active':''}" data-action="quality-tab" data-tab="issues">质量问题 ${state.issues.length}</button><button class="tab ${ui.qualityTab==='remediations'?'active':''}" data-action="quality-tab" data-tab="remediations">整改事项 ${state.issues.filter(q=>q.status==='已确认').length}</button><button class="tab ${ui.qualityTab==='runs'?'active':''}" data-action="quality-tab" data-tab="runs">执行日志 ${runs.length}</button></div>${ui.qualityTab==='issues'?issueTable:ui.qualityTab==='remediations'?renderRemediations():runTable}<div class="stats-footer">质量线索需经人工复核，执行记录可追溯对应会话与流程版本。</div></section>`;
}
function renderRemediations() {
  const records=state.issues.filter(q=>q.status==='已确认');
  return `<div class="table-wrap"><table><thead><tr><th>问题 / 根因</th><th>责任人</th><th>状态</th><th>关联知识</th><th>操作</th></tr></thead><tbody>${records.map(q=>`<tr><td class="wrap-cell"><strong>${e(q.type)}</strong><div class="secondary">${e(q.id)} · ${e(q.remediation?.cause||'待定位')}</div></td><td>${e(q.remediation?.owner||'待分派')}</td><td>${badge(q.remediation?.status||'待分派',q.remediation?.status==='已关闭'?'green':'orange')}</td><td>${e(q.remediation?.knowledgeId||'未关联')}</td><td>${button('整改与验收','issue-detail',`data-id="${q.id}"`,'small')}</td></tr>`).join('')}</tbody></table>${!records.length?empty('先复核知识覆盖缺口，确认后建立整改事项'):''}</div>`;
}
function issueModal(id) {
  const q=state.issues.find(q=>q.id===id);if(!q)throw new Error('问题记录不存在');
  const r=q.remediation;
  ui.modalContext={kind:'issue',id};
  modal(q.type+' · '+q.id,`<div class="note blue">原始问题：${e(q.query||q.evidence)}<br>线索证据：${e(q.evidence)}</div><button class="text-link section-space" data-action="open-session" data-id="${q.sessionId}">查看完整会话与执行轨迹 →</button><div class="divider"></div><form data-form="review-issue" data-id="${q.id}"><div class="field"><label for="issue-status">复核结论</label><select id="issue-status" name="status">${selectOptions(['待复核','已确认','已排除','信息不足'],q.status)}</select></div><div class="field"><label for="issue-review">复核说明<span class="required">*</span></label><textarea id="issue-review" name="review" required maxlength="1000">${e(q.review)}</textarea></div><div class="form-grid"><div class="field"><label for="issue-owner">整改责任人（确认时必填）</label><input id="issue-owner" name="owner" maxlength="80" value="${e(r?.owner||'')}"></div><div class="field"><label for="issue-cause">根因判断（确认时必填）</label><input id="issue-cause" name="cause" maxlength="300" value="${e(r?.cause||'')}" placeholder="例如：缺少礼品卡使用规则，不是合理拒答违规"></div></div><div class="note">线索不等于违规。知识类问题可关联 FAQ 完成整改；排班、模型与工具问题需另行核验。</div><div class="form-error" role="alert"></div><div class="form-footer"><button type="submit" class="btn primary">保存复核结果</button></div></form>${q.status==='已确认'&&r?`<div class="divider"></div><h3>整改进度 · ${e(r.status)}</h3><p class="tiny muted">验收范围：关联知识、原问题及边界用例。</p><div class="row wrap section-space">${r.status!=='已关闭'?button(r.knowledgeId?'编辑关联知识':'转为 FAQ 草稿','issue-knowledge',`data-id="${q.id}"`,'small'):''}${r.knowledgeId?badge(r.knowledgeId,'blue'):''}${r.status!=='已关闭'?button('原问题与边界回归','verify-remediation',`data-id="${q.id}"`,'small'):''}</div>${r.validation?`<details class="section-space"><summary>查看验证 ${e(r.validation.id)}</summary>${renderEvaluation(r.validation)}</details>`:''}${r.status==='待验收'?`<form data-form="close-remediation" data-id="${q.id}" class="section-space"><div class="field"><label for="acceptance-note">验收说明</label><textarea id="acceptance-note" name="acceptance" required maxlength="1000" placeholder="说明原问题、正反例与边界行为的验证结果。验收通过后关闭当前整改事项。"></textarea></div><div class="form-error" role="alert"></div><button class="btn primary" type="submit">验收并关闭整改</button></form>`:''}${r.status==='已关闭'?`<div class="note section-space">${e(r.acceptance)}<br>${e(r.acceptedBy)} · ${dateTime(r.closedAt)} · 知识整改验收</div>`:''}`:''}`);
}

const contracts = {
  order: { title:'订单查询', status:'内置服务', input:'order_id / customer_id', output:'order_id / status / product / delivery', errors:'ORDER_NOT_FOUND / TIMEOUT / FORBIDDEN', note:'查询订单与配送进度。外部订单系统尚未接入。' },
  knowledge: { title:'知识问答', status:'已启用', input:'question / conversation_context / tenant_scope', output:'answer / citations / knowledge_version', errors:'NO_MATCH / KNOWLEDGE_UNAVAILABLE', note:'根据已发布 FAQ 进行规则匹配，并校验适用范围、有效期与内容冲突。' },
  visual: { title:'模型与文档解析', status:'未接入', input:'authorized_text / document / approved_tools', output:'intent / fields / evidence / trace', errors:'UNSUPPORTED_INPUT / MODEL_TIMEOUT', note:'当前尚未配置模型、文档解析及向量检索服务。' },
  ticket: { title:'工单管理', status:'已启用', input:'session_id / service_item_id / title / category / description / request_key', output:'ticket_id / status / owner / history', errors:'VALIDATION_FAILED / CONFLICT / NOT_AUTHORIZED', note:'管理受理、分配、补充、处理结果与客户异议。外部工单及通知服务尚未接入。' }
};
function renderIntegrations() {
  return heading('接入与集成','管理接待渠道，查看业务服务与接口定义。')+`<section class="card"><div class="card-head"><h2>接待渠道</h2></div><div class="table-wrap"><table><thead><tr><th>渠道</th><th>服务范围</th><th>状态</th><th>操作</th></tr></thead><tbody><tr><td><strong>Web 在线咨询</strong></td><td>咨询、订单查询、售后与人工接待</td><td>${badge('已启用','green')}</td><td><a class="text-link" href="?view=customer#playground">打开客户页面 →</a></td></tr><tr><td>App / 小程序</td><td>移动端客户服务</td><td>${badge('未接入')}</td><td><span class="tiny muted">需接入身份与消息服务</span></td></tr><tr><td>企业微信 / 公众号</td><td>渠道消息接待</td><td>${badge('未接入')}</td><td><span class="tiny muted">需完成渠道授权与消息验签</span></td></tr></tbody></table></div></section><h2 class="section-space" style="margin-bottom:15px">业务服务</h2><div class="integration-grid">${Object.entries(contracts).map(([key,c]) => `<section class="card integration-card">${icon(key === 'knowledge' ? 'book' : key === 'ticket' ? 'ticket' : key === 'visual' ? 'layers' : 'plug')}<h3>${e(c.title)}</h3>${badge(c.status,c.status === '未接入' ? '' : 'blue')}<p>${e(c.note)}</p><button class="text-link" data-action="contract" data-id="${e(key)}">查看接口定义 →</button></section>`).join('')}</div>`;
}
function renderArchitecture() {
  return heading('系统设置','管理接待参数与工作空间数据。')+`<div class="grid-2"><div>${renderRuntime()}</div><section class="card"><div class="card-head"><h2>工作空间</h2></div><div class="card-body"><div class="definition-row"><span>名称</span><strong>青禾客服</strong></div><div class="definition-row"><span>当前坐席</span><strong>${e(state.operator)}</strong></div><div class="definition-row"><span>默认服务组</span><strong>${e(state.published.queue)}</strong></div><div class="definition-row"><span>流程版本</span><strong>v${state.published.version}</strong></div><div class="divider"></div><h3>数据管理</h3><p class="tiny muted section-space">导出会话、服务事项、工单及配置。导出文件可能包含客户信息，请妥善保管。</p>${button(persistenceBlocked ? '导出原始保存副本' : '导出工作空间','export-workspace','','section-space')}<details class="maintenance section-space"><summary>高级维护</summary><p class="tiny muted section-space">清空后无法在本页面撤销，请先导出需要保留的数据。</p>${button('清空业务记录并恢复配置','reset','','danger section-space')}</details></div></section></div>`;
}
function renderQueryCompatibility() {
  const hasTimeout = flow => flow.queryMode === 'timeout' || (flow.graph?.nodes || []).some(n => n.type === 'order' && n.config?.queryMode === 'timeout');
  if (!hasTimeout(state.draft) && !hasTimeout(state.published)) return '';
  return `<div class="note orange section-space"><strong>查询配置需要检查</strong><p>已有配置含有查询超时设置。可恢复正常查询，完成回归后重新发布；历史会话仍保留其流程版本。</p>${hasTimeout(state.draft) ? button('恢复草稿的正常查询','normalize-query-config','','small') : '<p class="tiny muted">草稿已恢复，请完成回归并发布。</p>'}</div>`;
}

function testDraftQuestion(question, response = 'success') {
  if (!['success','timeout'].includes(response)) throw new Error('请选择有效的测试响应');
  const tested = Core.clone(state.draft);
  tested.queryMode = response;
  for (const node of tested.graph?.nodes || []) if (node.type === 'order') node.config.queryMode = response;
  return {
    query: question, response,
    runtimeKey: JSON.stringify(Core.capacityState(state)),
    flowKey: Core.fingerprint(state.draft,state.knowledge),
    result: Core.simulate(question,{runtime:Core.capacityState(state),customerId:Core.orders[0]?.customerId}, {...tested,version:state.published.version+' 草稿'},state.knowledge)
  };
}

function exportWorkspace() {
  if (persistenceBlocked && originalStoredValue === null) throw new Error('浏览器未能读取原始保存值，当前无法导出原始副本。请恢复存储访问后重试。');
  const recovery = persistenceBlocked;
  const blob = new Blob([recovery ? originalStoredValue : JSON.stringify(state,null,2)], {type:recovery ? 'text/plain;charset=utf-8' : 'application/json;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = (recovery ? 'zhixu-original-storage-' : 'zhixu-workspace-') + new Date().toISOString().slice(0,10) + (recovery ? '.txt' : '.json');
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  toast(recovery ? '已发起原始保存副本导出，不包含临时操作，请检查浏览器下载记录' : '已发起数据导出，请检查浏览器下载记录');
}

function action(target) {
  const id = target.dataset.id;
  switch (target.dataset.action) {
    case 'entry': { if(!ui.play||Core.getSession(state,ui.play).status==='ended'){ui.play=Core.newSession(state).id;save();render();} Core.sendVisitor(state,ui.play,target.dataset.query);save();render();break; }
    case 'confirm-item': Core.confirmItem(state,id);save();render();toast('只确认了这一事项，其他事项不变');break;
    case 'item-help': askConfirm('这项仍未解决？','事项将回到待人工；已完成工单将增加异议待核，首次受理时间保留。','仍需帮助',()=>{Core.needHelp(state,id);save();render();toast('已登记未解决反馈');});break;
    case 'resume-item': Core.resumeItem(state,target.dataset.session,id);save();render();break;
    case 'continue-item': ui.play=Core.newSession(state,'林小夏',{itemId:id}).id;save();go('playground');break;
    case 'item-ticket': ticketModal(target.dataset.session,target.dataset.visitor==='true',id);break;
    case 'open-remediations': ui.qualityTab='remediations';go('quality');break;
    case 'evaluate-flow': {const result=Core.evaluateFlow(state);save();render();toast(result.passed?'发布回归已通过，可以发布当前草稿':'发布回归未通过，请查看具体用例');break;}
    case 'rollback-flow': askConfirm('将历史配置恢复为草稿？','不立即修改当前发布版。重新回归并发布后会生成一个新版本，保留全部历史。','恢复为草稿',()=>{Core.prepareRollback(state,Number(id));invalidateTest();save();render();});break;
    case 'evaluate-knowledge': {const r=Core.evaluateKnowledge(state,id);save();modal('FAQ 草稿回归',renderEvaluation(r)+`<div class="form-footer">${button('返回知识库','close-modal')}${r.passed?button('发布此知识','publish-knowledge',`data-id="${id}"`,'primary'):''}</div>`);break;}
    case 'issue-knowledge': {const q=state.issues.find(q=>q.id===id);assertIssue(q);knowledgeModal(q.remediation?.knowledgeId||'',q.id);break;}
    case 'verify-remediation': {const r=Core.verifyRemediation(state,id);save();issueModal(id);toast(r.passed?'原问题与边界回归已通过，请填写验收结论':'回归未通过，整改不能关闭');break;}

    case 'close-modal': closeModal(); break;
    case 'cancel-confirm': $('#confirm-dialog').close(); ui.confirm=null; break;
    case 'accept-confirm': { const run=ui.confirm; ui.confirm=null; $('#confirm-dialog').close(); run?.(); break; }
    case 'discard-input': {
      const form=target.closest('form');
      askConfirm('放弃未提交的输入？','只清除这份表单的暂存输入，已保存的配置和消息不受影响。','放弃输入',()=>{clearFormDraft(form);form.reset();showDraftStatus(form);save();}); break;
    }
    case 'new-chat':
    case 'verify-live': {
      if (target.dataset.action==='verify-live' && state.workspace.forms['robot:new']) { toast('机器人配置还有未提交输入，请先保存配置再验证。'); return; }
      ui.play=Core.newSession(state).id; save(); go('playground'); toast(CUSTOMER_VIEW ? '已开始新的咨询' : `已新建会话，使用发布版 v${state.published.version}`); break;
    }

    case 'open-visitor': ui.play=id; save(); closeModal(); go('playground'); break;
    case 'visitor-handoff': Core.sendVisitor(state,id,'我需要人工客服协助。',{forceHandoff:true}); save(); render(); break;
    case 'resume-bot': Core.resumeBot(state,id); save(); render(); break;
    case 'visitor-finish': askConfirm('结束本次咨询？','聊天与工单记录会保留，待处理事项和工单可以继续跟进。','结束咨询',()=>{Core.finish(state,id,'visitor');save();render();}); break;
    case 'visitor-solved': Core.finish(state,id,'customer'); save(); render(); toast('已记录解决反馈'); break;
    case 'open-session': document.body.classList.remove('customer-mode'); ui.returnTo=ui.modalContext?{...ui.modalContext,page:ui.page}:null; ui.session=id; ui.filters.sessionStatus=''; ui.filters.sessions=''; closeModal(); go('sessions'); break;
    case 'return-context': { const source=ui.returnTo; ui.returnTo=null; go(source.page); if(source.kind==='issue')issueModal(source.id);else ticketDetail(source.id); break; }
    case 'select-session': ui.session=id; render(); break;
    case 'takeover': Core.takeover(state,id); ui.session=id; if(ui.filters.sessionStatus)ui.filters.sessionStatus='human'; save(); render(); $('[data-form="agent-message"] textarea')?.focus(); toast(`已接管 ${id}，可以发送人工回复`); break;
    case 'agent-finish': askConfirm('结束当前服务？',`将结束会话 ${id}。请确认已完成本次沟通；关联工单继续保留。`,'结束服务',()=>{Core.finish(state,id,'agent');ui.session=id;if(ui.filters.sessionStatus)ui.filters.sessionStatus='ended';save();render();toast('会话已结束');}); break;
    case 'new-ticket': ticketModal(target.dataset.session,target.dataset.visitor==='true'); break;
    case 'ticket-detail': ticketDetail(id); break;
    case 'ticket-read': ticketDetail(id,true); break;
    case 'source': {
      const source=Core.getSession(state,id).messages[Number(target.dataset.index)]?.citation;
      if (!source) throw new Error('没有可查看的引用');
      modal(source.title,`<div class="row" style="margin-bottom:15px">${badge(source.id,'blue')}${badge('v'+source.version)}</div><div class="summary-box">${e(source.answer)}</div><p class="tiny muted section-space">来源：${e(source.source)}<br>适用范围：${e(source.scope)} · 维护人：${e(source.owner)}<br>${e(Core.citationStatus(state,source))}。历史原文不会被后续编辑改写。</p>`); break;
    }
    case 'select-node': ui.node=id; render(); break;
    case 'publish-flow': {
      Core.validateFlow(state.draft);
      if (!state.flowValidation?.passed || !Core.evaluationCurrent(state,state.flowValidation)) throw new Error('请先运行并通过当前草稿的发布回归。');
      if(!Core.flowChanged(state))return;
      askConfirm(`发布流程 v${state.published.version+1}？`,'将当前已通过发布回归的草稿用于新会话。旧会话保留流程，实时容量与知识另行读取；没有匹配的回归记录将阻止发布。','确认发布',()=>{const version=Core.publishFlow(state);save();invalidateTest();render();toast(`流程 v${version} 已发布；新会话使用此版本，已有会话保留原版本`);}); break;
    }
    case 'edit-knowledge': knowledgeModal(id); break;
    case 'publish-knowledge': {
      const k=state.knowledge.find(k=>k.id===id); if (!k) throw new Error('知识不存在');
      askConfirm('发布知识？',`“${k.draft?.title||k.title}”将参与后续问答，历史回复保持原引用。`,'确认发布',()=>{Core.publishKnowledge(state,id);invalidateTest();ui.filters.knowledgeStatus='';ui.focusKnowledge=id;save();closeModal();render();toast('知识已发布，后续问答使用最新内容');}); break;
    }
    case 'disable-knowledge': {
      const k=state.knowledge.find(k=>k.id===id); if (!k) throw new Error('知识不存在');
      askConfirm('停用这条知识？',`停用后“${k.title}”不再参与新的回答，历史引用仍保留。`,'确认停用',()=>{Core.disableKnowledge(state,id,'人工停用，后续回答排除该知识');invalidateTest();save();render();toast('知识已停用，可从已停用列表重新启用');}); break;
    }
    case 'knowledge-test': modal('知识检索试验',`<form data-form="knowledge-test"><div class="field"><label for="kb-query">输入客户问题</label><input name="question" id="kb-query" required maxlength="2000" placeholder="例如：七天无理由退货有什么条件？"></div><button class="btn primary" type="submit">检索已发布知识</button><div id="kb-result" class="section-space"></div></form>`); break;
    case 'quality-tab': ui.qualityTab=target.dataset.tab; render(); break;
    case 'issue-detail': issueModal(id); break;
    case 'mark-issue': modal('标记服务问题',`<form data-form="mark-issue" data-id="${id}"><div class="field"><label for="issue-evidence">问题说明<span class="required">*</span></label><textarea id="issue-evidence" name="evidence" required maxlength="1000" placeholder="指出哪条回复存在什么问题，便于后续复核。"></textarea></div><div class="form-error" role="alert"></div><div class="form-footer"><button class="btn primary" type="submit">登记问题</button></div></form>`); break;
    case 'run-detail': {
      const s=Core.getSession(state,target.dataset.session), run=s.runs.find(r=>r.id===id);
      if (!run) throw new Error('执行记录不存在');
      modal(id+' · 执行详情',`<div class="row">${badge('v'+run.version,'blue')}<span class="tiny muted">${dateTime(run.time)}</span></div>${renderTrace(run.trace)}<button class="text-link section-space" data-action="open-session" data-id="${s.id}">查看完整会话 →</button>`); break;
    }
    case 'contract': {
      const c=contracts[id]; if (!c) return;
      modal(c.title,`<p>${e(c.note)}</p><h3>输入字段</h3><div class="code-block section-space">${e(c.input)}</div><h3 class="section-space">输出字段</h3><div class="code-block section-space">${e(c.output)}</div><h3 class="section-space">错误类型</h3><div class="code-block section-space">${e(c.errors)}</div>`); break;
    }
    case 'export-workspace': exportWorkspace(); break;
    case 'normalize-query-config': {
      state.draft.queryMode = 'success';
      for (const node of state.draft.graph.nodes) if (node.type === 'order') delete node.config.queryMode;
      invalidateTest(); save(); render(); toast('草稿已恢复正常查询，请运行回归后发布'); break;
    }
    case 'reset': {
      if (persistenceBlocked) throw new Error('数据存储不可用，不能执行清空操作。请先导出数据并检查浏览器存储。');
      modal('清空业务记录并恢复配置？',`<p>这将清空当前工作空间的会话、服务事项、工单、知识修改、流程修改及输入草稿，并恢复内置知识和接待配置。不会重新生成历史会话。此操作无法在本页面撤销，请先导出需要保留的数据。</p><div class="form-footer">${button('取消','close-modal')}${button('确认清空并恢复','confirm-reset','','danger')}</div>`); break;
    }
    case 'confirm-reset': {
      if (persistenceBlocked) throw new Error('数据存储不可用，不能执行清空操作');
      // Persist the new workspace before discarding the current in-memory data.
      const next = Core.newState({seed:false}); next.workspace = {forms:{}};
      next.presentationCopyVersion = 1;
      localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
      document.body.classList.remove('customer-mode'); state=next;
      ui.play=null; ui.session=null; ui.flowTest=null; ui.returnTo=null;
      Object.keys(ui.filters).forEach(k=>ui.filters[k]='');
      save(); closeModal(); go('overview'); toast('业务记录已清空，接待配置已恢复'); break;
    }
  }
}

function submitForm(form, submitter) {
  const data=Object.fromEntries(new FormData(form));
  const kind=form.dataset.form;
  switch (kind) {
    case 'visitor-message': Core.sendVisitor(state,form.dataset.id,data.message); clearFormDraft(form); save(); render(); $('[data-form="visitor-message"] textarea')?.focus(); break;
    case 'agent-message': Core.sendAgent(state,form.dataset.id,data.message); clearFormDraft(form); save(); render(); $('[data-form="agent-message"] textarea')?.focus(); break;
    case 'robot': {
      const name=data.name.trim(), greeting=data.greeting.trim(), description=data.description.trim();
      if (!name || !greeting || !description) throw new Error('名称、欢迎语和服务说明不能为空');
      state.robot={name,greeting,description}; clearFormDraft(form); save(); render(); toast('配置已保存，后续新会话使用最新配置'); break;
    }
    case 'node': {
      saveNodeInput(form); break;
    }
    case 'flow-test': ui.flowTest=testDraftQuestion(data.question,data.orderResponse || 'success'); render(); break;
    case 'knowledge': {
      const payload={...data,id:form.dataset.id,issueId:form.dataset.issue,effectiveAt:new Date(data.effectiveAt).toISOString(),expiresAt:data.expiresAt?new Date(data.expiresAt).toISOString():''};
      const k=Core.saveKnowledge(state,payload);clearFormDraft(form);form.dataset.id=k.id;clearFormDraft(form);invalidateTest();ui.focusKnowledge=k.id;ui.filters.knowledge='';ui.filters.knowledgeStatus='';save();
      if(submitter?.value==='test'){
        let r;try {r=Core.evaluateKnowledge(state,k.id);}catch(err){knowledgeModal(k.id,form.dataset.issue);$('#modal .form-error').textContent='草稿已保存，但回归未完成：'+err.message;return;}
        save();closeModal();render();modal('FAQ 草稿回归',renderEvaluation(r)+`<div class="form-footer">${button('返回知识库','close-modal')}${r.passed?button('发布此知识','publish-knowledge',`data-id="${k.id}"`,'primary'):''}</div>`);
      }else {closeModal();render();toast('草稿已保存；现行发布内容保持不变');}break;
    }
    case 'knowledge-test': {
      const hit=Core.findKnowledge(data.question,state.knowledge);
      $('#kb-result').innerHTML=hit?.conflict?'<div class="note orange">多条有效知识同等匹配且答案不同，需要人工核实。</div>':hit?`<div class="note blue">命中依据：${e([hit.exact?'标准问题':'',...hit.matches].filter(Boolean).join('、'))} · ${e(hit.item.id)} v${hit.item.version}</div><div class="summary-box section-space">${e(hit.item.answer)}</div>`:`<div class="note orange">没有达到作答门槛的已发布知识：${answerRule}。可补充条目或调整关键词。</div>`; break;
    }
    case 'new-ticket': {
      const visitor=form.dataset.visitor==='true',payload={...data,sessionId:form.dataset.session,customerSubmitted:visitor,requestKey:form.dataset.requestKey};
      // 先在隔离副本校验；预览阶段绝不创建工单。
      Core.createTicket(Core.clone(state),payload);
      askConfirm('确认提交这项处理需求？',`事项：${data.itemId||'新事项'}；标题：${data.title}；订单线索：${data.objectId||'无'}；描述：${data.description}\n提交仅表示受理，不保证已通过售后审批或退款到账。`,'确认提交',()=>{const t=Core.createTicket(state,payload);clearFormDraft(form);save();closeModal();render();ticketDetail(t.id,visitor);toast(`受理成功：${t.id}，仍待人工处理`);});break;
    }
    case 'ticket-progress': {const t=Core.advanceTicket(state,form.dataset.id,data.status,data.owner,data.note,{internalNote:data.internalNote,evidence:data.evidence});clearFormDraft(form);save();render();ticketDetail(t.id);toast('工单已更新，客户只看到公开处理说明');break;}
    case 'ticket-reply': {const t=Core.addTicketReply(state,form.dataset.id,data.reply);clearFormDraft(form);save();render();ticketDetail(t.id,true);toast('补充已提交，当前工单为'+t.status);break;}
    case 'ticket-dispute': Core.disputeTicket(state,form.dataset.id,data.reason);clearFormDraft(form);save();render();ticketDetail(form.dataset.id,true);toast('事项已回到待人工，工单异议待核');break;
    case 'ticket-dispute-review': Core.reviewDispute(state,form.dataset.id,data.decision,data.reason,data.evidence);clearFormDraft(form);save();render();ticketDetail(form.dataset.id);toast('异议复核已记录，原受理时间保留');break;
    case 'runtime': Core.setRuntime(state,{humanMode:data.humanMode,capacity:Number(data.capacity),toolEnabled:data.toolEnabled==='true'},data.reason);state.operator=data.operator;clearFormDraft(form);save();render();toast('实时状态已应用；旧会话下一步也使用新状态');break;
    case 'review-issue': Core.reviewIssue(state,form.dataset.id,data);clearFormDraft(form);save();render();issueModal(form.dataset.id);toast('复核结果已保存');break;
    case 'close-remediation': Core.closeRemediation(state,form.dataset.id,data.acceptance);clearFormDraft(form);save();render();issueModal(form.dataset.id);toast('整改已验收关闭，验证记录已保留');break;
    case 'mark-issue': {
      if (!data.evidence.trim()) throw new Error('请填写问题说明');
      Core.getSession(state,form.dataset.id);
      state.issues.unshift({id:'QA'+String(++state.counter).padStart(5,'0'),sessionId:form.dataset.id,time:Core.now(),status:'待复核',review:'',type:'人工标记',query:[...Core.getSession(state,form.dataset.id).messages].reverse().find(m=>m.role==='user')?.text||data.evidence.trim(),evidence:data.evidence.trim(),suggestion:'根据原始消息复核并登记改进事项'});
      clearFormDraft(form); save(); closeModal(); render(); toast('问题已登记，可前往质检与日志复核'); break;
    }
  }
}
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-nav],[data-action]');
  if (!target || target.disabled) return;
  try { if (target.dataset.nav) { if(target.dataset.nav!=='playground')document.body.classList.remove('customer-mode'); ui.returnTo=null;closeModal();go(target.dataset.nav); } else action(target); }
  catch (err) { toast(err.message || '操作未完成，请重试'); }
});
document.addEventListener('submit',event=>{
  const form=event.target.closest('[data-form]'); if (!form) return;
  event.preventDefault();
  const error=form.querySelector('.form-error'); if (error) error.textContent='';
  try { submitForm(form,event.submitter); }
  catch(err) { if (error) error.textContent=err.message; else toast(err.message || '操作未完成'); }
});
document.addEventListener('keydown',event=>{
  if (event.target.matches('[data-chat-input]') && event.key==='Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); event.target.form.requestSubmit(); }
});
function filterInput(target) {
  const key=target.dataset.filter, start=target.selectionStart;
  ui.filters[key]=target.value; render();
  const next=document.querySelector(`input[data-filter="${key}"]`); next?.focus(); next?.setSelectionRange(start,start);
}
document.addEventListener('input',event=>{
  const target=event.target;
  if(target.matches('input[data-filter]')) { if(!event.isComposing)filterInput(target);return; }
  const form=target.closest('form[data-form]');
  if(form?.dataset.form==='node')saveNodeInput(form);else rememberForm(form);
  if(form?.dataset.form==='flow-test') {invalidateTest();$('#flow-test-result').innerHTML=empty('问题已变更，请重新运行测试。');}
  if(form?.dataset.form==='knowledge-test') $('#kb-result').textContent='';
});
document.addEventListener('compositionend',event=>{if(event.target.matches('input[data-filter]'))filterInput(event.target);});
document.addEventListener('change',event=>{
  const target=event.target;
  if(target.matches('[data-play-select]')) {ui.play=target.value||null;save();render();return;}
  if(target.matches('select[data-filter]')) {ui.filters[target.dataset.filter]=target.value;render();return;}
  const form=target.closest('form[data-form]');
  if(form?.dataset.form==='node')saveNodeInput(form);else rememberForm(form);
  if(form?.dataset.form==='flow-test') {invalidateTest();$('#flow-test-result').innerHTML=empty('测试条件已变更，请重新运行。');}
  if(target.id==='ticket-next'){form.elements.note.required=['待客户补充','已完成','已撤销','待分配'].includes(target.value);form.elements.evidence.required=target.value==='已完成';form.elements.owner.required=!['待分配','已撤销'].includes(target.value);} if(target.id==='ticket-item'&&target.value){const i=Core.getItem(state,target.value);form.elements.title.value=i.title;form.elements.objectId.value=i.objectId;form.elements.description.value=i.request;form.elements.category.value=i.type==='aftersales'?'售后服务':i.type==='order'?'订单物流':i.type==='knowledge'?'知识咨询':'其他问题';rememberForm(form);}
});
window.addEventListener('hashchange',()=>{dismissConfirmation();closeModal();render();$('#page').focus({preventScroll:true});window.scrollTo(0,0);});
window.addEventListener('popstate',()=>{dismissConfirmation();closeModal();render();});
$('#modal').addEventListener('cancel',()=>{ui.modalContext=null;});
$('#confirm-dialog').addEventListener('cancel',()=>{ui.confirm=null;});
save();
render();
