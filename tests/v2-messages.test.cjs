// 产出 Agent：Codex；消息身份、完整会话与旧记录显示回归。
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=process.env.V2_TEST_ROOT||path.resolve(__dirname,'..');
const M=require(path.join(root,'src/v2/model.js')),S=require(path.join(root,'src/v2/service.js')),P=require(path.join(root,'src/v2/sop.js'));
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
  const nodes=new Map(),listeners=new Map();
  const document={querySelector(selector){if(selector==='.messages')return null;if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',addEventListener(){},close(){this.open=false;},showModal(){this.open=true;}});return nodes.get(selector);},addEventListener(name,handler){listeners.set(name,handler);}};
  const window={SupportV2Model:M,SupportV2Service:S,SupportV2Sop:P,addEventListener(){}};
  const source=fs.readFileSync(path.join(root,'src/v2/app.js'),'utf8').replace(/\}\)\(\);\s*$/,'window.testView={chat:()=>{ui.view="customer";return chatView();},desk:c=>{ui.view="desk";return deskDetail(c);},history};})();');
  vm.runInNewContext(source,{window,document,navigator:{},localStorage:{getItem:()=>JSON.stringify(state)},setTimeout:()=>0,clearTimeout(){},Date});
  return {...window.testView,click:dataset=>listeners.get('click')({target:{closest:()=>({dataset})}}),change:(name,value)=>listeners.get('change')({target:{name,value}}),node:selector=>nodes.get(selector)};
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

test('紧凑队列支持筛选并在选择事项后关闭，不改变业务数据',async()=>{
  const f=fixture();f.say('杯子怎么清洗，EC-ITEM-002 还没到');const caseId=f.claim(),before=JSON.stringify(f.state),v=view(f.state);
  await v.click({view:'desk'});await v.click({action:'desk-queue'});assert.equal(v.node('#dialog').open,true);
  assert.match(v.node('#dialog-body').innerHTML,/f-queueDialogFilter/);assert.doesNotMatch(v.node('#dialog-body').innerHTML,/id="f-queueFilter"/);
  await v.change('queueDialogFilter','mine');const html=v.node('#dialog-body').innerHTML;
  assert.match(html,new RegExp('data-case="'+caseId+'"'));assert.doesNotMatch(html,/物流进度/);
  await v.click({action:'select-case',case:caseId});assert.equal(v.node('#dialog').open,false);assert.match(v.node('#app').innerHTML,/id="reply-form"/);assert.equal(JSON.stringify(f.state),before);
});
test('紧凑办理和关联弹窗保留操作、完整历史及备注',async()=>{
  const f=fixture(),caseId=f.claim();f.run('reply',{caseId,body:'需要保留的处理说明'},'agent');f.run('note',{caseId,body:'需要保留的内部备注'},'agent');
  const v=view(f.state);await v.click({view:'desk'});await v.click({action:'case',case:caseId});
  assert.match(v.node('#dialog-body').innerHTML,/data-command="handoff"/);await v.click({action:'close'});
  await v.click({action:'desk-context',case:caseId});assert.match(v.node('#dialog-body').innerHTML,/需要保留的处理说明/);assert.match(v.node('#dialog-body').innerHTML,/需要保留的内部备注/);
});
test('高度约束只在聊天和工作台生效，切到普通业务页会解除',async()=>{
  const v=view(M.createState(NOW));assert.match(v.node('#app').innerHTML,/<main class="page chat-page">/);
  for(const page of ['orders','products','progress']){await v.click({page});assert.doesNotMatch(v.node('#app').innerHTML,/<main class="page chat-page">/);}
  await v.click({page:'chat'});assert.match(v.node('#app').innerHTML,/<main class="page chat-page">/);
  await v.click({view:'ops'});assert.doesNotMatch(v.node('#app').innerHTML,/<main class="page chat-page">/);
});

test('澄清面板跟随选中事项，只引用该事项追问并转义正文',async()=>{
  const f=fixture();f.say('需要帮忙弄一下');f.say('怎么清洗');
  const general=f.state.cases.find(c=>c.title==='澄清服务诉求'),product=f.state.cases.find(c=>c.title==='确认咨询商品');
  assert(general&&product);const q=f.conv.messages.find(m=>m.role==='assistant'&&m.caseIds?.includes(general.id));q.body='<img src=x> 请说明具体诉求';
  const before=JSON.stringify(f.state),v=view(f.state);await v.click({view:'desk'});
  for(const c of [general,product]){
    await v.click({action:'select-case',case:c.id});const html=v.node('#app').innerHTML;
    const panel=html.slice(html.indexOf('<aside class="panel desk-workflow"'));
    assert.match(panel,new RegExp('<h2>'+c.title+'</h2>'));assert.match(panel,/class="sop-axis"/);assert.match(panel,/data-command="claim"/);assert.doesNotMatch(html,/desk-summary/);
    if(c===general){assert.match(panel,/&lt;img src=x&gt;/);assert.doesNotMatch(panel,/<img src=x>|哪种商品的使用/);}
    else{assert.match(panel,/哪种商品的使用/);assert.doesNotMatch(panel,/&lt;img src=x&gt;/);}
  }
  assert.equal(JSON.stringify(f.state),before);
});
test('处理面板沿用角色权限，已完成澄清展示真实结论',async()=>{
  const f=fixture();f.say('需要帮忙弄一下');const c=f.state.cases[0];f.run('claim',{caseId:c.id},'agent');
  let v=view(f.state);await v.click({view:'desk'});assert.match(v.node('#app').innerHTML,/data-command="completeInquiry"/);
  await v.change('deskActor','zhou');assert.doesNotMatch(v.node('#app').innerHTML,/data-command="completeInquiry"|id="reply-form"/);
  f.run('completeInquiry',{caseId:c.id,reason:'已确认是咨询营业时间 <核实>'},'agent');v=view(f.state);
  const html=v.desk(f.state.cases[0]),panel=html.slice(html.indexOf('<aside class="panel desk-workflow"'));
  assert.match(panel,/已确认是咨询营业时间 &lt;核实&gt;/);assert.doesNotMatch(panel,/待确认内容|workflow-steps|data-command="completeInquiry"/);
});
test('窄屏处理面板保留办理、历史与备注，消费者无法打开',async()=>{
  const f=fixture(),caseId=f.claim();f.run('reply',{caseId,body:'需要保留的答复'},'agent');f.run('note',{caseId,body:'核实中的备注'},'agent');
  f.run('scheduleCallback',{caseId,nextAt:NOW+86400000,reason:'确认服务是否解决 <回访>'},'agent');
  const before=JSON.stringify(f.state),v=view(f.state);await v.click({action:'desk-workflow',case:caseId});assert.notEqual(v.node('#dialog').open,true);
  await v.click({view:'desk'});await v.click({action:'desk-workflow',case:caseId});assert.equal(v.node('#dialog').open,true);
  assert.match(v.node('#dialog-body').innerHTML,/data-command="handoff"/);assert.match(v.node('#dialog-body').innerHTML,/需要保留的答复/);assert.match(v.node('#dialog-body').innerHTML,/核实中的备注/);assert.doesNotMatch(v.node('#dialog-body').innerHTML,/workflow-steps/);
  assert.match(v.node('#dialog-body').innerHTML,/已安排 .* 回访：确认服务是否解决 &lt;回访&gt;/);assert.match(v.node('#dialog-body').innerHTML,/data-command="callbackResult"/);
  await v.click({action:'close'});assert.equal(v.node('#dialog').open,false);assert.equal(JSON.stringify(f.state),before);
});
