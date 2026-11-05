(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.XiaoLaSchema=factory()})(globalThis,()=>{
 function cleanInvoiceDraft(raw){
 const clean=v=>typeof v==='string'?v.trim().slice(0,128):'';if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 const pick=(obj,keys)=>{const o={};if(obj&&typeof obj==='object'&&!Array.isArray(obj))for(const k of keys){const v=obj[k];if(typeof v==='string'&&clean(v))o[k]=clean(v);else if(typeof v==='number'&&Number.isSafeInteger(v))o[k]=v;else if(typeof v==='boolean')o[k]=v}return o};
 const out=pick(raw,['merchant_no','channel','invoice_kind','invoice_type','product_type','invoice_request_id','request_id','invoice_amount','tax_rate','tax_category_code','trade_pay_type']);
 for(const [key,keys] of Object.entries({buyer:['name','tax_no','address','bank_account','bank_name','email','mobile_phone','telephone'],seller:['address','bank_account','bank_name','phone']})){const v=pick(raw[key],keys);if(Object.keys(v).length)out[key]=v}
 if(Array.isArray(raw.items))out.items=raw.items.slice(0,10).map(x=>pick(x,['line_no','goods_name','tax_category_code','tax_rate','discount_type','preferential_policy','gross_amount','quantity','unit_price','unit','specification']));if(Array.isArray(raw.trade_no_list))out.trade_no_list=raw.trade_no_list.slice(0,10).map(x=>pick(x,['out_trade_no','pay_type','transaction_serial_number']));return out;
}
 function choicesFor(schema){
  if(Array.isArray(schema.enum))return schema.enum;
  if(Object.prototype.hasOwnProperty.call(schema,'const'))return [schema.const];
  if(Array.isArray(schema.anyOf)&&schema.anyOf.every(s=>Object.prototype.hasOwnProperty.call(s,'const')))return schema.anyOf.map(s=>s.const);
  return null;
 }
 function resolveSchema(schema){
  if(!schema||typeof schema!=='object')return {};
  if(schema.type||choicesFor(schema))return schema;
  if(Array.isArray(schema.anyOf)){
   const variants=schema.anyOf.map(resolveSchema);
   const chosen=variants.find(s=>s.type==='object')||variants.find(s=>s.type==='array')||variants.find(s=>s.type)||{};
   return {...schema,...chosen,description:schema.description||chosen.description};
  }
  return schema;
 }
 function safeHistoryResult(value){
  const allowed=new Set(['status','code','signature_verified','order_status','pay_status','trade_state','amount','total_amount','isError','result','resp_data']);
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const output={};
  for(const [key,v] of Object.entries(value))if(allowed.has(key)){
   if(v&&typeof v==='object'&&!Array.isArray(v))output[key]=safeHistoryResult(v);
   else if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')output[key]=typeof v==='string'?v.slice(0,100):v;
  }
  return output;
 }
 function imageFromClipboard(items){for(const item of Array.from(items||[]))if(item.kind==='file'&&['image/png','image/jpeg','image/webp'].includes(item.type))return item.getAsFile();return null}
 function businessDefaults(tool,context){
  const out={},ctx=context||{};
  if(['jiaofeiyiOrderQuery','jiaofeiyiCashierPay','jiaofeiyiCashierRefund'].includes(tool)){
   if(ctx.jiaofeiyi?.merchantNo)out.merchant_no=ctx.jiaofeiyi.merchantNo;
   if(ctx.jiaofeiyi?.terminalNo)out.term_no=ctx.jiaofeiyi.terminalNo;
  }else if(['lqInvoiceQuery','lqInvoiceCreate'].includes(tool)){
   if(ctx.dianpiaotong?.merchantNo)out.merchant_no=ctx.dianpiaotong.merchantNo;
   if(ctx.dianpiaotong?.channel)out.channel=ctx.dianpiaotong.channel;
  }
  return out;
 }
 function canCheckPayment(data,mismatch){return !mismatch&&['order','amount','merchant','terminal'].every(k=>typeof data?.[k]==='string'&&data[k].trim().length>0)}
 return {resolveSchema,choicesFor,safeHistoryResult,imageFromClipboard,businessDefaults,canCheckPayment,cleanInvoiceDraft};
});
