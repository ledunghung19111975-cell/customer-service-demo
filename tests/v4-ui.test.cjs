const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const D=require('../src/domain.js'),Seed=require('../src/seed.js'),Store=require('../src/store.js');
const ROOT=path.join(__dirname,'..');
const decode=s=>String(s).replace(/&(amp|lt|gt|quot|#39);/g,(_,x)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[x]));

// A small DOM/FormData adapter executes the real entry assets and delegated handlers.
// It verifies rendered fields and commands; layout and native browser behavior need browser checks.
class Element {
  constructor(tag,attrs={},text=''){this.tag=tag;this.attrs=attrs;this.children=[];this.parent=null;this.text=text;this.disabled='disabled' in attrs;this.hidden='hidden' in attrs;this.checked='checked' in attrs;this.open=false;}
  get dataset(){return Object.fromEntries(Object.entries(this.attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));}
  get type(){return this.attrs.type||'';}
  get value(){if(this._value!==undefined)return this._value;if(this.tag==='textarea')return this.textContent;if(this.tag==='select'){const list=this.querySelectorAll('option');return (list.find(x=>'selected' in x.attrs)||list[0])?.attrs.value||'';}return this.attrs.value||'';}
  set value(value){this._value=String(value);}
  get textContent(){return this.text+this.children.map(x=>x.textContent).join('');}
  set textContent(value){this.text=String(value);this.children=[];}
  set innerHTML(html){this.text='';this.children=[];const stack=[this];for(const token of html.match(/<[^>]+>|[^<]+/g)||[]){if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}if(token.startsWith('<')){if(/^<!/.test(token))continue;const tag=token.match(/^<([^\s/>]+)/)?.[1];if(!tag)continue;const attrs={};for(const a of token.slice(tag.length+1).replace(/\/?\s*>$/,'').matchAll(/([^\s=]+)(?:="([^"]*)")?/g))attrs[a[1]]=decode(a[2]||'');const el=new Element(tag,attrs);el.parent=stack.at(-1);el.parent.children.push(el);if(!/\/$/.test(token.slice(0,-1))&&!['input','br','hr','meta','link','img'].includes(tag))stack.push(el);}else{const el=new Element('#text',{},decode(token));el.parent=stack.at(-1);el.parent.children.push(el);}}}
  matches(selector){selector=selector.trim();if(selector.includes(':not([type=hidden])')){if(this.type==='hidden')return false;selector=selector.replace(':not([type=hidden])','');}const tag=selector.match(/^[a-z][\w-]*/)?.[0];if(tag&&this.tag!==tag)return false;const id=selector.match(/#([\w-]+)/)?.[1];if(id&&this.attrs.id!==id)return false;for(const c of selector.matchAll(/\.([\w-]+)/g))if(!(this.attrs.class||'').split(/\s+/).includes(c[1]))return false;for(const a of selector.matchAll(/\[([^=\]]+)(?:="?([^"\]]*)"?)?\]/g)){if(!(a[1] in this.attrs))return false;if(a[2]!==undefined&&this.attrs[a[1]]!==a[2])return false;}return this.tag!=='#text';}
  querySelectorAll(selector){const result=[];const choices=selector.split(',').map(x=>x.trim().split(/\s+/));const visit=node=>{for(const child of node.children){if(choices.some(parts=>{if(!child.matches(parts.at(-1)))return false;let parent=child.parent;for(let i=parts.length-2;i>=0;i--){while(parent&&!parent.matches(parts[i]))parent=parent.parent;if(!parent)return false;parent=parent.parent;}return true;}))result.push(child);visit(child);}};visit(this);return result;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){for(let node=this;node;node=node.parent)if(node.matches(selector))return node;return null;}
  get elements(){return {namedItem:name=>this.querySelector(`[name="${name}"]`)};}
  focus(){}
  showModal(){this.open=true;}
  close(){this.open=false;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
}
function memory(initial={}){const values=new Map(Object.entries(initial));return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};}
function app({state=Seed.create(),view={},hash='',search='',local,session}={}){
  local||=memory({[Store.KEY]:JSON.stringify(state)});session||=memory({'qinghe-support-view':JSON.stringify(view)});
  const doc=new Element('document'),events={},windowEvents={};doc.innerHTML=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  doc.addEventListener=(type,fn)=>events[type]=fn;doc.activeElement=null;doc.body=doc.querySelector('body');
  const location={hash,search};const history={pushState(_a,_b,url){location.hash=url;},replaceState(_a,_b,url){location.hash=url;}};
  const win={addEventListener:(type,fn)=>windowEvents[type]=fn};
  const context=vm.createContext({window:win,document:doc,localStorage:local,sessionStorage:session,location,history,URLSearchParams,URL,Blob,crypto:{randomUUID:()=>String(Math.random())},CSS:{escape:x=>x},console,setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:fn=>fn(),FormData:class {constructor(form){return form.querySelectorAll('input,textarea,select').filter(x=>x.attrs.name&&(!['checkbox','radio'].includes(x.type)||x.checked)).map(x=>[x.attrs.name,x.value]);}}});
  const assets=doc.querySelectorAll('script[src]').map(x=>x.attrs.src);
  for(const asset of assets)vm.runInContext(fs.readFileSync(path.join(ROOT,asset),'utf8'),context,{filename:asset});
  const one=selector=>{const found=doc.querySelector(selector);assert.ok(found,`Missing rendered element: ${selector}`);return found;};
  return {local,session,doc,one,assets,state:()=>JSON.parse(local.getItem(Store.KEY)),
    click(action,id){const selector=`[data-action="${action}"]${id===undefined?'':`[data-id="${id}"]`}`;const target=one(selector);assert.equal(target.disabled,false);events.click({target});},
    change(select,value){const target=one(`[data-select="${select}"]`);target.value=value;events.change({target});},
    input(formName,name,value){const form=one(`form[data-form="${formName}"]`),target=form.elements.namedItem(name);assert.ok(target);if(target.type==='checkbox')target.checked=Boolean(value);else target.value=value;events.input({target});},
    submit(formName){const target=one(`form[data-form="${formName}"]`);events.submit({target,preventDefault(){}});},
    value(formName,name){return one(`form[data-form="${formName}"]`).elements.namedItem(name).value;},
    reload(){return app({local,session,hash:location.hash,search});}
  };
}
function humanState(){let s=Seed.create(Date.now(),false);const run=(actor,type,data)=>{const r=D.execute(s,actor,type,data);s=r.state;return r.value;};const id=run({id:'C001',role:'customer'},'newConversation',{});run({id:'C001',role:'customer'},'requestHuman',{id});run({id:'lin',role:'agent'},'claimConversation',{id});return {state:s,id};}

test('default entry loads its actual assets and standalone customer routing hides internal navigation',()=>{
  const a=app();assert.ok(a.assets.includes('src/app.js'));assert.equal(a.doc.querySelectorAll('.workspace-tabs button').length,3);
  const b=app({view:{workspace:'ops',opsRole:'admin'},hash:'#ops/data',search:'?view=customer'});
  assert.equal(b.doc.querySelectorAll('.workspace-tabs').length,0);assert.ok(b.doc.querySelector('.customer-main'));assert.equal(b.doc.querySelectorAll('[data-action="export-data"]').length,0);
  const c=app({hash:'#ops/data'});assert.ok(c.one('h1').textContent.includes('服务概览'));assert.equal(c.doc.querySelectorAll('[data-action="export-data"]').length,0);
});

test('confirmed answers and tickets retain a working dispute entry',()=>{
  const a=app();a.click('quick-policy');const caseId=a.state().cases[0].id;a.click('confirm-case',caseId);
  assert.ok(a.doc.querySelector(`[data-action="dispute-case"][data-id="${caseId}"]`));
  a.click('dispute-case',caseId);a.input('dispute','reason','仍需核对适用条件');a.submit('dispute');
  assert.equal(D.get(a.state(),'cases',caseId).feedback,'disputed');
  let state=Seed.create(),ticket=state.tickets[0];
  state=D.execute(state,{id:'lin',role:'agent'},'updateTicket',{id:ticket.id,status:'done',publicText:'核实完成',evidence:'内部核对记录'}).state;
  state=D.execute(state,{id:ticket.customerId,role:'customer'},'feedback',{id:ticket.caseId,confirmed:true}).state;
  const b=app({state});b.click('ticket-detail',ticket.id);
  assert.ok(b.one('#dialog').querySelector(`[data-action="dispute-case"][data-id="${ticket.caseId}"]`));
});

test('unsubmitted reply and note drafts stay with their author across reassignment and reload',()=>{
  const {state,id}=humanState();let a=app({state,view:{workspace:'desk',deskFilter:'mine'},hash:'#desk/inbox'});
  a.input('reply','body','小林尚未发送的回复');a.click('compose-mode','note');a.input('note','body','小林尚未提交的内部备注');
  a.click('workspace','ops');a.click('ops-page','team');a.click('assign-conversation',id);a.input('assign','ownerId','zhou');a.submit('assign');
  a.click('workspace','desk');a.change('agent','zhou');assert.equal(a.value('note','body'),'');a.input('note','body','小周自己的备注');
  a.click('workspace','ops');a.click('assign-conversation',id);a.input('assign','ownerId','lin');a.submit('assign');a.click('workspace','desk');a.change('agent','lin');
  assert.equal(a.value('note','body'),'小林尚未提交的内部备注');a.click('compose-mode','reply');assert.equal(a.value('reply','body'),'小林尚未发送的回复');
  a=a.reload();assert.equal(a.value('reply','body'),'小林尚未发送的回复');assert.equal(a.state().conversations[0].messages.some(x=>x.body.includes('尚未')),false);
});

test('customer and staff service-application drafts do not share a case key',()=>{
  let state=Seed.create(Date.now(),false);const run=(who,type,data)=>{const r=D.execute(state,who,type,data);state=r.state;return r.value;};
  const customer={id:'C001',role:'customer'},id=run(customer,'newConversation',{});run(customer,'say',{id,body:'申请退货 SO20260926001'});const caseId=state.cases[0].id;
  const a=app({state});a.click('intake',caseId);a.input('ticket-request','description','客户未提交原因');a.click('close-modal');a.click('request-human',id);a.click('workspace','desk');a.click('claim-conversation',id);a.click('staff-intake',caseId);
  assert.equal(a.value('ticket-request','description'),'');a.input('ticket-request','description','客服未提交原因');a.click('close-modal');a.click('workspace','customer');a.click('intake',caseId);assert.equal(a.value('ticket-request','description'),'客户未提交原因');
});

test('service settings restore after page changes and refresh without writing business configuration',()=>{
  let a=app({view:{workspace:'ops'},hash:'#ops/service'});a.input('service-settings','capacity','19');a.input('service-settings','accepting','false');a.click('ops-page','overview');a.click('ops-page','service');
  assert.equal(a.value('service-settings','capacity'),'19');assert.equal(a.value('service-settings','accepting'),'false');a=a.reload();assert.equal(a.value('service-settings','capacity'),'19');assert.equal(a.state().settings.capacity,3);
});

test('cancelled disable, assignment, remediation link and acceptance forms restore their fields',()=>{
  const a=app({view:{workspace:'ops',opsRole:'operator'},hash:'#ops/knowledge'});
  a.click('disable-knowledge','KB001');a.input('disable-knowledge','reason','等待审核资料');a.click('close-modal');a.click('disable-knowledge','KB001');assert.equal(a.value('disable-knowledge','reason'),'等待审核资料');a.click('close-modal');
  a.change('ops-role','manager');a.click('ops-page','team');const ticket=a.state().tickets[0].id;a.click('assign-ticket',ticket);a.input('assign','ownerId','zhou');a.click('close-modal');a.click('assign-ticket',ticket);assert.equal(a.value('assign','ownerId'),'zhou');a.click('close-modal');
  a.click('ops-page','quality');const gap=a.state().gaps[0].id;a.click('review-gap',gap);a.input('review-gap','review','核对原始提问');a.input('review-gap','cause','缺少此类规则');a.submit('review-gap');
  a.change('ops-role','operator');a.click('ops-page','quality');a.click('link-gap',gap);a.input('link-gap','knowledgeId','KB002');a.click('close-modal');a.click('link-gap',gap);assert.equal(a.value('link-gap','knowledgeId'),'KB002');a.submit('link-gap');
  a.change('ops-role','manager');a.click('ops-page','quality');a.click('accept-gap',gap);a.input('accept-gap','acceptance','仍需逐项核对原问题');a.click('close-modal');a.click('accept-gap',gap);assert.equal(a.value('accept-gap','acceptance'),'仍需逐项核对原问题');
});

test('unsaved flow blocks single tests at the button and submit handler; edits remove old results',()=>{
  const a=app({view:{workspace:'ops',opsRole:'operator'},hash:'#ops/flow'});a.input('flow-query','query','申请退货 SO20260926001');a.submit('flow-query');assert.ok(a.one('.query-result').textContent.includes('intake'));
  a.input('flow-query','query','查物流 SO20260926001');assert.equal(a.doc.querySelector('.query-result'),null);a.submit('flow-query');assert.ok(a.doc.querySelector('.query-result'));
  a.input('flow','intakeEnabled','false');assert.equal(a.doc.querySelector('.query-result'),null);assert.equal(a.one('[data-form="flow-query"] [type="submit"]').disabled,true);assert.equal(a.one('[data-flow-unsaved]').hidden,false);
  const before=JSON.stringify(a.state());a.submit('flow-query');assert.ok(a.one('#toast').textContent.includes('请先保存策略草稿'));assert.equal(a.doc.querySelector('.query-result'),null);assert.equal(JSON.stringify(a.state()),before);
  a.submit('flow');assert.equal(a.one('[data-form="flow-query"] [type="submit"]').disabled,false);a.input('flow-query','query','申请退货 SO20260926001');a.submit('flow-query');assert.ok(a.one('.query-result').textContent.includes('handoff'));assert.ok(!a.one('.query-result').textContent.includes('intake'));
  a.change('ops-role','manager');a.change('ops-role','operator');a.click('ops-page','flow');assert.equal(a.doc.querySelector('.query-result'),null);
});
