(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.XiaoLaSchema=factory()})(globalThis,()=>{
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
 return {resolveSchema,choicesFor,safeHistoryResult,imageFromClipboard,businessDefaults,canCheckPayment};
});
