import tempfile,unittest
from pathlib import Path
from workbench_store import WorkbenchStore
class StoreTests(unittest.TestCase):
 def test_persistent_order_mapping_and_conflict(self):
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/'workbench.sqlite3';a=WorkbenchStore(path);self.assertTrue(a.save({'kind':'order','storeId':'S','orderNo':'O1','product':'物业','amountYuan':'0.10'}));p={'kind':'payment','storeId':'S','orderId':'O1','merchantNo':'M1','terminalNo':'T1','merchantOrderNo':'P1','amountFen':'10','state':'intent'};self.assertTrue(a.save(p));self.assertFalse(a.save(p));self.assertTrue(a.save({**p,'state':'created','platformOrderNo':'L1'}));b=WorkbenchStore(path);self.assertEqual(b.snapshot()['payments'][0]['platformOrderNo'],'L1');self.assertFalse(b.save({**p,'merchantOrderNo':'P2','state':'intent'}));self.assertTrue(b.save({**p,'state':'paid'}));self.assertFalse(b.save({**p,'state':'unknown'}));self.assertEqual(b.snapshot()['orders'][0]['orderNo'],'O1')
 def test_sessions_are_persistent_and_exclude_sensitive_fields(self):
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/'workbench.sqlite3';a=WorkbenchStore(path);self.assertTrue(a.save({'kind':'session','id':'s1','title':'会话','time':1,'chatEntries':[{'text':'联系 abc@example.com https://example.test/secret','user':True}],'secret':'abc'}));row=WorkbenchStore(path).snapshot()['sessions'][0];self.assertNotIn('secret',row);self.assertNotIn('example.com',row['chatEntries'][0]['text']);self.assertNotIn('https:',row['chatEntries'][0]['text'])
 def test_mcp_audit_keeps_business_ids_and_redacts_secrets(self):
  with tempfile.TemporaryDirectory() as d:
   store=WorkbenchStore(Path(d)/'workbench.sqlite3');store.audit_start('CALL1','jiaofeiyiOrderQuery',{'out_order_no':'ORDER1','authorization':'SECRET','buyer':{'email':'a@example.com'}});store.audit_finish('CALL1','returned',{'code':'000000','resp_data':{'out_order_no':'ORDER1','counter_url':'https://example.test/token'}} ,12);row=store.audit_get('CALL1');self.assertEqual(row['request']['out_order_no'],'ORDER1');self.assertNotIn('SECRET',str(row));self.assertNotIn('a@example.com',str(row));self.assertNotIn('example.test',str(row));self.assertEqual(row['response']['code'],'000000');self.assertEqual(row['duration_ms'],12)
 def test_reconcile_persists_verified_trade_without_trusting_browser(self):
  with tempfile.TemporaryDirectory() as d:
   store=WorkbenchStore(Path(d)/'workbench.sqlite3');p={'kind':'payment','storeId':'S','orderId':'O','merchantNo':'M','terminalNo':'T','merchantOrderNo':'JF','amountFen':'10','state':'unknown'};self.assertTrue(store.save(p))
   args={'merchant_no':'M','term_no':'T','out_order_no':'JF'};result={'code':'000000','resp_data':{'merchant_no':'M','term_no':'T','out_order_no':'JF','total_amount':'10','order_status':'2','pay_order_no':'P','order_trade_info_list':[{'trade_type':'PAY','trade_status':'S','trade_amount':'10','trade_no':'TRADE1'}]}}
   self.assertTrue(store.reconcile_payment(args,result));row=store.snapshot()['payments'][0];self.assertEqual(row['state'],'paid');self.assertEqual(row['tradeNo'],'TRADE1');self.assertEqual(row['platformOrderNo'],'P')
   result['resp_data']['total_amount']='11';self.assertFalse(store.reconcile_payment(args,result));self.assertEqual(store.snapshot()['payments'][0]['tradeNo'],'TRADE1')
if __name__=='__main__': unittest.main()
