/* Configure with window.XiaoLaConfig before loading this script. No secrets. */
function cleanInvoiceDraft(raw){
 const clean=v=>typeof v==='string'?v.trim().slice(0,128):'';if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 const pick=(obj,keys)=>{const o={};if(obj&&typeof obj==='object'&&!Array.isArray(obj))for(const k of keys){const v=obj[k];if(typeof v==='string'&&clean(v))o[k]=clean(v);else if(typeof v==='number'&&Number.isSafeInteger(v))o[k]=v;else if(typeof v==='boolean')o[k]=v}return o};
 const out=pick(raw,['merchant_no','channel','invoice_kind','invoice_type','product_type','invoice_request_id','request_id','invoice_amount','tax_rate','tax_category_code','trade_pay_type']);
 for(const [key,keys] of Object.entries({buyer:['name','tax_no','address','bank_account','bank_name','email','mobile_phone','telephone'],seller:['address','bank_account','bank_name','phone']})){const v=pick(raw[key],keys);if(Object.keys(v).length)out[key]=v}
 if(Array.isArray(raw.items))out.items=raw.items.slice(0,10).map(x=>pick(x,['line_no','goods_name','tax_category_code','tax_rate','discount_type','preferential_policy','gross_amount','quantity','unit_price','unit','specification']));if(Array.isArray(raw.trade_no_list))out.trade_no_list=raw.trade_no_list.slice(0,10).map(x=>pick(x,['out_trade_no','pay_type','transaction_serial_number']));return out;
}

(() => {
  const script = document.currentScript;
  const base = new URL('.', script.src);
  const origin = base.origin;
  const config = window.XiaoLaConfig || {};
  if (document.getElementById('xiaola-widget-frame')) return;
  const number = (value, fallback, max) => Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
  const x = number(config.offsetX, 16, 200), y = number(config.offsetY, 12, 200);
  const title = typeof config.title === 'string' ? config.title.slice(0, 30) : '小拉 · 业务助手';
  const url = new URL('xiaola-widget.html', base);
  url.searchParams.set('v', '50');
  url.searchParams.set('title', title);
  if(config.randomActions === false) url.searchParams.set('random', '0');
  const frame = document.createElement('iframe');
  let openWidth=740, openHeight=640;
  if(config.position === 'left') url.searchParams.set('position','left');
  frame.id = 'xiaola-widget-frame';
  frame.title = title;
  frame.src = url.href;
  frame.style.cssText = 'position:fixed;width:112px;height:124px;border:0;z-index:9999;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);background:transparent';
  frame.style[config.position === 'left' ? 'left' : 'right'] = x + 'px';
  frame.style.bottom = y + 'px';
  let frameLoaded=false,pendingRecord=null,pendingBusiness=null,pendingAction=null;
  frame.addEventListener('load',()=>{
    frameLoaded=true;
    const clean=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
    const pay=config.businessContext?.jiaofeiyi||{},invoice=config.businessContext?.dianpiaotong||{};
    frame.contentWindow?.postMessage({type:'xiaola:context',jiaofeiyi:{merchantNo:clean(pay.merchantNo||config.merchantNo,32),terminalNo:clean(pay.terminalNo||config.terminalNo,16)},dianpiaotong:{merchantNo:clean(invoice.merchantNo,32),channel:clean(invoice.channel,16)}},origin);
    if(pendingRecord)frame.contentWindow?.postMessage({type:'xiaola:record',record:pendingRecord},origin);
    if(pendingBusiness)frame.contentWindow?.postMessage({type:'xiaola:business-record',record:pendingBusiness},origin);
    if(pendingAction){frame.contentWindow?.postMessage({type:'xiaola:workbench-action',action:pendingAction},origin);pendingAction=null;}
  });
  if(document.body)document.body.appendChild(frame);
  else document.addEventListener('DOMContentLoaded',()=>document.body.appendChild(frame),{once:true});
  const send = (type, name, extra = {}) => frame.contentWindow?.postMessage({type, name, ...extra}, origin);
  window.XiaoLa = {
    play: name => send('xiaola:play', name),
    setState: name => send('xiaola:state', name),
    dispatch: name => send('xiaola:dispatch', name),
    banner: open => send('xiaola:banner', '', {open: !!open}),
    openRecord: record => {
      if(!record||typeof record!=='object')return;
      pendingBusiness=null;
      const clean=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
      const pay=record.businessContext?.jiaofeiyi||{},invoice=record.businessContext?.dianpiaotong||{};
      pendingRecord={storeId:clean(record.storeId,64),recordId:clean(record.recordId,64),storeName:clean(record.storeName,80),label:clean(record.label,100),orderNo:clean(record.orderNo,64),amountYuan:clean(record.amountYuan,24),businessContext:{jiaofeiyi:{merchantNo:clean(pay.merchantNo,32),terminalNo:clean(pay.terminalNo,16)},dianpiaotong:{merchantNo:clean(invoice.merchantNo,32),channel:clean(invoice.channel,16)}}};
      if(frameLoaded)send('xiaola:record','',{record:pendingRecord});
    },
    open: options => {
      if(!options||typeof options!=='object')return;
      const clean=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
      const orderId=clean(options.orderId,64);if(!orderId)return;
      const raw=options.payment&&typeof options.payment==='object'?options.payment:{};
      const type=['tradeNo','cashierOrderNo','merchantOrderNo'].includes(raw.type)?raw.type:'';
      const payment=type&&clean(raw.id,64)?{type,id:clean(raw.id,64),product:clean(raw.product,32),state:clean(raw.state,16),tradeNo:clean(raw.tradeNo,64)}:null;
      const items=Array.isArray(options.items)?options.items.slice(0,10).filter(x=>x&&typeof x==='object').map(x=>({name:clean(x.name,100),quantity:clean(x.quantity,24),amountYuan:clean(x.amountYuan,24)})):[];
      const pay=options.businessContext?.jiaofeiyi||{},invoice=options.businessContext?.dianpiaotong||{};
      pendingRecord=null;pendingBusiness={orderId,invoice:cleanInvoiceDraft(options.invoice),action:['prepareJiaofeiyiCashier','queryJiaofeiyiPayment','preparePaidInvoice'].includes(options.action)?options.action:'',promptForConfirmation:options.action==='prepareJiaofeiyiCashier'&&options.promptForConfirmation===true,amountYuan:clean(options.amountYuan,24),items,payment,storeId:clean(options.storeId,64),recordId:clean(options.recordId,64),storeName:clean(options.storeName,80),label:clean(options.label,100),businessContext:{jiaofeiyi:{merchantNo:clean(pay.merchantNo,32),terminalNo:clean(pay.terminalNo,16)},dianpiaotong:{merchantNo:clean(invoice.merchantNo,32),channel:clean(invoice.channel,16)}}};
      if(frameLoaded)send('xiaola:business-record','',{record:pendingBusiness});
    },
    openAction: action=>{if(!action||typeof action!=='object'||!['order_add','supplier_add','template_add','member_open','balance','withdraw','split_rules'].includes(action.type))return;pendingAction={type:action.type,orderId:typeof action.orderId==='string'?action.orderId.slice(0,32):'',id:typeof action.id==='string'?action.id.slice(0,32):'',name:typeof action.name==='string'?action.name.slice(0,80):'',suppliers:Array.isArray(action.suppliers)?action.suppliers.slice(0,20).map(s=>({id:String(s.id||'').slice(0,32),name:String(s.name||'').slice(0,80)})):[]};if(frameLoaded){send('xiaola:workbench-action','',{action:pendingAction});pendingAction=null}},
    ackAction:(requestId,saved)=>{if(typeof requestId==='string'&&requestId.length<100)send('xiaola:workbench-ack','',{requestId,saved:saved===true})},
    clearRecord:()=>{pendingRecord=null;pendingBusiness=null;if(frameLoaded)send('xiaola:clear-record','')}

  };
  let dragStart=null;
  window.addEventListener('message', e => {
    if (e.origin !== origin || e.source !== frame.contentWindow) return;
    if(e.data?.type === 'xiaola:workbench-event'){window.dispatchEvent(new CustomEvent('xiaola:workbench-event',{detail:e.data.event}));}
    else if(e.data?.type === 'xiaola-drag-start') {
      const rect=frame.getBoundingClientRect(); dragStart={x:rect.left,y:rect.top};
    } else if(e.data?.type === 'xiaola-drag' && dragStart && Number.isFinite(e.data.dx) && Number.isFinite(e.data.dy)) {
      const left=Math.max(0,Math.min(window.innerWidth-112,dragStart.x+e.data.dx));
      const top=Math.max(0,Math.min(window.innerHeight-124,dragStart.y+e.data.dy));
      frame.style.left=left+'px'; frame.style.top=top+'px'; frame.style.right='auto'; frame.style.bottom='auto';
    } else if(e.data?.type === 'xiaola-dimensions' && Number.isFinite(e.data.width) && Number.isFinite(e.data.height)) {
      openWidth=Math.round(Math.max(300,Math.min(800,e.data.width)));
      openHeight=Math.round(Math.max(360,Math.min(900,e.data.height)));
      frame.style.width=openWidth+'px'; frame.style.height=openHeight+'px';
    } else if(e.data?.type === 'xiaola-resize') {
      if(e.data.open && dragStart) {const rect=frame.getBoundingClientRect();frame.style.left=Math.max(0,Math.min(window.innerWidth-openWidth,rect.left))+'px';frame.style.top=Math.max(0,Math.min(window.innerHeight-openHeight,rect.top))+'px';}
      frame.style.width = e.data.open ? openWidth+'px' : '112px';
      frame.style.height = e.data.open ? openHeight+'px' : '124px';
    }
  });
})();
