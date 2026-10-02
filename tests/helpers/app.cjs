// 产出 Agent：Codex
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'../..');
const D=require(path.join(ROOT,'src/domain.js'));
const Seed=require(path.join(ROOT,'src/seed.js'));
const Store=require(path.join(ROOT,'src/store.js'));
const decode=s=>String(s).replace(/&(amp|lt|gt|quot|#39);/g,(_,x)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[x]));

// Runs actual entry scripts and delegated events. Geometry and native layout need browser checks.
class Element {
  constructor(tag,attrs={},text=''){
    this.tag=tag;this.attrs={...attrs};this.childNodes=[];this.parent=null;this.text=text;
    this.scrollTop=0;this.selectionStart=0;this.selectionEnd=0;
  }
  get dataset(){
    const names=Object.fromEntries(Object.entries(this.attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));
    return new Proxy(names,{set:(target,key,value)=>{target[key]=String(value);this.attrs['data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=String(value);return true;}});
  }
  get parentElement(){return this.parent?.tag==='document'?null:this.parent;}
  get children(){return this.childNodes.filter(node=>node.tag!=='#text');}
  get ownerDocument(){for(let node=this;node;node=node.parent)if(node.tag==='document')return node;return this._ownerDocument||null;}
  get isConnected(){for(let node=this;node;node=node.parent)if(node.tag==='document')return true;return false;}
  get tagName(){return this.tag.toUpperCase();}
  get type(){return this.attrs.type||'';}
  get name(){return this.attrs.name||'';}
  get className(){return this.attrs.class||'';}
  set className(value){this.attrs.class=String(value);}
  get classList(){const el=this;return {contains(name){return el.className.split(/\s+/).includes(name);},add(...names){el.className=[...new Set([...el.className.split(/\s+/).filter(Boolean),...names])].join(' ');},remove(...names){el.className=el.className.split(/\s+/).filter(x=>!names.includes(x)).join(' ');},toggle(name,force){const present=this.contains(name),next=force??!present;if(next)this.add(name);else this.remove(name);return next;}};}
  get disabled(){return 'disabled' in this.attrs;}
  set disabled(value){this.toggleAttribute('disabled',Boolean(value));}
  get hidden(){return 'hidden' in this.attrs;}
  set hidden(value){this.toggleAttribute('hidden',Boolean(value));}
  get inert(){return 'inert' in this.attrs;}
  set inert(value){this.toggleAttribute('inert',Boolean(value));}
  get checked(){return this._checked??('checked' in this.attrs);}
  set checked(value){this._checked=Boolean(value);}
  get open(){return 'open' in this.attrs;}
  set open(value){this.toggleAttribute('open',Boolean(value));}
  get value(){if(this._value!==undefined)return this._value;if(this.tag==='textarea')return this.textContent;if(this.tag==='select'){const list=this.querySelectorAll('option');return (list.find(x=>'selected' in x.attrs)||list[0])?.attrs.value||'';}return this.attrs.value||'';}
  set value(value){this._value=String(value);}
  get textContent(){return this.text+this.childNodes.map(x=>x.textContent).join('');}
  set textContent(value){this.text=String(value);for(const child of this.childNodes)child.parent=null;this.childNodes=[];}
  set innerHTML(html){
    this.textContent='';const stack=[this];
    for(const token of String(html).match(/<[^>]+>|[^<]+/g)||[]){
      if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}
      if(token.startsWith('<')){
        if(/^<!/.test(token))continue;
        const tag=token.match(/^<([^\s/>]+)/)?.[1];if(!tag)continue;const attrs={};
        for(const a of token.slice(tag.length+1).replace(/\/?\s*>$/,'').matchAll(/([^\s=]+)(?:="([^"]*)")?/g))attrs[a[1]]=decode(a[2]||'');
        const el=new Element(tag,attrs);stack.at(-1).append(el);
        if(!/\/$/.test(token.slice(0,-1))&&!['input','br','hr','meta','link','img'].includes(tag))stack.push(el);
      }else stack.at(-1).append(new Element('#text',{},decode(token)));
    }
  }
  setAttribute(name,value){this.attrs[name]=String(value);}
  getAttribute(name){return this.attrs[name]??null;}
  hasAttribute(name){return name in this.attrs;}
  removeAttribute(name){delete this.attrs[name];}
  toggleAttribute(name,force){const next=force??!this.hasAttribute(name);if(next)this.attrs[name]='';else delete this.attrs[name];return next;}
  append(...nodes){for(let node of nodes){if(typeof node==='string')node=new Element('#text',{},node);node.remove();node.parent=this;node._ownerDocument=this.ownerDocument;this.childNodes.push(node);}}
  appendChild(node){this.append(node);return node;}
  removeChild(node){assert.ok(this.childNodes.includes(node));node.remove();return node;}
  contains(other){for(let node=other;node;node=node.parent)if(node===this)return true;return false;}
  matches(selector){
    selector=selector.trim();if(this.tag==='#text')return false;
    for(const m of selector.matchAll(/:not\(([^()]*)\)/g))if(this.matches(m[1]))return false;
    selector=selector.replace(/:not\([^()]*\)/g,'');
    const tag=selector.match(/^[a-z][\w-]*/)?.[0];if(tag&&this.tag!==tag)return false;
    const id=selector.match(/#([\w-]+)/)?.[1];if(id&&this.attrs.id!==id)return false;
    for(const c of selector.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(c[1]))return false;
    for(const a of selector.matchAll(/\[([^=\]\s]+)(?:="?([^"\]]*)"?)?\]/g)){if(!(a[1] in this.attrs))return false;if(a[2]!==undefined&&this.attrs[a[1]]!==a[2])return false;}
    return true;
  }
  querySelectorAll(selector){
    const result=[],choices=selector.split(',').map(x=>x.trim().replace(/\s*>\s*/g,' > ').split(/\s+/));
    const visit=node=>{for(const child of node.children){
      if(choices.some(parts=>{if(!child.matches(parts.at(-1)))return false;let parent=child.parent;
        for(let i=parts.length-2;i>=0;i--){if(parts[i]==='>'){i--;if(!parent||!parent.matches(parts[i]))return false;parent=parent.parent;}
          else{while(parent&&!parent.matches(parts[i]))parent=parent.parent;if(!parent)return false;parent=parent.parent;}}
        return true;}))result.push(child);visit(child);
    }};visit(this);return result;
  }
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){for(let node=this;node;node=node.parent)if(node.matches(selector))return node;return null;}
  get elements(){return {namedItem:name=>this.querySelector(`[name="${name}"]`)};}
  focus(){if(this.ownerDocument)this.ownerDocument.activeElement=this;}
  setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
  show(){this.open=true;this.showMethod='show';}
  showModal(){this.open=true;this.showMethod='showModal';}
  close(){this.open=false;}
  requestSubmit(){this.ownerDocument?._dispatch('submit',{target:this,preventDefault(){}});}
  remove(){if(this.parent)this.parent.childNodes=this.parent.childNodes.filter(x=>x!==this);this.parent=null;}
}
function memory(initial={}){const values=new Map(Object.entries(initial));return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
function app({state=Seed.create(),view={},hash='',search='',local,session,controlledTimers=false}={}){
  local||=memory({[Store.KEY]:JSON.stringify(state)});session||=memory({'qinghe-support-view':JSON.stringify(view)});
  const doc=new Element('document'),events={},windowEvents={},errors=[],pendingTimers=new Map();let timerSequence=0;
  const schedule=(fn,delay)=>{if(!controlledTimers)return 1;const id=++timerSequence;pendingTimers.set(id,{fn,delay});return id;};
  doc.addEventListener=(type,fn)=>(events[type]||=[]).push(fn);
  doc._dispatch=(type,event)=>{for(const fn of events[type]||[])fn(event);};
  doc.activeElement=null;doc.innerHTML=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');doc.body=doc.querySelector('body');
  doc.createElement=tag=>{const el=new Element(tag);el._ownerDocument=doc;return el;};
  const location={hash,search};const history={pushState(_a,_b,url){location.hash=url;},replaceState(_a,_b,url){location.hash=url;}};
  const win={addEventListener:(type,fn)=>(windowEvents[type]||=[]).push(fn)};
  const context=vm.createContext({window:win,document:doc,localStorage:local,sessionStorage:session,location,history,URLSearchParams,URL,Blob,crypto:{randomUUID:()=>String(Math.random())},CSS:{escape:x=>x},console:{...console,error:(...args)=>errors.push(args)},setTimeout:schedule,clearTimeout:id=>pendingTimers.delete(id),requestAnimationFrame:fn=>fn(),FormData:class {constructor(form){return form.querySelectorAll('input,textarea,select').filter(x=>x.attrs.name&&!x.disabled&&(!['checkbox','radio'].includes(x.type)||x.checked)).map(x=>[x.attrs.name,x.value]);}}});
  const assets=doc.querySelectorAll('script[src]').map(x=>x.attrs.src);
  for(const asset of assets)vm.runInContext(fs.readFileSync(path.join(ROOT,asset),'utf8'),context,{filename:asset});
  const one=selector=>{const found=doc.querySelector(selector);assert.ok(found,`Missing rendered element: ${selector}`);return found;};
  const timers=controlledTimers?{runNext(delay){const next=[...pendingTimers].find(([,timer])=>delay===undefined||timer.delay===delay);assert.ok(next,`No scheduled timer for ${delay}ms`);pendingTimers.delete(next[0]);next[1].fn();},count(delay){return [...pendingTimers.values()].filter(timer=>delay===undefined||timer.delay===delay).length;}}:undefined;
  return {local,session,doc,one,assets,errors,location,timers,state:()=>JSON.parse(local.getItem(Store.KEY)),
    click(action,id){const selector=`[data-action="${action}"]${id===undefined?'':`[data-id="${id}"]`}`;const target=one(selector);assert.equal(target.disabled,false);target.focus();doc._dispatch('click',{target});},
    change(select,value){const target=one(`[data-select="${select}"]`);target.value=value;doc._dispatch('change',{target});},
    input(formName,name,value){const form=one(`form[data-form="${formName}"]`),target=form.elements.namedItem(name);assert.ok(target,`Missing ${formName}.${name}`);if(target.type==='checkbox')target.checked=Boolean(value);else target.value=value;target.focus();doc._dispatch('input',{target});},
    changeField(formName,name,value){const form=one(`form[data-form="${formName}"]`),target=form.elements.namedItem(name);assert.ok(target);if(target.type==='checkbox')target.checked=Boolean(value);else target.value=value;doc._dispatch('change',{target});},
    submit(formName){const target=one(`form[data-form="${formName}"]`);doc._dispatch('submit',{target,preventDefault(){}});},
    value(formName,name){return one(`form[data-form="${formName}"]`).elements.namedItem(name).value;},
    key(selector,key,extra={}){doc._dispatch('keydown',{target:one(selector),key,...extra,preventDefault(){}});},
    reload(){return app({local,session,hash:location.hash,search,controlledTimers});}
  };
}
function humanState(){let s=Seed.create(Date.now(),false);const run=(actor,type,data)=>{const r=D.execute(s,actor,type,data);s=r.state;return r.value;};const id=run({id:'C001',role:'customer'},'newConversation',{});run({id:'C001',role:'customer'},'requestHuman',{id});run({id:'lin',role:'agent'},'claimConversation',{id});return {state:s,id};}
module.exports={app,humanState,memory,Element,D,Seed,Store,ROOT};
