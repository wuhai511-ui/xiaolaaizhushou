/* Browser-local demonstration records. They are not platform authorization or a ledger. */
(()=>{
 const keys={evidence:'xiaola-workbench-evidence-v1',payments:'xiaola-workbench-payments-v1',suppliers:'xiaola-workbench-suppliers-v1',templates:'xiaola-workbench-templates-v1'};
 function read(key){try{const value=JSON.parse(localStorage.getItem(keys[key])||'[]');return Array.isArray(value)?value:[]}catch{return []}}
 function write(key,rows){try{localStorage.setItem(keys[key],JSON.stringify(rows));return true}catch{return false}}
 function text(value,max=100){return typeof value==='string'?value.trim().slice(0,max):''}
 function save(event){
  if(!event||typeof event!=='object')return false;
  if(event.kind==='payment'){
   const storeId=text(event.storeId,64),orderId=text(event.orderId,32),merchantNo=text(event.merchantNo,32),terminalNo=text(event.terminalNo,16),merchantOrderNo=text(event.merchantOrderNo,32),amountFen=text(event.amountFen,12),state=text(event.state,16),platformOrderNo=text(event.platformOrderNo,64);
   if(!storeId||![orderId,merchantNo,terminalNo,merchantOrderNo].every(x=>/^[A-Za-z0-9_-]+$/.test(x))||!/^[1-9]\d{0,11}$/.test(amountFen)||!['intent','created','paid','unknown'].includes(state))return false;
   const rows=read('payments'),index=rows.findIndex(x=>x.storeId===storeId&&x.orderId===orderId),existing=rows[index];
   if(existing&&(existing.merchantOrderNo!==merchantOrderNo||existing.merchantNo!==merchantNo||existing.terminalNo!==terminalNo||existing.amountFen!==amountFen))return false;
   if(existing&&state==='intent')return false;
   if(existing?.state==='paid'&&state!=='paid')return false;
   const item={storeId,orderId,merchantNo,terminalNo,merchantOrderNo,amountFen,state,platformOrderNo:platformOrderNo||existing?.platformOrderNo||'',time:new Date().toISOString()};if(index<0)rows.unshift(item);else rows[index]=item;return write('payments',rows.slice(0,500));
  }
  if(event.kind==='order'){
   const storeId=text(event.storeId,64),orderNo=text(event.orderNo,32),product=text(event.product,100),amountYuan=text(event.amountYuan,24);
   if(!storeId||!/^[A-Za-z0-9_-]{1,32}$/.test(orderNo)||!product||!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(amountYuan)||Number(amountYuan)<=0||typeof window.validateWorkbenchOrder!=='function'||!window.validateWorkbenchOrder(storeId,orderNo))return false;
   try{const rows=JSON.parse(localStorage.getItem('xiaola-saas-orders-v1')||'[]');if(!Array.isArray(rows)||rows.some(x=>x.storeId===storeId&&x.orderNo===orderNo))return false;rows.push({storeId,orderNo,product,amountYuan,createdAt:new Date().toISOString()});localStorage.setItem('xiaola-saas-orders-v1',JSON.stringify(rows));return true}catch{return false}
  }
  if(event.kind==='supplier'){
   const id=text(event.id,32),name=text(event.name,80);if(!/^[A-Za-z0-9_-]{1,32}$/.test(id)||!name)return false;
   const rows=read('suppliers');if(rows.some(x=>x.id===id))return false;rows.push({id,name,createdAt:new Date().toISOString()});return write('suppliers',rows);
  }
  if(event.kind==='template'){
   const name=text(event.name,80),entries=Array.isArray(event.entries)?event.entries:[];if(!name||!entries.length||entries.length>20)return false;
   const suppliers=read('suppliers'),ids=new Set(),normalized=[];let sum=0;
   for(const row of entries){const id=text(row.id,32),percentage=text(row.percentage,6);if(ids.has(id)||!suppliers.some(s=>s.id===id)||!/^(?:100|[0-9]{1,2})(?:\.\d{1,2})?$/.test(percentage))return false;const bp=Math.round(Number(percentage)*100);if(bp<=0||bp>10000)return false;ids.add(id);sum+=bp;normalized.push({id,percentage});}
   if(sum<=0||sum>10000)return false;const rows=read('templates');rows.push({name,entries:normalized,createdAt:new Date().toISOString()});return write('templates',rows);
  }
  if(event.kind==='evidence'){
   const storeId=text(event.storeId,64),orderId=text(event.orderId,64),category=text(event.category,16),state=text(event.state,80),reference=text(event.reference,80);if(!storeId||!orderId||!['payment','refund','invoice','split'].includes(category)||!state)return false;
   const rows=read('evidence');rows.unshift({storeId,orderId,category,state,reference,source:'本次测试调用',time:new Date().toISOString()});return write('evidence',rows.slice(0,500));
  }
  return false;
 }
 function findPayment(storeId,orderId){return read('payments').find(x=>x.storeId===storeId&&x.orderId===orderId)||null}
 const ready=(async()=>{try{const response=await fetch('api/workbench/state',{cache:'no-store'}),data=await response.json();if(!response.ok||!data.ok)throw Error('数据库不可用');
  const localOrders=JSON.parse(localStorage.getItem('xiaola-saas-orders-v1')||'[]');const merged=Array.isArray(localOrders)?localOrders:[];for(const row of data.orders||[]){const i=merged.findIndex(x=>x.storeId===row.storeId&&x.orderNo===row.orderNo);if(i<0)merged.push(row);else merged[i]=row}localStorage.setItem('xiaola-saas-orders-v1',JSON.stringify(merged));
  for(const row of merged.slice(0,100))if(!(data.orders||[]).some(x=>x.storeId===row.storeId&&x.orderNo===row.orderNo)){try{await fetch('api/workbench/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'order',storeId:row.storeId,orderNo:row.orderNo,product:row.product,amountYuan:row.amountYuan})})}catch{}}
  const payments=read('payments');for(const row of data.payments||[]){const i=payments.findIndex(x=>x.storeId===row.storeId&&x.orderId===row.orderId);if(i<0)payments.push(row);else payments[i]=row}write('payments',payments);return true
 }catch{return false}})();
 async function refresh(){try{const response=await fetch('api/workbench/state',{cache:'no-store'}),data=await response.json();if(!response.ok||!data.ok)return false;const rows=read('payments');for(const row of data.payments||[]){const i=rows.findIndex(x=>x.storeId===row.storeId&&x.orderId===row.orderId);if(i<0)rows.push(row);else rows[i]=row}write('payments',rows);return true}catch{return false}}
 window.XiaoLaWorkbench={read,save,findPayment,ready,refresh};
 window.addEventListener('xiaola:workbench-event',async e=>{const event=e.detail;let saved=false;if(event?.kind==='refresh'){saved=await refresh()}else if(['order','payment'].includes(event?.kind)){try{if(!await ready)throw Error('数据库不可用');if(event.kind==='order'&&(typeof window.validateWorkbenchOrder!=='function'||!window.validateWorkbenchOrder(event.storeId,event.orderNo)))throw Error('订单已存在');const response=await fetch('api/workbench/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)}),result=await response.json();saved=response.ok&&result.ok;if(saved)save(event)}catch{saved=false}}else saved=save(event);window.XiaoLa?.ackAction?.(event?.requestId||'',saved);window.dispatchEvent(new CustomEvent('xiaola:workbench-changed',{detail:{kind:event?.kind,saved,event}}))});
})();
