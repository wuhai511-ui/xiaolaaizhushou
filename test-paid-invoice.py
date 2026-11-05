import unittest,tempfile,json,threading
from http.client import HTTPConnection
from unittest.mock import patch
from pathlib import Path
import server
class PaidInvoiceTests(unittest.TestCase):
 def setUp(self):
  self.payment={'merchant_no':'M1','term_no':'T1','out_order_no':'O1','total_amount':'1230'}
  self.invoice={'invoice_type':'BLUE','invoice_amount':'12.30','merchant_no':'I1','invoice_request_id':'I-1','request_id':'R-1'}
  self.data={'code':'000000','resp_data':{'order_status':'2','merchant_no':'M1','term_no':'T1','out_order_no':'O1','total_amount':'1230','order_trade_info_list':[{'trade_no':'TR-1','trade_type':'PAY','trade_status':'S','trade_amount':'1230','payer_name':'PRIVATE'}]}}
 def test_verified_query_and_trade_mapping(self):
  self.invoice['trade_no_list']=[{'transaction_serial_number':'TR-1','out_trade_no':'EXT','pay_type':'01'}]
  with patch.object(server,'upstream_rpc',return_value={'structuredContent':self.data}):
   self.assertEqual(server.verify_invoice_payment(self.payment,self.invoice)['out_order_no'],'O1')
   self.invoice['trade_no_list'][0]['transaction_serial_number']='WRONG'
   with self.assertRaises(ValueError):server.verify_invoice_payment(self.payment,self.invoice)
 def test_reject_unpaid_and_amount_mismatch(self):
  with patch.object(server,'upstream_rpc',return_value={'structuredContent':self.data}) as call:
   self.invoice['invoice_amount']='12.31'
   with self.assertRaises(ValueError):server.verify_invoice_payment(self.payment,self.invoice)
   call.assert_not_called();self.invoice['invoice_amount']='12.30';self.data['resp_data']['order_status']='1'
   with self.assertRaises(ValueError):server.verify_invoice_payment(self.payment,self.invoice)
 def test_duplicate_invoice_is_blocked_durably(self):
  with tempfile.TemporaryDirectory() as tmp, patch.object(server,'__file__',str(Path(tmp)/'server.py')):
   server.reserve_paid_invoice(self.invoice,self.payment)
   with self.assertRaises(ValueError):server.reserve_paid_invoice(self.invoice,self.payment)
   self.invoice['invoice_request_id']='I-2'
   with self.assertRaises(ValueError):server.reserve_paid_invoice(self.invoice,self.payment)
 def test_prepare_requires_confirmation_and_does_not_issue_invoice(self):
  with patch.object(server,'upstream_rpc',return_value={'structuredContent':self.data}) as call,patch.object(server,'discover_tools',return_value=[{'name':'lqInvoiceCreate','inputSchema':{'required':['invoice_request_id']},'annotations':{'readOnlyHint':True}}]):
   prep=server.prepare_paid_invoice(self.payment,self.invoice)
   self.assertTrue(prep['requires_confirmation']);self.assertEqual(call.call_count,1);self.assertEqual(server.consume_tool_ticket(prep['ticket'])[2],self.payment)
 def test_paid_invoice_http_confirmation_and_duplicate(self):
  http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);threading.Thread(target=http.serve_forever,daemon=True).start()
  def post(path,body):
   conn=HTTPConnection('127.0.0.1',http.server_port,timeout=5);conn.request('POST',path,json.dumps(body),{'Host':'127.0.0.1:8098','Origin':'http://127.0.0.1:8098','Content-Type':'application/json'});r=conn.getresponse();data=json.loads(r.read());conn.close();return r.status,data
  names=[]
  def upstream(method,params):
   names.append(params['name'])
   return {'structuredContent':self.data} if params['name']=='jiaofeiyiOrderQuery' else {'structuredContent':{'code':'000000','resp_data':{'status':'PROCESSING'}}}
  try:
   with tempfile.TemporaryDirectory() as tmp,patch.object(server,'__file__',str(Path(tmp)/'server.py')),patch.object(server,'upstream_rpc',side_effect=upstream),patch.object(server,'discover_tools',return_value=[{'name':'lqInvoiceCreate','inputSchema':{'required':['invoice_request_id']}}]):
    status,prep=post('/api/invoice/prepare',{'payment':self.payment,'arguments':self.invoice});self.assertEqual(status,200);self.assertTrue(prep['requires_confirmation']);self.assertEqual(names,['jiaofeiyiOrderQuery'])
    status,result=post('/api/mcp/execute',{'ticket':prep['ticket']});self.assertEqual(status,200);self.assertEqual(result['data']['resp_data']['status'],'PROCESSING');self.assertEqual(names.count('lqInvoiceCreate'),1)
    status,prep=post('/api/invoice/prepare',{'payment':self.payment,'arguments':self.invoice});status,result=post('/api/mcp/execute',{'ticket':prep['ticket']});self.assertEqual(status,400);self.assertEqual(result['outcome'],'not_started');self.assertEqual(names.count('lqInvoiceCreate'),1)
  finally:http.shutdown();http.server_close()
 def test_safe_query_omits_payer_data(self):
  result=server.safe_tool_result('jiaofeiyiOrderQuery',{'result':{'structuredContent':self.data}},1)['result']['structuredContent']
  t=result['resp_data']['order_trade_info_list'][0];self.assertEqual(t['trade_no'],'TR-1');self.assertNotIn('payer_name',t)
if __name__=='__main__':unittest.main()
