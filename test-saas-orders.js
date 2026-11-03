const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.handlers={};this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.dataset={};}
 addEventListener(name,fn){this.handlers[name]=fn} append(...xs){this.children.push(...xs)} replaceChildren(...xs){this.children=[...xs]} setAttribute(k,v){this[k]=v}
 showModal(){this.open=true} close(){this.open=false} reset(){for(const k of ['#new-order-no','#new-product','#new-amount'])this.owner[k].value=''}
}
const script=fs.readFileSync('saas.js','utf8'),storage=new Map(),opens=[];
function build(){
 const ids=['industry','demo-store','order-rows','order-count','order-search','add-order','order-dialog','order-form','order-error','storage-hint','order-hint','new-order-no','new-product','new-amount','order-close','order-cancel'];
 const elements={};for(const id of ids)elements['#'+id]=new Element();elements['#order-form'].owner=elements;
 const doc={querySelector:s=>{if(!elements[s])throw Error('Unknown selector '+s);return elements[s]},createElement:t=>new Element(t)};
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const data={ok:true,store:{id:'store-a',name:'演示门店'},stores:[{id:'store-a',name:'演示门店'}],businessContext:{},records:[{id:'record-1',orderNo:'TEST-1',amountYuan:'0.03',label:'测试记录',payment:{type:'merchantOrderNo',id:'TEST-1',product:'jiaofeiyi'}}]};
 const ctx={document:doc,location:{search:''},URLSearchParams,localStorage,sessionStorage:{getItem:()=>null,setItem:()=>{}},window:{XiaoLa:{open:x=>opens.push(x),clearRecord:()=>{}}},fetch:async()=>({ok:true,json:async()=>data}),FormData:class{get(k){return {'orderNo':elements['#new-order-no'].value,'product':elements['#new-product'].value,'amount':elements['#new-amount'].value}[k]}},console};vm.createContext(ctx);vm.runInContext(script,ctx);return elements;
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{let e=build();await tick();assert.equal(e['#order-count'].textContent,'1');e['#add-order'].handlers.click();assert.equal(e['#order-dialog'].open,true);e['#new-order-no'].value='TEST-1';e['#new-product'].value='服务费';e['#new-amount'].value='12.30';e['#order-form'].handlers.submit({preventDefault(){}});assert.match(e['#order-error'].textContent,/已存在/);assert.equal(opens.length,0);
e['#new-order-no'].value='SAAS-NEW-1';e['#order-form'].handlers.submit({preventDefault(){}});assert.equal(opens.length,1);assert.equal(opens[0].orderId,'SAAS-NEW-1');assert.equal(opens[0].action,'prepareJiaofeiyiCashier');assert.equal(opens[0].promptForConfirmation,true);assert.equal(opens[0].items[0].name,'服务费');assert.equal(opens[0].amountYuan,'12.30');assert.equal(opens[0].payment,null);assert.equal(opens[0].recordId,undefined);assert.equal(e['#order-count'].textContent,'2');assert.equal(e['#order-dialog'].open,false);
e['#order-search'].value='不存在';e['#order-search'].handlers.input();assert.equal(e['#order-hint'].textContent,'筛选结果 0 条');e=build();await tick();assert.equal(e['#order-count'].textContent,'2');assert.equal(e['#order-rows'].children[0].children[0].children[0].textContent,'SAAS-NEW-1');console.log('order creation, duplicate check, widget context, filtering and browser-storage restore passed');})().catch(e=>{console.error(e);process.exitCode=1});
