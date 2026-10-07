// 产出 Agent：Claude；客服工作台 SOP 竖轴、意图映射、节点推进与话术预填回归。
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=process.env.V2_TEST_ROOT||path.resolve(__dirname,'..');
const M=require(path.join(root,'src/v2/model.js')),S=require(path.join(root,'src/v2/service.js')),P=require(path.join(root,'src/v2/sop.js'));
const NOW=Date.parse('2026-10-07T10:00:00Z');
function fixture(){
  let state=M.createState(NOW),at=NOW;
  const f={get state(){return state;},
    run(command,data,role='customer',id=role==='customer'?'C001':'lin'){const r=S.execute(state,{id,role},command,data,++at);state=r.state;return r.value;},
    say(body){return f.run('say',{conversationId:'CONV001',body});},
    sop(caseId){return P.build(state,caseId,{agentId:'lin'});},
    send(caseId,i=0){const p=f.sop(caseId).prefill;f.run('reply',{caseId,body:p.options[i],sopNode:p.node},'agent');return p;}};
  return f;
}
function refundCase(f){
  const file=f.run('addAttachment',{name:'leak.png',mime:'image/png',size:10,dataUrl:'data:image/png;base64,AAAA'});
  const draft=f.run('preview',{type:'return_refund',orderId:'EC-SO20261005001',itemId:'EC-ITEM-001',reason:'杯盖漏水',attachmentIds:[file],conversationId:'CONV001'});
  f.run('confirm',{draftId:draft.id});return f.state.cases.find(c=>c.applicationId).id;
}
function view(state){
  const nodes=new Map(),listeners=new Map();
  const document={querySelector(selector){if(selector==='.messages')return null;if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',addEventListener(){},close(){this.open=false;},showModal(){this.open=true;}});return nodes.get(selector);},addEventListener(name,handler){listeners.set(name,handler);}};
  const window={SupportV2Model:M,SupportV2Service:S,SupportV2Sop:P,addEventListener(){}};
  const store={value:JSON.stringify(state)};
  const localStorage={getItem:()=>store.value,setItem:(k,v)=>{store.value=v;}};
  const source=fs.readFileSync(path.join(root,'src/v2/app.js'),'utf8').replace(/\}\)\(\);\s*$/,'window.testView={state:()=>state};})();');
  vm.runInNewContext(source,{window,document,navigator:{locks:{request:(k,o,cb)=>Promise.resolve(cb({}))}},localStorage,setTimeout:()=>0,clearTimeout(){},Date});
  return {state:()=>window.testView.state(),click:dataset=>listeners.get('click')({target:{closest:()=>({dataset,disabled:false})}}),
    change:(name,value)=>listeners.get('change')({target:{name,value}}),html:()=>nodes.get('#app').innerHTML,node:s=>nodes.get(s)};
}
const panel=html=>html.slice(html.indexOf('<aside class="panel desk-workflow"'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('节点目录覆盖 5 类 19 个意图，节点键与回复校验规则一致',()=>{
  assert.equal(P.GROUPS.length,5);assert.equal(Object.keys(P.INTENTS).length,19);
  for(const it of Object.values(P.INTENTS)){
    assert.ok(it.steps.length>=2&&it.steps.length<=5,it.id);
    it.steps.forEach(([kind,name],i)=>{assert.ok(['say','ask','act'].includes(kind));assert.ok(name);assert.match(it.id+'.'+i,P.NODE_KEY);});
  }
  for(const key of ['greet','clarify','followup','confirm','rate'])assert.match(key,P.NODE_KEY);
  for(const bad of ['enter','end','refund','refund.10','<b>.1'])assert.doesNotMatch(bad,P.NODE_KEY);
});

test('路由生成的事项映射到唯一意图，说不清的诉求留给澄清节点',()=>{
  const cases=[['保温杯怎么清洗','使用说明'],['EC-SO20261005001 的物流到哪了','物流查询'],['我买的保温杯漏水了，想退货','退货退款'],
    ['我要投诉','投诉建议'],['需要帮忙弄一下',null],['想换货','换货'],['想开发票','发票服务'],['收到的东西少件了','缺件补发']];
  for(const [body,name] of cases){
    const f=fixture();f.say(body);const c=f.state.cases[0],m=f.sop(c.id);
    assert.equal(m.intent?.name??null,name,body+' → '+c.title);
    assert.equal(m.path.includes('clarify'),name===null);
  }
  assert.equal(P.intentOf({type:'clarification',title:'选择查询订单'},'请先选择订单或具体商品，再核对对应包裹。'),'logistics');
  assert.equal(P.intentOf({type:'clarification',title:'选择查询订单'},'请选择本人订单，再核对支付或订单状态。'),'order');
  assert.equal(P.intentOf({type:'clarification',title:'确认售后商品'},'','杯子有点问题'),null);
  assert.equal(P.intentOf({type:'human',title:'人工服务'}),null);
});

test('退货全流程：受理后审核与退款转为会后跟进，反馈与评分点亮收尾节点',()=>{
  const f=fixture(),id=refundCase(f);
  let m=f.sop(id);assert.equal(m.intent.name,'退货退款');
  assert.deepEqual(['refund.0','refund.1','refund.2'].map(k=>m.nodes[k].status),['done','done','done']);
  assert.deepEqual(['refund.3','refund.4'].map(k=>m.nodes[k].status),['async','async']);
  assert.ok(m.path.includes('followup'));assert.equal(m.nodes.greet.status,'done');assert.equal(m.nodes.greet.note,'AI 已接待');
  f.run('claim',{caseId:id},'agent');m=f.sop(id);assert.equal(m.current,'greet');assert.match(m.prefill.options[0],/客服 01.*想办理退货退款/);
  f.send(id);m=f.sop(id);assert.equal(m.current,'followup');assert.match(m.prefill.options[0],/退货退款申请已在办理中.*待审核.*售后组/);
  f.send(id);m=f.sop(id);assert.equal(m.current,'confirm');assert.equal(m.awaitingCustomer,true);
  f.run('approve',{applicationId:f.state.cases.find(c=>c.id===id).applicationId,reason:'符合规则'},'manager','manager');
  m=f.sop(id);assert.equal(m.nodes['refund.3'].status,'async');assert.match(m.nodes['refund.3'].note,/待寄回商品/);
  f.send(id);f.run('feedback',{caseId:id,resolved:true,satisfaction:5});m=f.sop(id);
  assert.equal(m.nodes.confirm.status,'done');assert.equal(m.nodes.rate.status,'done');assert.equal(m.nodes.rate.note,'客户评分 5 / 5');assert.equal(m.current,'end');
  assert.equal(m.prefill.options.length,0);assert.match(m.prefill.guidance,/结束本次接待/);
  assert.deepEqual(f.state.conversations[0].messages.filter(x=>x.role==='agent').map(x=>x.sopNode),['greet','followup','confirm']);
});

test('追问类节点发送后等待客户回复，客户回复后才进入下一步',()=>{
  const f=fixture();f.say('我买的保温杯漏水了，想退货');const id=f.state.cases[0].id;f.run('claim',{caseId:id},'agent');
  f.send(id);let m=f.sop(id);assert.equal(m.current,'refund.0');assert.match(m.nodes['refund.0'].note,/待确认内容/);
  f.send(id);m=f.sop(id);assert.equal(m.current,'refund.0');assert.equal(m.prefill.asked,true);
  f.say('10月5号那单的保温杯');m=f.sop(id);assert.equal(m.nodes['refund.0'].status,'done');assert.equal(m.current,'refund.1');
  assert.equal(m.prefill.asked,false);assert.match(m.prefill.guidance,/协助整理申请/);
});

test('所有路由场景的预填话术都有实值，系统查询节点不提供话术',()=>{
  const bodies=['保温杯怎么清洗','保温杯多少钱','通勤用哪个杯子好','我有张满200减20的券能用吗','EC-SO20261005001 的物流到哪了','帮我查一下订单','保温杯想换个颜色','保温杯漏水想退货','想仅退款','少件了要补发','保温杯坏了要维修','想开发票','降价了能价保吗','EC-SO20261006001 想改地址','EC-SO20261006001 取消订单','售后进度到哪了','退货政策是什么','我要投诉','需要帮忙弄一下','转人工'];
  for(const body of bodies){
    const f=fixture();f.say(body);
    for(const c of f.state.cases){
      if(!c.ownerId&&!c.ownerId)try{f.run('claim',{caseId:c.id},'agent');}catch(err){}
      for(let n=0;n<8;n++){
        const m=f.sop(c.id);assert.ok(m.done<=m.total);
        if(!m.prefill)break;
        for(const text of m.prefill.options)assert.doesNotMatch(text,/undefined|null|NaN|\[object/,body+' '+m.prefill.node);
        if(m.prefill.kind==='act')assert.equal(m.prefill.options.length,0);
        if(!m.prefill.options.length||m.prefill.asked||!f.state.cases.find(x=>x.id===c.id).ownerId)break;
        f.send(c.id);
      }
    }
  }
});

test('回复只接受合法节点键，空值保持旧行为，SOP 推导不改写记录',()=>{
  const f=fixture(),id=f.run('requestHuman',{conversationId:'CONV001'});f.run('claim',{caseId:id},'agent');
  assert.throws(()=>f.run('reply',{caseId:id,body:'你好',sopNode:'<img>'},'agent'),/话术节点无效/);
  f.run('reply',{caseId:id,body:'普通回复',sopNode:''},'agent');
  const msg=f.state.conversations[0].messages.at(-1);assert.equal(msg.role,'agent');assert.equal('sopNode' in msg,false);
  f.run('reply',{caseId:id,body:'您好',sopNode:'greet'},'agent');
  const c=f.state.cases.find(x=>x.id===id);assert.equal(c.history.at(-1).sopNode,'greet');assert.equal(f.state.conversations[0].messages.at(-1).sopNode,'greet');
  const before=JSON.stringify(f.state);f.sop(id);P.build(f.state,'CS-NOPE');assert.equal(JSON.stringify(f.state),before);
});

test('工作台右侧竖轴：完整分组、命中分组展开、客户原话转义',async()=>{
  const f=fixture();f.say('<img src=x> 我买的保温杯漏水了，想退货');const id=f.state.cases[0].id;f.run('claim',{caseId:id},'agent');
  const v=view(f.state);await tick();await v.click({view:'desk'});await v.click({action:'select-case',case:id});const html=panel(v.html());
  assert.match(html,/class="sop-axis"/);assert.equal((html.match(/class="sop-row sop-intent /g)||[]).length,19);
  assert.equal((html.match(/<details open>/g)||[]).length,1);assert.match(html,/<details open><summary class="sop-group[^"]*"><span class="sop-tick"[^>]*><\/span><span class="sop-mark"[^>]*><\/span><span class="sop-group-name">售后服务/);
  for(const stage of ['接入','识别','分流办理','收尾'])assert.match(html,new RegExp('</span>'+stage));
  assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img src=x>/);
  assert.match(html,/aria-current="step"/);assert.match(html,/data-command="note"/);
});

test('预填卡片：采用并发送记录节点，填入修改带出原节点，换一条轮换，过期节点不发送',async()=>{
  const f=fixture();f.say('我买的保温杯漏水了，想退货');const id=f.state.cases[0].id;f.run('claim',{caseId:id},'agent');
  const v=view(f.state);await tick();await v.click({view:'desk'});await v.click({action:'select-case',case:id});
  let html=v.html();assert.match(html,/话术预填 · 节点「欢迎语」/);assert.match(html,/data-action="sop-send"/);assert.match(html,/第 1 \/ 2 条/);
  await v.click({action:'sop-alt',case:id,node:'greet',alt:'0'});html=v.html();assert.match(html,/第 2 \/ 2 条/);assert.match(html,/关于退货退款的问题我来继续跟进/);
  await v.click({action:'sop-fill',case:id,node:'greet',alt:'1'});html=v.html();
  assert.match(html,/name="sopNode" value="greet"/);assert.match(html,/<textarea id="f-body" name="body"[^>]*>您好，我是客服 01，关于退货退款/);
  const before=JSON.stringify(v.state());await v.click({action:'sop-send',case:id,node:'confirm',alt:'0'});
  assert.equal(JSON.stringify(v.state()),before);assert.match(v.node('#toast').textContent,/SOP 节点已变化/);
  await v.click({action:'sop-send',case:id,node:'greet',alt:'0'});
  const sent=v.state().conversations[0].messages.at(-1);assert.equal(sent.sopNode,'greet');assert.match(sent.body,/^您好，我是客服 01/);
  html=v.html();assert.match(html,/节点「退货退款 · 核对订单商品」/);assert.match(html,/客户还没有回复上一条消息/);
  await v.change('deskActor','zhou');assert.doesNotMatch(v.html(),/sop-prefill|id="reply-form"/);
});
