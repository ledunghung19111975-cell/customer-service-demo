/* Persist before announcing success. Old v3 data is never overwritten or auto-imported. */
(function(root){
  'use strict';
  const D=typeof module!=='undefined'&&module.exports?require('./domain.js'):root.SupportDomain;
  const KEY='qinghe-support-v4'; // Keep this internal key to retain existing records.
  const Copy=typeof module!=='undefined'&&module.exports?require('./copy.js'):root.SupportCopy;
  const COPY_BACKUP_KEY=KEY+':before-copy-v1';
  function valid(s){
    if(!s||s.schema!==4||!Number.isInteger(s.revision)||!Number.isInteger(s.sequence))return false;
    const tables=['customers','staff','orders','knowledge','conversations','cases','tickets','gaps','events'];
    if(!tables.every(k=>Array.isArray(s[k])&&s[k].every(x=>x&&typeof x.id==='string')&&new Set(s[k].map(x=>x.id)).size===s[k].length))return false;
    if(!s.flow?.live||!Array.isArray(s.flow.live.humanWords)||!Array.isArray(s.flow.versions)||typeof s.flow.live.intakeEnabled!=='boolean'||!s.settings||!Number.isInteger(s.settings.capacity))return false;
    const has=(table,id)=>s[table].some(x=>x.id===id),a=Array.isArray;
    return s.staff.every(x=>a(x.teams)&&D.roles[x.role])&&s.customers.every(x=>typeof x.name==='string')&&
      s.orders.every(x=>has('customers',x.customerId)&&typeof x.price==='number')&&
      s.knowledge.every(k=>a(k.versions)&&(k.live||k.draft)&&(!k.live||a(k.live.keywords)))&&
      s.conversations.every(c=>has('customers',c.customerId)&&a(c.messages)&&a(c.runs)&&a(c.ownerHistory)&&a(c.caseIds)&&c.caseIds.every(id=>has('cases',id))&&(!c.pendingCaseId||(c.caseIds.includes(c.pendingCaseId)&&s.cases.some(x=>x.id===c.pendingCaseId&&x.customerId===c.customerId&&x.conversationIds?.includes(c.id))))&&a(c.flow?.humanWords)&&['bot','queued','human','closed'].includes(c.state)&&c.messages.every(m=>typeof m.body==='string'))&&
      s.cases.every(c=>has('customers',c.customerId)&&a(c.resultHistory)&&a(c.conversationIds)&&c.conversationIds.every(id=>has('conversations',id))&&['open','waiting_customer','completed'].includes(c.status))&&
      s.tickets.every(t=>has('cases',t.caseId)&&has('customers',t.customerId)&&a(t.history)&&['new','working','waiting_customer','done'].includes(t.status))&&
      s.gaps.every(g=>has('conversations',g.conversationId))&&D.validWorkflow(s);
  }
  function open(storage,seed){
    let current, original=null, blocked='';
    try{
      original=storage.getItem(KEY);current=original?JSON.parse(original):seed();
      if(!valid(current))throw new Error('数据结构不兼容');
      if(original){
        const update=Copy.upgrade(current);
        if(update.changed){
          if(!valid(update.state))throw new Error('文案更新后的数据校验未通过');
          if(storage.getItem(KEY)!==original)throw new Error('工作空间已在其他页面更新，请刷新后重试');
          // Backup must succeed before replacing any persisted defaults.
          let backupKey=COPY_BACKUP_KEY,suffix=0,backup=storage.getItem(backupKey);
          while(backup!==null&&backup!==original){backupKey=COPY_BACKUP_KEY+':'+(++suffix);backup=storage.getItem(backupKey);}
          if(backup===null)storage.setItem(backupKey,original);
          if(storage.getItem(backupKey)!==original)throw new Error('原始记录备份未通过校验');
          if(storage.getItem(KEY)!==original)throw new Error('工作空间已在其他页面更新，请刷新后重试');
          const encoded=JSON.stringify(update.state);
          storage.setItem(KEY,encoded);
          current=update.state;original=encoded;
        }
      }
    }
    catch(err){blocked=`无法读取工作空间：${err.message}。原始数据未被覆盖。`;current=null;}
    return {
      get state(){return current;},get blocked(){return blocked;},get original(){return original;},
      dispatch(identity,type,data){
        if(blocked)throw new Error(blocked);
        const raw=storage.getItem(KEY);
        // Detect a changed tab before writing; not an atomic multi-user lock.
        if(raw!==original){throw new Error('工作空间已在其他页面更新。请刷新后重试，当前输入仍保留。');}
        const result=D.execute(current,identity,type,data);
        if(type!=='export'){
          if(!valid(result.state))throw new Error('操作后的数据校验未通过，原始记录未改变');
          const encoded=JSON.stringify(result.state);
          storage.setItem(KEY,encoded); // A quota/permission failure leaves memory unchanged.
          current=result.state;original=encoded;
        }
        return result.value;
      }
    };
  }
  const api={KEY,COPY_BACKUP_KEY,valid,open};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SupportStore=api;
})(typeof window!=='undefined'?window:globalThis);
