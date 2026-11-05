"""Minimal demo workbench persistence; PostgreSQL on the server, SQLite locally."""
import json,re,sqlite3,subprocess,time
from pathlib import Path
from contextlib import closing

class WorkbenchStore:
 def __init__(self,path,pg_config=None):
  self.path=Path(path);self.pg_config=Path(pg_config) if pg_config else None
  self.pg=bool(self.pg_config and self.pg_config.is_file())
  self._run('CREATE TABLE IF NOT EXISTS xa_orders (store_id TEXT NOT NULL, order_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(store_id,order_id))')
  self._run('CREATE TABLE IF NOT EXISTS xa_payments (store_id TEXT NOT NULL, order_id TEXT NOT NULL, merchant_no TEXT NOT NULL, terminal_no TEXT NOT NULL, merchant_order_no TEXT NOT NULL, amount_fen TEXT NOT NULL, state TEXT NOT NULL, platform_order_no TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(store_id,order_id))')
  self._run('CREATE TABLE IF NOT EXISTS xa_sessions (session_id TEXT PRIMARY KEY, updated BIGINT NOT NULL, payload TEXT NOT NULL)')
  self._run('CREATE TABLE IF NOT EXISTS xa_mcp_calls (call_id TEXT PRIMARY KEY, tool TEXT NOT NULL, state TEXT NOT NULL, started BIGINT NOT NULL, payload TEXT NOT NULL)')
 def audit_redact(self,value,depth=0):
  if depth>12:return '[嵌套过深]'
  if isinstance(value,dict):
   hidden=re.compile(r'password|secret|token|authorization|private.?key|plaintext|account|id.?card|identity|mobile|phone|email|user.?id|request.?ip|terminal.?ip|auth.?code|counter_url|file_url|buyer|seller|address|api.?key',re.I)
   # 步骤1：按本地排障要求保留响应明文，其他字段继续使用原有脱敏规则。
   return {str(k):(v if str(k)=='response_plaintext' else '[已隐藏]' if hidden.search(str(k)) else self.audit_redact(v,depth+1)) for k,v in list(value.items())[:100]}
  if isinstance(value,list):return [self.audit_redact(x,depth+1) for x in value[:100]]
  if isinstance(value,str):
   value=re.sub(r'https?://\S+','[链接已隐藏]',value,flags=re.I);value=re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}','[邮箱已隐藏]',value);value=re.sub(r'Bearer\s+\S+','Bearer [已隐藏]',value,flags=re.I);return value[:4000]
  return value if value is None or isinstance(value,(int,float,bool)) else '[不支持的数据类型]'
 def audit_start(self,call_id,tool,args):
  if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',call_id) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',tool):raise ValueError('调用标识无效')
  started=int(time.time()*1000);row={'call_id':call_id,'tool':tool,'state':'started','started_ms':started,'request':self.audit_redact(args)}
  self._run('INSERT INTO xa_mcp_calls (call_id,tool,state,started,payload) VALUES (?,?,?,?,?)',(call_id,tool,'started',started,json.dumps(row,ensure_ascii=True,separators=(',',':'))))
 def audit_get(self,call_id):
  rows=self._run('SELECT payload FROM xa_mcp_calls WHERE call_id=?',(call_id,));return json.loads(rows[0]) if rows else None
 def audit_list(self):
  return [json.loads(x) for x in self._run('SELECT payload FROM xa_mcp_calls ORDER BY started DESC LIMIT 100')]
 def audit_recover(self):
  rows=self._run('SELECT payload FROM xa_mcp_calls WHERE state=?',('started',))
  for raw in rows:
   row=json.loads(raw);self.audit_finish(row['call_id'],'unknown',{'message':'服务重启，原调用结果未知'},max(0,int(time.time()*1000)-row['started_ms']))
 def audit_finish(self,call_id,state,response,duration_ms):
  if state not in ('returned','failed','unknown'):raise ValueError('调用状态无效')
  row=self.audit_get(call_id)
  if not row or row['state']!='started':raise ValueError('调用记录不存在或已完成')
  row.update({'state':state,'completed_ms':int(time.time()*1000),'duration_ms':max(0,int(duration_ms)),'response':self.audit_redact(response)})
  return bool(self._run('UPDATE xa_mcp_calls SET state=?,payload=? WHERE call_id=? AND state=? RETURNING payload',(state,json.dumps(row,ensure_ascii=True,separators=(',',':')),call_id,'started')))
 def _run(self,sql,params=()):
  if not self.pg:
   with closing(sqlite3.connect(str(self.path),timeout=10)) as db:
    with db:
     cur=db.execute(sql,params);return [x[0] for x in cur.fetchall()] if cur.description else []
  cfg=json.loads(self.pg_config.read_text(encoding='utf-8'));conn=cfg['connection']
  if not isinstance(conn,str) or len(conn)>500 or '\n' in conn:raise ValueError('数据库配置无效')
  def quote(v):return "'"+str(v).replace("'","''")+"'"
  pieces=sql.split('?')
  if len(pieces)!=len(params)+1:raise ValueError('参数数量无效')
  wire=pieces[0]+''.join(quote(v)+tail for v,tail in zip(params,pieces[1:]))+';\n'
  proc=subprocess.run(['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d',conn],input=wire,text=True,encoding='utf-8',capture_output=True,timeout=15)
  if proc.returncode:raise RuntimeError('工作台数据库操作失败')
  return [x for x in proc.stdout.splitlines() if x]
 def snapshot(self):
  return {k:[json.loads(x) for x in self._run('SELECT payload FROM '+table+' ORDER BY '+order+' LIMIT 500')] for k,table,order in [('orders','xa_orders','order_id'),('payments','xa_payments','order_id'),('sessions','xa_sessions','updated DESC')]}
 def reconcile_payment(self,args,data):
  if not isinstance(args,dict) or not isinstance(data,dict) or data.get('code')!='000000':return False
  detail=data.get('resp_data');
  if not isinstance(detail,dict) or str(detail.get('order_status'))!='2' or detail.get('out_order_no')!=args.get('out_order_no') or detail.get('merchant_no')!=args.get('merchant_no') or (detail.get('term_no') and detail['term_no']!=args.get('term_no')):return False
  rows=self._run('SELECT payload FROM xa_payments WHERE merchant_no=? AND terminal_no=? AND merchant_order_no=?',(args.get('merchant_no',''),args.get('term_no',''),args.get('out_order_no','')))
  if len(rows)!=1:return False
  row=json.loads(rows[0]);amount=str(detail.get('total_amount',''))
  if amount!=row['amountFen']:return False
  records=detail.get('order_trade_info_list',[]);matches=[x for x in records if isinstance(x,dict) and x.get('trade_type')=='PAY' and x.get('trade_status')=='S' and str(x.get('trade_amount'))==amount and isinstance(x.get('trade_no'),str) and re.fullmatch(r'[A-Za-z0-9_-]{1,64}',x['trade_no'])] if isinstance(records,list) else []
  trace=matches[0]['trade_no'] if len(matches)==1 else ''
  return self.save({'kind':'payment',**row,'state':'paid','tradeNo':trace,'platformOrderNo':str(detail.get('pay_order_no') or row.get('platformOrderNo') or '')})
 def save(self,event):
  if not isinstance(event,dict):raise ValueError('请求无效')
  kind=event.get('kind');now=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
  def value(k,n=64):
   v=event.get(k,'');return v.strip()[:n] if isinstance(v,str) else ''
  def identifier(v):return bool(re.fullmatch(r'[A-Za-z0-9_-]{1,64}',v))
  def packed(obj):return json.dumps(obj,ensure_ascii=True,separators=(',',':'))
  if kind=='order':
   store,order,product,amount=value('storeId'),value('orderNo',32),value('product',100),value('amountYuan',24)
   if not identifier(store) or not identifier(order) or not product or not re.fullmatch(r'(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?',amount) or float(amount)<=0:raise ValueError('订单信息无效')
   obj={'storeId':store,'orderNo':order,'product':product,'amountYuan':amount,'createdAt':now}
   return bool(self._run('INSERT INTO xa_orders (store_id,order_id,payload) VALUES (?,?,?) ON CONFLICT(store_id,order_id) DO NOTHING RETURNING payload',(store,order,packed(obj))))
  if kind=='payment':
   store,order,merchant,terminal,no,amount,state,platform=(value('storeId'),value('orderId',32),value('merchantNo',32),value('terminalNo',16),value('merchantOrderNo',32),value('amountFen',12),value('state',16),value('platformOrderNo',64))
   if not all(identifier(x) for x in (store,order,merchant,terminal,no)) or not re.fullmatch(r'[1-9]\d{0,11}',amount) or state not in ('intent','created','paid','unknown') or (platform and not identifier(platform)):raise ValueError('支付映射无效')
   trade=value('tradeNo',64)
   if trade and not identifier(trade):raise ValueError('支付流水无效')
   obj={'storeId':store,'orderId':order,'merchantNo':merchant,'terminalNo':terminal,'merchantOrderNo':no,'amountFen':amount,'state':state,'platformOrderNo':platform,'tradeNo':trade,'time':now}
   sql="INSERT INTO xa_payments (store_id,order_id,merchant_no,terminal_no,merchant_order_no,amount_fen,state,platform_order_no,payload) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(store_id,order_id) DO UPDATE SET state=excluded.state,platform_order_no=CASE WHEN excluded.platform_order_no='' THEN xa_payments.platform_order_no ELSE excluded.platform_order_no END,payload=excluded.payload WHERE xa_payments.merchant_no=excluded.merchant_no AND xa_payments.terminal_no=excluded.terminal_no AND xa_payments.merchant_order_no=excluded.merchant_order_no AND xa_payments.amount_fen=excluded.amount_fen AND excluded.state<>'intent' AND (xa_payments.state<>'paid' OR excluded.state='paid') RETURNING payload"
   # Preserve a previously returned platform ID in both the row and the JSON projection.
   existing=[json.loads(x) for x in self._run('SELECT payload FROM xa_payments WHERE store_id=? AND order_id=?',(store,order))]
   if existing:
    obj['platformOrderNo']=platform or existing[0].get('platformOrderNo','');obj['tradeNo']=trade or existing[0].get('tradeNo','')
   return bool(self._run(sql,(store,order,merchant,terminal,no,amount,state,platform,packed(obj))))
  if kind=='session':
   sid=value('id',64);title=value('title',80);entries=event.get('chatEntries',[]);updated=event.get('time')
   if not identifier(sid) or not isinstance(updated,int) or isinstance(updated,bool) or not 0<updated<100000000000000 or not isinstance(entries,list):raise ValueError('会话信息无效')
   def redact(v):
    v=re.sub(r'https?://\S+','[链接未保存]',v,flags=re.I);v=re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}','[邮箱已隐藏]',v);return re.sub(r'(?<![A-Za-z0-9])\d{11,}(?![A-Za-z0-9])','[敏感数字已隐藏]',v)[:2000]
   obj={'id':sid,'title':redact(title),'time':updated,'chatEntries':[{'text':redact(x['text']),'user':x.get('user') is True} for x in entries[-100:] if isinstance(x,dict) and isinstance(x.get('text'),str)]}
   return bool(self._run('INSERT INTO xa_sessions (session_id,updated,payload) VALUES (?,?,?) ON CONFLICT(session_id) DO UPDATE SET updated=excluded.updated,payload=excluded.payload WHERE xa_sessions.updated<=excluded.updated RETURNING payload',(sid,updated,packed(obj))))
  raise ValueError('不支持的记录类型')
