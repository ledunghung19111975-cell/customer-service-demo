/* 客服流程图：可序列化数据、编辑操作与执行前校验。 */
(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const types = {
    start: { name: '开始', icon: 'play', outputs: [['next', '下一步']] },
    router: { name: '事项分流', icon: 'flow', outputs: [['knowledge', '知识咨询'], ['order', '订单查询'], ['aftersales', '售后申请'], ['human', '主动找人工']] },
    condition: { name: '条件判断', icon: 'flow', outputs: [['yes', '满足条件'], ['no', '不满足']] },
    knowledge: { name: '知识检索', icon: 'book', outputs: [['found', '找到依据'], ['miss', '未命中 / 冲突']] },
    order: { name: '订单查询', icon: 'plug', outputs: [['success', '查询成功'], ['failure', '失败 / 无权限'], ['missing', '需补充订单']] },
    intake: { name: '售后受理', icon: 'ticket', outputs: [['ready', '待客户确认'], ['manual', '需人工办理'], ['missing', '需补充订单']] },
    reply: { name: '回复消息', icon: 'chat', outputs: [['next', '下一步']] },
    human: { name: '转人工', icon: 'user', outputs: [['next', '下一步']] },
    end: { name: '本轮结束', icon: 'check', outputs: [] }
  };
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const nodeHeight = node => Math.max(88, 50 + types[node.type].outputs.length * 25);
  function createNode(type, id, x, y) {
    assert(Object.hasOwn(types, type), '不支持的节点类型');
    const config = type === 'condition' ? { field: 'query', operator: 'contains', value: '加急' }
      : type === 'reply' ? { mode: 'text', text: '已收到你的问题，请补充更详细的信息。' } : {};
    return { id, type, label: types[type].name, x, y, config };
  }
  function template() {
    const nodes = [
      ['start', 'start', 45, 325], ['router', 'router', 300, 275],
      ['knowledge', 'knowledge', 585, 45], ['order', 'order', 585, 260],
      ['intake', 'intake', 585, 505], ['reply', 'reply', 920, 145],
      ['human', 'human', 920, 470], ['end', 'end', 1230, 325]
    ].map(([id, type, x, y]) => createNode(type, id, x, y));
    nodes.find(n => n.id === 'reply').config = { mode: 'result' };
    const connections = [
      ['start', 'next', 'router'], ['router', 'knowledge', 'knowledge'], ['router', 'order', 'order'],
      ['router', 'aftersales', 'intake'], ['router', 'human', 'human'],
      ['knowledge', 'found', 'reply'], ['knowledge', 'miss', 'human'],
      ['order', 'success', 'reply'], ['order', 'failure', 'human'], ['order', 'missing', 'reply'],
      ['intake', 'ready', 'reply'], ['intake', 'manual', 'human'], ['intake', 'missing', 'reply'],
      ['reply', 'next', 'end'], ['human', 'next', 'end']
    ];
    return { nodes, edges: connections.map(([source, port, target]) => ({ id: `edge_${source}_${port}`, source, port, target })) };
  }
  function graphFor(flow) { return flow.graph || template(); }
  function semantic(graph) {
    return {
      nodes: graph.nodes.map(({ id, type, label, config }) => ({ id, type, label, config })).sort((a, b) => a.id.localeCompare(b.id)),
      edges: graph.edges.map(({ source, port, target }) => ({ source, port, target })).sort((a, b) => (a.source + a.port).localeCompare(b.source + b.port))
    };
  }
  function addNode(graph, type, position = {}) {
    assert(graph.nodes.length < 40, '演示画布最多支持 40 个节点');
    let n = 1;
    while (graph.nodes.some(node => node.id === `${type}_${n}`)) n++;
    const node = createNode(type, `${type}_${n}`, Math.max(0, Math.min(2300, position.x ?? 120)), Math.max(0, Math.min(1700, position.y ?? 160)));
    graph.nodes.push(node); return node;
  }
  function removeNode(graph, id) {
    graph.nodes = graph.nodes.filter(node => node.id !== id);
    graph.edges = graph.edges.filter(edge => edge.source !== id && edge.target !== id);
  }
  function connect(graph, source, port, target) {
    const from = graph.nodes.find(n => n.id === source), to = graph.nodes.find(n => n.id === target);
    assert(from && to, '连线端点不存在');
    assert(from.id !== to.id, '不能连接到节点自身');
    assert(to.type !== 'start', '开始节点不能接收连线');
    assert(types[from.type].outputs.some(([id]) => id === port), '此节点没有这个输出端口');
    const edges = graph.edges.filter(edge => !(edge.source === source && edge.port === port));
    const seen = new Set();
    const reaches = id => {
      if (id === source) return true;
      if (seen.has(id)) return false;
      seen.add(id); return edges.filter(edge => edge.source === id).some(edge => reaches(edge.target));
    };
    assert(!reaches(target), '这条连线会产生循环；当前原型只支持无循环流程');
    const edge = { id: `edge_${source}_${port}`, source, port, target };
    graph.edges = [...edges, edge]; return edge;
  }
  function check(graph) {
    const errors = [];
    const add = (message, nodeId = '', edgeId = '') => errors.push({ message, nodeId, edgeId });
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return [{ message: '流程数据缺少节点或连线', nodeId: '', edgeId: '' }];
    if (graph.nodes.length > 40) add('演示画布最多支持 40 个节点');
    const nodes = new Map(), ids = new Set(), ports = new Set();
    for (const node of graph.nodes) {
      if (!node || typeof node.id !== 'string' || !/^[a-z][a-z0-9_-]{0,60}$/i.test(node.id) || !Object.hasOwn(types, node.type)) { add('存在无效节点或不支持的节点类型'); continue; }
      if (nodes.has(node.id)) add('节点标识重复', node.id);
      nodes.set(node.id, node);
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) add('节点位置无效', node.id);
      if (typeof node.label !== 'string' || !node.label.trim() || node.label.length > 60) add('节点名称必填，最多 60 字', node.id);
      const c = node.config;
      if (!c || typeof c !== 'object' || Array.isArray(c)) { add('节点配置无效', node.id); continue; }
      const text = (key, max, required = false) => { if ((required || c[key] !== undefined) && (typeof c[key] !== 'string' || (required && !c[key].trim()) || c[key].length > max)) add(`${node.label}：${key} 内容无效或超过 ${max} 字`, node.id); };
      if (node.type === 'condition') {
        if (!['query', 'serviceType', 'orderId', 'orderStatus'].includes(c.field)) add('请选择有效的条件字段', node.id);
        if (!['contains', 'equals', 'exists', 'notContains'].includes(c.operator)) add('请选择有效的判断方式', node.id);
        text('value', 200, c.operator !== 'exists');
      }
      if (node.type === 'reply') {
        if (!['result', 'text'].includes(c.mode)) add('请选择回复方式', node.id);
        text('text', 1000, c.mode === 'text'); text('prefix', 150);
      }
      if (node.type === 'order' && c.queryMode !== undefined && !['success', 'timeout'].includes(c.queryMode)) add('查询结果模式无效', node.id);
      if (node.type === 'intake' && c.enabled !== undefined && typeof c.enabled !== 'boolean') add('售后受理开关无效', node.id);
      if (node.type === 'human') text('queue', 30, c.queue !== undefined);
      if (node.type === 'knowledge') text('knowledgeId', 60);
    }
    const starts = graph.nodes.filter(n => n?.type === 'start');
    if (starts.length !== 1) add('流程必须且只能有一个开始节点');
    if (!graph.nodes.some(n => n?.type === 'end')) add('流程至少需要一个结束节点');
    for (const edge of graph.edges) {
      if (!edge || typeof edge.id !== 'string' || ids.has(edge.id)) { add('连线标识无效或重复'); continue; }
      ids.add(edge.id);
      const from = nodes.get(edge.source), to = nodes.get(edge.target);
      if (!from || !to) { add('连线指向已不存在的节点', '', edge.id); continue; }
      if (!types[from.type].outputs.some(([id]) => id === edge.port)) add('连线输出端口无效', from.id, edge.id);
      if (to.type === 'start') add('开始节点不能接收连线', to.id, edge.id);
      const key = `${edge.source}:${edge.port}`;
      if (ports.has(key)) add('每个输出端口只能连接一个目标', from.id, edge.id);
      ports.add(key);
    }
    for (const node of nodes.values()) for (const [port, label] of types[node.type].outputs) {
      if (!ports.has(`${node.id}:${port}`)) add(`“${node.label}”的“${label}”尚未连接`, node.id);
    }
    const visiting = new Set(), visited = new Set();
    const visit = id => {
      if (visiting.has(id)) { add('存在循环连线，不能运行', id); return; }
      if (visited.has(id) || !nodes.has(id)) return;
      visiting.add(id);
      graph.edges.filter(e => e?.source === id).forEach(e => visit(e.target));
      visiting.delete(id); visited.add(id);
    };
    if (starts.length === 1) {
      visit(starts[0].id);
      for (const node of nodes.values()) if (!visited.has(node.id)) add(`“${node.label}”无法从开始节点到达`, node.id);
    }
    for (const node of nodes.values()) visit(node.id);
    return errors;
  }
  const api = { types, clone, nodeHeight, template, graphFor, semantic, addNode, removeNode, connect, check };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CustomerFlow = api;
})(typeof window !== 'undefined' ? window : this);
