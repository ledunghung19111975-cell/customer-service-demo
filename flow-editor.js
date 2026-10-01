/* 独立画布视图；业务执行与发布门槛由 engine.js 处理。 */
(function (root) {
  'use strict';
  const G = root.CustomerFlow;
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const icon = type => `<svg class="icon" aria-hidden="true"><use href="#i-${G.types[type].icon}"/></svg>`;
  const options = (items, value) => items.map(([id, label]) => `<option value="${e(id)}" ${String(value) === id ? 'selected' : ''}>${e(label)}</option>`).join('');
  const field = (name, label, content) => `<div class="field"><label for="gn-${name}">${label}</label>${content}</div>`;
  const select = (name, label, items, value) => field(name, label, `<select id="gn-${name}" name="${name}">${options(items, value)}</select>`);
  const input = (name, label, value, max = 60) => field(name, label, `<input id="gn-${name}" name="${name}" value="${e(value)}" maxlength="${max}">`);
  const area = (name, label, value, max = 1000) => field(name, label, `<textarea id="gn-${name}" name="${name}" maxlength="${max}" rows="3">${e(value)}</textarea>`);
  function nodeForm(state, id) {
    const node = state.draft.graph.nodes.find(n => n.id === id);
    if (!node) return '<div class="graph-empty">从节点库添加节点，或点击画布中的节点查看配置。</div>';
    const c = node.config;
    let html = input('label', '节点名称', node.label);
    switch (node.type) {
      case 'start': html += '<p class="help">接收本轮消息与服务事项。多事项输入会分别沿同一张图执行。</p>'; break;
      case 'router': html += '<p class="help">按识别出的事项选择输出端口。路由关键词在下方通用接待设置中维护；每条分支的去向由连线决定。</p>'; break;
      case 'condition':
        html += select('field', '判断字段', [['query','客户问题'],['serviceType','事项类型'],['orderId','订单号'],['orderStatus','上游订单状态']], c.field);
        html += select('operator', '判断方式', [['contains','包含'],['equals','等于'],['notContains','不包含'],['exists','不为空']], c.operator);
        html += input('value', '比较值', c.value, 200) + '<p class="help">事项类型：knowledge / order / aftersales / other。订单状态需先经过订单查询；“不为空”无需比较值。</p>'; break;
      case 'knowledge': {
        const choices = [['','全部已发布知识'], ...state.knowledge.filter(k => k.status === 'published').map(k => [k.id, `${k.id} · ${k.title}`])];
        if (c.knowledgeId && !choices.some(([id]) => id === c.knowledgeId)) choices.push([c.knowledgeId, `${c.knowledgeId} · 当前不可用（保留范围）`]);
        html += select('knowledgeId', '检索范围', choices, c.knowledgeId || '');
        html += `<p class="help">至少命中 ${root.CustomerDemo.minKeywordHits} 个关键词，或问题包含标准问题。继续检查状态、时效与冲突；未命中走对应分支。</p>`; break;
      }
      case 'order': html += '<p class="help">查询订单与配送进度，失败时沿异常分支处理。故障响应可在下方草稿测试中验证，不写入发布配置。</p>'; break;
      case 'intake': html += select('enabled', '自助受理', [['inherit','沿用通用设置'],['true','允许预览申请'],['false','转人工办理']], c.enabled === undefined ? 'inherit' : String(c.enabled)) + '<p class="help">通用设置关闭时，本节点不能开启受理。必须经过回复节点显示预览，再由客户确认提交。</p>'; break;
      case 'reply':
        html += select('mode', '回复方式', [['result','输出上游结果'],['text','自定义文本']], c.mode);
        html += c.mode === 'text' ? area('text', '回复内容', c.text) : input('prefix', '结果引导语（留空则无引导语）', c.prefix ?? state.draft.prefix, 150);
        html += '<p class="help">自定义文本不生成知识引用或处理成功证据。上游结果只在此节点实际输出时交给客户。</p>'; break;
      case 'human': html += input('queue', '人工服务组', c.queue ?? state.draft.queue, 30) + '<p class="help">读取实时在线与容量状态。同一轮多个事项转人工时，首次命中的人工节点确定会话服务组。</p>'; break;
      case 'end': html += '<p class="help">结束本轮执行，未完成事项继续保留；结束之前应经过回复或人工节点。</p>'; break;
    }
    return `<form data-form="node" data-node-id="${e(node.id)}">${html}<p class="tiny muted">此节点的配置自动保存到草稿。</p></form>`;
  }
  function globalForm(state) {
    const d = state.draft;
    return `<details class="graph-settings"><summary>通用接待设置</summary><form data-form="node">${area('orderWords','订单触发词',d.orderWords,200)}${area('humanWords','人工触发词',d.humanWords,200)}${select('intakeEnabled','允许自助售后',[['true','允许'],['false','仅人工受理']],String(d.intakeEnabled))}${input('queue','默认人工服务组',d.queue,30)}${area('prefix','默认回答引导语',d.prefix,150)}</form></details>`.replace(/(for|id)="gn-/g, '$1="gf-');
  }
  function anchors(graph, edge) {
    const a = graph.nodes.find(n => n.id === edge.source), b = graph.nodes.find(n => n.id === edge.target);
    if (!a || !b) return null;
    const index = G.types[a.type].outputs.findIndex(p => p[0] === edge.port);
    return { x1: a.x + 190, y1: a.y + 54 + index * 25, x2: b.x, y2: b.y + 25 };
  }
  function path(a) {
    const bend = Math.max(65, Math.abs(a.x2 - a.x1) * .45);
    return `M${a.x1},${a.y1} C${a.x1 + bend},${a.y1} ${a.x2 - bend},${a.y2} ${a.x2},${a.y2}`;
  }
  function edgesHTML(graph, selected, trace, activeIndex) {
    const used = new Set(trace.map(t => t.edgeId));
    return graph.edges.map(edge => {
      const a = anchors(graph, edge); if (!a) return '';
      const from = graph.nodes.find(n => n.id === edge.source), to = graph.nodes.find(n => n.id === edge.target);
      const label = G.types[from.type].outputs.find(p => p[0] === edge.port)?.[1] || edge.port;
      const active = trace[activeIndex]?.edgeId === edge.id;
      return `<g class="graph-edge ${used.has(edge.id) ? 'executed' : ''} ${edge.id === selected ? 'selected' : ''} ${active ? 'trace-active' : ''}"><path class="edge-line" d="${path(a)}" marker-end="url(#graph-arrow)"/><path class="edge-hit" d="${path(a)}" data-edge="${e(edge.id)}" tabindex="0" role="button" aria-label="连线：${e(from.label)} · ${e(label)} → ${e(to.label)}"/></g>`;
    }).join('');
  }
  function diagnostics(graph, showErrors) {
    const errors = G.check(graph);
    return errors.length ? `<details class="graph-diagnostics" ${showErrors ? 'open' : ''}><summary>${errors.length} 项待完善 · 点击定位</summary>${errors.map(err => `<button type="button" data-flow-action="locate" data-node="${e(err.nodeId)}">${e(err.message)}</button>`).join('')}</details>` : '<div class="graph-valid">✓ 结构完整 · 所有分支已连接 · 无循环</div>';
  }
  function render(state, ui) {
    const graph = state.draft.graph, trace = ui.flowTest?.result.trace || [], view = state.workspace.graphView || {};
    const executed = new Set(trace.map(t => t.node)), selected = graph.nodes.find(n => n.id === ui.node);
    const active = trace[view.traceIndex], edge = graph.edges.find(e => e.id === view.edge);

    return `<section class="graph-editor" aria-label="流程画布编辑器">
      <div class="graph-top"><div><strong>客服接待流程</strong><span class="badge blue">已发布 v${state.published.version}</span></div><span class="tiny muted">草稿自动保存 · 布局修改不改变执行逻辑</span></div>
      <div class="graph-workspace">
        <aside class="graph-palette"><h2>节点库</h2><p>点击添加或拖入画布</p>${Object.entries(G.types).map(([type, info]) => `<button type="button" class="palette-node" draggable="true" data-node-type="${type}" aria-label="添加${info.name}节点">${icon(type)}<span>${info.name}</span><span class="palette-add">+</span></button>`).join('')}<div class="graph-palette-note">先连输出端口，再连目标输入端口。<br>条件节点的两条分支都需要连接。</div></aside>
        <div class="graph-center"><div class="graph-tools"><button type="button" data-flow-action="fit">适应画布</button><button type="button" data-flow-action="zoom-out" aria-label="缩小画布">−</button><output id="graph-zoom">${Math.round((view.zoom || .6) * 100)}%</output><button type="button" data-flow-action="zoom-in" aria-label="放大画布">+</button><span class="spacer"></span><button type="button" data-flow-action="delete" ${!selected && !edge ? 'disabled' : ''}>删除所选</button><button type="button" data-flow-action="check">校验流程</button></div>
          <div class="graph-viewport" tabindex="0" aria-label="流程画布，拖动空白处平移"><div class="graph-world">
            <svg class="graph-connections" width="2600" height="1950" aria-label="可编辑流程连线"><defs><marker id="graph-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" fill="context-stroke"/></marker></defs><g class="graph-edge-layer">${edgesHTML(graph, view.edge, trace, view.traceIndex)}</g><path class="graph-wire" fill="none"/></svg>
            ${graph.nodes.map(node => `<article class="graph-node type-${node.type} ${ui.node === node.id ? 'selected' : ''} ${executed.has(node.id) ? 'executed' : ''} ${active?.node === node.id ? 'trace-active' : ''}" style="left:${node.x}px;top:${node.y}px;height:${G.nodeHeight(node)}px" data-graph-node="${e(node.id)}" tabindex="0" role="button" aria-label="节点：${e(node.label)}（${G.types[node.type].name}）">
              ${node.type !== 'start' ? `<button class="graph-port input-port" type="button" data-input="${e(node.id)}" aria-label="${e(node.label)}的输入端口"></button>` : ''}
              <div class="graph-node-head">${icon(node.type)}<strong>${e(node.label)}</strong>${executed.has(node.id) ? '<span class="graph-node-check">✓</span>' : ''}</div>
              ${G.types[node.type].outputs.map(([port, label], i) => `<div class="graph-output" style="top:${44 + i * 25}px"><span>${e(label)}</span><button class="graph-port output-port" type="button" data-output="${e(node.id)}" data-port="${port}" aria-label="${e(node.label)}的${e(label)}输出端口"></button></div>`).join('')}
              ${node.type === 'end' ? '<span class="graph-end-label">等待下一条消息</span>' : ''}</article>`).join('')}
          </div><div class="graph-canvas-hint" id="graph-hint">拖节点调整位置 · 拖空白处平移 · 拉线或点两个端口连接</div></div>
          <div id="graph-validation">${diagnostics(graph, view.showErrors)}</div>
        </div>
        <aside class="graph-inspector"><div class="graph-inspector-title"><h2>${edge ? '连线配置' : selected ? G.types[selected.type].name : '节点配置'}</h2>${selected ? `<span class="tiny muted">${e(selected.id)}</span>` : ''}</div>
          ${edge ? `<p>从 <strong>${e(graph.nodes.find(n => n.id === edge.source)?.label)}</strong> 的“${e(G.types[graph.nodes.find(n => n.id === edge.source).type].outputs.find(p => p[0] === edge.port)?.[1])}”连接到 <strong>${e(graph.nodes.find(n => n.id === edge.target)?.label)}</strong>。</p><p class="help">从同一输出端口连接到新目标会替换这条线。</p><button type="button" class="btn danger" data-flow-action="delete">删除这条连线</button>` : nodeForm(state, ui.node)}
          ${globalForm(state)}
        </aside>
      </div>
      ${trace.length ? `<div class="graph-debug"><div class="graph-debug-head"><strong>实际执行路径</strong><span class="tiny muted">点击步骤查看该节点的输入与输出</span></div><div class="graph-steps">${trace.map((t, i) => `<button type="button" class="${view.traceIndex === i ? 'active' : ''}" data-flow-action="trace" data-index="${i}"><span>${i + 1}</span>${e(t.label)}${t.port ? ' · ' + e(G.types[t.type]?.outputs.find(p => p[0] === t.port)?.[1] || t.port) : ''}</button>`).join('')}</div>${active ? `<div class="graph-step-detail"><div><strong>输入</strong><pre>${e(JSON.stringify(active.input, null, 2))}</pre></div><div><strong>输出 · ${e(active.status)}</strong><p>${e(active.output)}</p></div></div>` : ''}</div>` : ''}
    </section>`;
  }
  function mount(rootEl, { state, ui, onChange, onSelect, onView, onError }) {
    if (!rootEl) return;
    const viewport = rootEl.querySelector('.graph-viewport');
    if (!viewport) return;
    const graph = state.draft.graph, world = rootEl.querySelector('.graph-world');
    const view = state.workspace.graphView ||= { x: 0, y: 0, zoom: .6, initialized: false, traceIndex: -1 };
    let gesture = null, wire = null, wirePoint = null, suppressClick = false;
    const local = event => { const r = viewport.getBoundingClientRect(); return { x: (event.clientX - r.left - view.x) / view.zoom, y: (event.clientY - r.top - view.y) / view.zoom }; };
    const transform = () => { world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.zoom})`; rootEl.querySelector('#graph-zoom').textContent = `${Math.round(view.zoom * 100)}%`; };
    const fit = () => {
      const right = Math.max(500, ...graph.nodes.map(n => n.x + 210)), bottom = Math.max(350, ...graph.nodes.map(n => n.y + G.nodeHeight(n) + 20));
      view.zoom = Math.max(.25, Math.min(1, (viewport.clientWidth - 36) / right, (viewport.clientHeight - 45) / bottom));
      view.x = (viewport.clientWidth - right * view.zoom) / 2; view.y = 20; view.initialized = true; transform(); onView();
    };
    const paint = () => {
      rootEl.querySelector('.graph-edge-layer').innerHTML = edgesHTML(graph, view.edge, ui.flowTest?.result.trace || [], view.traceIndex);
      const preview = rootEl.querySelector('.graph-wire');
      if (wire && wirePoint) {
        const node = graph.nodes.find(n => n.id === wire.source), index = G.types[node.type].outputs.findIndex(p => p[0] === wire.port);
        preview.setAttribute('d', path({ x1: node.x + 190, y1: node.y + 54 + index * 25, x2: wirePoint.x, y2: wirePoint.y }));
      } else preview.setAttribute('d', '');
      rootEl.querySelector('#graph-hint').textContent = wire ? '正在连线：点击目标节点左侧输入端口 · Esc 取消' : '拖节点调整位置 · 拖空白处平移 · 拉线或点两个端口连接';
      viewport.classList.toggle('connecting', Boolean(wire));
    };
    const finishWire = target => {
      if (!wire) return;
      try { G.connect(graph, wire.source, wire.port, target); wire = null; onChange(); }
      catch (err) { wire = null; paint(); onError(err.message); }
    };
    const zoom = factor => {
      const cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2, z = Math.max(.25, Math.min(1.6, view.zoom * factor));
      view.x = cx - (cx - view.x) * z / view.zoom; view.y = cy - (cy - view.y) * z / view.zoom; view.zoom = z; transform(); onView();
    };
    const remove = () => {
      if (view.edge) graph.edges = graph.edges.filter(e => e.id !== view.edge);
      else if (ui.node) G.removeNode(graph, ui.node);
      else return;
      ui.node = ''; view.edge = ''; onChange();
    };
    const add = (type, point) => {
      try {
        const node = G.addNode(graph, type, point || { x: (viewport.clientWidth / 2 - view.x) / view.zoom - 95, y: (viewport.clientHeight / 2 - view.y) / view.zoom - 45 });
        ui.node = node.id; view.edge = ''; onChange();
      } catch (err) { onError(err.message); }
    };
    rootEl.addEventListener('dragstart', event => { const button = event.target.closest('[data-node-type]'); if (button) { event.dataTransfer.setData('text/plain', button.dataset.nodeType); event.dataTransfer.effectAllowed = 'copy'; } });
    viewport.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
    viewport.addEventListener('drop', event => { event.preventDefault(); const type = event.dataTransfer.getData('text/plain'); if (Object.hasOwn(G.types, type)) add(type, local(event)); });
    viewport.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const output = event.target.closest('[data-output]'), input = event.target.closest('[data-input]');
      if (input) return;
      const nodeEl = event.target.closest('[data-graph-node]');
      if (!output && event.target.closest('[data-edge]')) return;
      event.preventDefault(); viewport.focus({ preventScroll: true });
      if (output) { wire = { source: output.dataset.output, port: output.dataset.port }; wirePoint = local(event); gesture = { kind: 'wire', startX: event.clientX, startY: event.clientY, moved: false }; paint(); }
      else if (nodeEl) { const node = graph.nodes.find(n => n.id === nodeEl.dataset.graphNode); gesture = { kind: 'node', node, element: nodeEl, x: node.x, y: node.y, startX: event.clientX, startY: event.clientY, moved: false }; }
      else { wire = null; paint(); gesture = { kind: 'pan', x: view.x, y: view.y, startX: event.clientX, startY: event.clientY, moved: false }; }
      viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener('pointermove', event => {
      if (wire) { wirePoint = local(event); paint(); }
      if (!gesture) return;
      const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) gesture.moved = true;
      if (gesture.kind === 'node' && gesture.moved) {
        gesture.node.x = Math.round(Math.max(0, Math.min(2300, gesture.x + dx / view.zoom)));
        gesture.node.y = Math.round(Math.max(0, Math.min(1700, gesture.y + dy / view.zoom)));
        gesture.element.style.left = gesture.node.x + 'px'; gesture.element.style.top = gesture.node.y + 'px'; paint();
      } else if (gesture.kind === 'pan' && gesture.moved) { view.x = gesture.x + dx; view.y = gesture.y + dy; transform(); }
    });
    const endGesture = event => {
      if (!gesture) return;
      const ended = gesture; gesture = null;
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      if (ended.kind === 'wire' && ended.moved) {
        suppressClick = true;
        const target = rootEl.ownerDocument.elementFromPoint(event.clientX, event.clientY)?.closest('[data-input]');
        if (target) finishWire(target.dataset.input); else { wire = null; paint(); }
      } else if (ended.kind === 'node') {
        if (ended.moved) { suppressClick = true; ui.node = ended.node.id; view.edge = ''; onChange({ layoutOnly: true }); }
        else { suppressClick = true; onSelect(ended.node.id, ''); }
      } else if (ended.kind === 'pan') { if (ended.moved) { suppressClick = true; onView(); } else onSelect('', ''); }
    };
    viewport.addEventListener('pointerup', endGesture);
    viewport.addEventListener('pointercancel', event => { if (gesture?.kind === 'node' && gesture.moved) onChange({ layoutOnly: true }); gesture = null; wire = null; paint(); if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId); });
    rootEl.addEventListener('click', event => {
      if (suppressClick) { suppressClick = false; return; }
      const target = event.target.closest('[data-flow-action],[data-node-type],[data-input],[data-output],[data-edge],[data-graph-node]');
      if (!target || target.disabled) return;
      if (target.dataset.nodeType) return add(target.dataset.nodeType);
      if (target.dataset.input) return finishWire(target.dataset.input);
      if (target.dataset.output) {
        wire = { source: target.dataset.output, port: target.dataset.port };
        const node = graph.nodes.find(n => n.id === wire.source); wirePoint = { x: node.x + 245, y: node.y + 54 }; paint(); return;
      }
      if (target.dataset.edge) { wire = null; return onSelect('', target.dataset.edge); }
      if (target.dataset.graphNode) return onSelect(target.dataset.graphNode, '');
      switch (target.dataset.flowAction) {
        case 'fit': fit(); break;
        case 'zoom-in': zoom(1.2); break;
        case 'zoom-out': zoom(1 / 1.2); break;
        case 'delete': remove(); break;
        case 'check': view.showErrors = true; onSelect(ui.node, view.edge); break;
        case 'locate': {
          const node = graph.nodes.find(n => n.id === target.dataset.node);
          if (node) { view.x = viewport.clientWidth / 2 - (node.x + 95) * view.zoom; view.y = viewport.clientHeight / 2 - (node.y + 50) * view.zoom; }
          onSelect(node?.id || '', ''); break;
        }
        case 'trace': view.traceIndex = Number(target.dataset.index); onSelect(ui.flowTest.result.trace[view.traceIndex].node, ''); break;
      }
    });
    rootEl.addEventListener('keydown', event => {
      if (event.target.closest('input,textarea,select')) return;
      if (event.key === 'Escape') { wire = null; paint(); }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(); }
      if (event.key === 'Enter' && event.target.matches('[data-graph-node],[data-edge]')) { event.preventDefault(); onSelect(event.target.dataset.graphNode || '', event.target.dataset.edge || ''); }
    });
    if (!view.initialized) { view.zoom = .8; view.x = 18; view.y = 18; view.initialized = true; onView(); }
    transform();
  }
  root.CustomerFlowEditor = { render, mount, nodeForm, globalForm, diagnostics };
})(window);
