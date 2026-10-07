// 产出 Agent：Codex；消息身份、完整会话与旧记录显示回归。
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=process.env.V2_TEST_ROOT||path.resolve(__dirname,'..');
const M=require(path.join(root,'src/v2/model.js')),S=require(path.join(root,'src/v2/service.js'));
const NOW=Date.parse('2026-10-07T10:00:00Z');
function fixture(){
  let state=M.createState(NOW),at=NOW;
  const f={get state(){return state;},get conv(){return state.conversations[0];},
    run(command,data,role='customer',id=role==='customer'?'C001':'lin'){
      const r=S.execute(state,{id,role},command,data,++at);state=r.state;return r.value;
    },say(body){return f.run('say',{conversationId:'CONV001',body});},
    claim(){const id=f.run('requestHuman',{conversationId:'CONV001'});f.run('claim',{caseId:id},'agent');return id;}};
  return f;
}
function view(state){
  const nodes=new Map();
  const document={querySelector(selector){if(selector==='.messages')return null;if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',addEventListener(){},close(){},showModal(){}});return nodes.get(selector);},addEventListener(){}};
  const window={SupportV2Model:M,SupportV2Service:S,addEventListener(){}};
  const source=fs.readFileSync(path.join(root,'src/v2/app.js'),'utf8').replace(/\}\)\(\);\s*$/,'window.testView={chat:()=>{ui.view="customer";return chatView();},desk:c=>{ui.view="desk";return deskDetail(c);},history};})();');
  vm.runInNewContext(source,{window,document,navigator:{},localStorage:{getItem:()=>JSON.stringify(state)},setTimeout:()=>0,clearTimeout(){},Date});
  return window.testView;
}
const ids=html=>[...html.matchAll(/data-message-id="([^"]+)"/g)].map(m=>m[1]);

test('人工回复保存发送者身份，后续转派不会改写旧消息作者',()=>{
  const f=fixture(),caseId=f.claim();f.run('reply',{caseId,body:'您好，我来核实。'},'agent');
  const msg=f.conv.messages.at(-1);assert.equal(msg.role,'agent');assert.equal(msg.senderId,'lin');assert.equal(msg.senderName,'客服 01');
  const h=f.run('handoff',{caseId,targetId:'zhou',reason:'接续处理'},'agent');f.run('acceptHandoff',{handoffId:h},'agent','zhou');
  f.run('reply',{caseId,body:'由我继续跟进。'},'agent','zhou');
  assert.equal(f.conv.messages.find(m=>m.id===msg.id).senderName,'客服 01');assert.equal(f.conv.messages.at(-1).senderName,'客服 02');
});
test('人工回复可通知客户，业务进度继续保留系统身份',()=>{
  const f=fixture(),caseId=f.claim();f.run('reply',{caseId,body:'您好'},'agent');
  assert.equal(f.state.notifications.at(-1).body,'您好');assert.equal(f.state.cases[0].history.at(-1).kind,'reply');
  f.run('handoff',{caseId,targetId:'zhou',reason:'交班'},'agent');assert.equal(f.conv.messages.at(-1).role,'system');assert.equal(f.conv.messages.at(-1).kind,'progress');
});
test('两端完整展示同一会话的所有消息，不遗漏其他事项回复或最早消息',()=>{
  const f=fixture();f.say('杯子怎么清洗，EC-ITEM-002 还没到');const caseId=f.claim();
  for(let i=0;i<8;i++){f.say('客户补充 '+i);f.run('reply',{caseId,body:'客服答复 '+i},'agent');}
  const v=view(f.state),expected=f.conv.messages.map(m=>m.id);
  assert(expected.length>12);assert.deepEqual(ids(v.chat()),expected);assert.deepEqual(ids(v.desk(f.state.cases[0])),expected);
});
test('按发送时间排序，同一时间保留原始先后，读取不改变保存内容',()=>{
  const f=fixture(),caseId=f.claim();f.say('先问');f.run('reply',{caseId,body:'后答'},'agent');
  const a=f.conv.messages.at(-2),b=f.conv.messages.at(-1);b.at=a.at;
  f.conv.messages.unshift(f.conv.messages.pop()); // deliberately disordered imported record
  const before=JSON.stringify(f.state),expected=f.conv.messages.slice().sort((a,b)=>a.at-b.at).map(m=>m.id),v=view(f.state);
  assert.deepEqual(ids(v.chat()),expected);assert.deepEqual(ids(v.desk(f.state.cases[0])),expected);assert.equal(JSON.stringify(f.state),before);
});
test('有首条人工回复时间证据的旧系统消息显示为人工，保存记录不被迁移',()=>{
  const f=fixture(),caseId=f.claim();f.run('reply',{caseId,body:'旧回复您好'},'agent');const m=f.conv.messages.at(-1);
  m.role='system';delete m.kind;delete m.senderId;delete m.senderName;delete f.state.cases[0].history.at(-1).kind;
  const before=JSON.stringify(f.state),v=view(f.state);
  assert.match(v.chat(),new RegExp('class="message agent" data-message-id="'+m.id+'"'));assert.match(v.desk(f.state.cases[0]),/人工客服/);
  assert.doesNotMatch(v.history(f.state.cases[0],f.conv),/旧回复您好/);assert.equal(JSON.stringify(f.state),before);
});
test('缺乏证据或时间冲突的旧系统消息不被猜成某个客服',()=>{
  const f=fixture(),caseId=f.claim();f.run('reply',{caseId,body:'旧回复'},'agent');const m=f.conv.messages.at(-1);
  m.role='system';delete m.kind;delete m.senderId;delete m.senderName;
  f.conv.messages.push({...m,id:'MSG-CONFLICT',body:'同毫秒进度'});
  const v=view(f.state);assert.match(v.chat(),new RegExp('class="message system" data-message-id="'+m.id+'"'));
});
test('聊天回复不重复出现在业务事件，实际办理事件仍可查看',()=>{
  const f=fixture(),caseId=f.claim();f.run('reply',{caseId,body:'只出现在聊天'},'agent');f.run('handoff',{caseId,targetId:'zhou',reason:'交班'},'agent');
  const v=view(f.state),history=v.history(f.state.cases[0],f.conv);assert.doesNotMatch(history,/只出现在聊天/);assert.match(history,/正在协调接续人员/);
});
test('客户、AI、人工与系统使用不同身份标签，正文与客服名均转义',()=>{
  const f=fixture();f.say('杯子怎么清洗');const caseId=f.claim();f.state.staff[0].name='<img src=x onerror=alert(1)>';
  f.run('reply',{caseId,body:'<script>alert(1)</script>\n第二行'},'agent');f.run('handoff',{caseId,targetId:'zhou',reason:'交班'},'agent');
  const html=view(f.state).chat();assert.match(html,/AI 客服/);assert.match(html,/系统通知/);assert.match(html,/class="message customer"/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script>|<img src=x/);
});

test('消费者办理按钮不出现在工作台，关联事项仍可查看',()=>{
  const f=fixture(),caseId=f.claim();f.conv.messages.push({id:'MSG-ACTION',role:'assistant',body:'请选订单',at:NOW+100,caseIds:[caseId],action:'orders'});
  const v=view(f.state);assert.match(v.chat(),/data-action="message-action"/);assert.doesNotMatch(v.desk(f.state.cases[0]),/data-action="message-action"/);assert.match(v.desk(f.state.cases[0]),/data-action="case"/);
});

test('同事项关联新会话后，旧会话人工回复在事项时间线中仍可查看',()=>{
  const f=fixture(),caseId=f.claim();f.run('reply',{caseId,body:'旧会话核实结果'},'agent');
  const next=f.run('newConversation',{});assert.equal(f.run('requestHuman',{conversationId:next}),caseId);
  const v=view(f.state),c=f.state.cases.find(c=>c.id===caseId);
  assert.match(v.desk(c),/旧会话核实结果/);assert.match(v.history(c),/旧会话核实结果/);
});
test('只有业务时间线的事项详情保留人工回复',()=>{
  const f=fixture(),caseId=f.claim();f.run('reply',{caseId,body:'详情应能查看的答复'},'agent');
  assert.match(view(f.state).history(f.state.cases[0]),/客服 01：详情应能查看的答复/);
});
