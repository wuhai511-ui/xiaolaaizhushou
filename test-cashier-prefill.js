const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('xiaola-chat.js','utf8');
const start=code.indexOf(' async function prepareCashierFromRecord(version,promptForConfirmation=false){');
const end=code.indexOf(' const originalBusinessRecord=',start);
assert(start>=0&&end>start);
const fields={};for(const k of ['out_order_no','order_info','total_amount','merchant_no','term_no','order_efficient_time'])fields[k]={value:''};
fields.merchant_no.value='configured-merchant';fields.term_no.value='configured-terminal';
const error={hidden:true,textContent:''},calls=[],form={requestSubmit(){calls.push('submit')}};
const context={epoch:1,selected:null,currentRecord:{externalOrderNo:'SAAS-123',amountYuan:'12.30',items:[{name:'测试商品'}]},line:s=>calls.push(s),openLegacy:async name=>{calls.push(name);context.selected={name}},q:s=>s==='#connection-error'?error:s==='#business-form'?form:{querySelector:sel=>{const match=sel.match(/data-key="([^"]+)"/);return match?fields[match[1]]:null}},BigInt};
vm.createContext(context);vm.runInContext(code.slice(start,end),context);
(async()=>{await context.prepareCashierFromRecord(1);assert.equal(calls[1],'jiaofeiyiCashierPay');assert.equal(fields.out_order_no.value,'SAAS-123');assert.equal(fields.order_info.value,'测试商品');assert.equal(fields.total_amount.value,'1230');assert.match(fields.order_efficient_time.value,/^\d{14}$/);const expected=new Date(Date.now()+32*3600000).toISOString().replace(/[-:T.Z]/g,'').slice(0,12);assert.equal(fields.order_efficient_time.value.slice(0,12),expected);assert.match(error.textContent,/已带入已配置的缴费易商户号和终端号/);assert.match(error.textContent,/确认/);await context.prepareCashierFromRecord(1,true);assert.equal(calls.at(-1),'submit');fields.term_no.value='';const count=calls.length;await context.prepareCashierFromRecord(1,true);assert.equal(calls.length,count+2);assert.match(error.textContent,/还需填写缴费易终端号/);assert.equal(error.hidden,false);console.log('cashier intent, prefill, integer-cent conversion and confirmation guidance passed')})().catch(e=>{console.error(e);process.exitCode=1});

