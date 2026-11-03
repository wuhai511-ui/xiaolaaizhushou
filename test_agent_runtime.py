import json, unittest
import tempfile, sqlite3
from contextlib import closing
from unittest.mock import Mock
from agent_runtime import DemoAgent, AgentError
from agent_journal import AgentJournal

def tool(name,required=('id',)):
 return {'name':name,'description':'test','inputSchema':{'type':'object','properties':{'id':{'type':'string'}},'required':list(required)},'annotations':{'readOnlyHint':True}}
def call(name,args,cid='c1'):
 return {'content':None,'tool_calls':[{'id':cid,'type':'function','function':{'name':name,'arguments':json.dumps(args)}}]}
class AgentTests(unittest.TestCase):
 def setUp(self):
  self.items=[tool('jiaofeiyiOrderQuery'),tool('qztMemberOpen'),tool('newReadTool')];self.upstream=Mock(return_value={'structuredContent':{'status':'OK','result':{'state':'ok'}}});self.a=DemoAgent(lambda:self.items,self.upstream,lambda:None,lambda x:x,None,lambda n,a:True)
 def test_multistep_read_then_confirmation_then_resume(self):
  self.a._model=Mock(side_effect=[call('jiaofeiyiOrderQuery',{'id':'1'}),call('qztMemberOpen',{'id':'1'},'c2'),{'content':'完成','tool_calls':[]}])
  r=self.a.turn('','查询后开通',{});self.assertEqual(r['state'],'approval');self.assertEqual(self.upstream.call_count,1)
  done=self.a.approve(r['sessionId'],r['approvalId'],True);self.assertEqual(done['answer'],'完成');self.assertEqual(self.upstream.call_count,2)
  with self.assertRaises(AgentError):self.a.approve(r['sessionId'],r['approvalId'],True)
 def test_unknown_tool_even_readonly_hint_needs_confirmation(self):
  self.a._model=Mock(return_value=call('newReadTool',{'id':'1'}));r=self.a.turn('','测试',{});self.assertEqual(r['state'],'approval');self.upstream.assert_not_called();d=self.a.approve(r['sessionId'],r['approvalId'],False);self.assertEqual(d['trace'],[]);self.upstream.assert_not_called()
 def test_missing_required_never_executes(self):
  self.a._model=Mock(side_effect=[call('qztMemberOpen',{}),{'content':'请提供编号'}]);r=self.a.turn('','开通',{});self.assertIn('编号',r['answer']);self.upstream.assert_not_called()
 def test_failed_write_not_retried(self):
  self.a._model=Mock(return_value=call('qztMemberOpen',{'id':'1'}));self.upstream.side_effect=TimeoutError();r=self.a.turn('','开户',{});done=self.a.approve(r['sessionId'],r['approvalId'],True);self.assertEqual(done['trace'][0]['status'],'unknown');self.assertEqual(self.upstream.call_count,1)
 def test_journal_recovers_started_as_unknown_without_parameters(self):
  with tempfile.TemporaryDirectory() as d:
   j=AgentJournal(d+'/calls.sqlite3');call_id=j.start('qztMemberOpen');self.assertEqual(j.recover(),1)
   with closing(sqlite3.connect(j.path)) as db:row=db.execute('SELECT id,tool,state FROM tool_calls').fetchone()
   self.assertEqual(row,(call_id,'qztMemberOpen','unknown'))
 def test_journal_failure_prevents_dispatch(self):
  self.a.journal=Mock();self.a.journal.start.side_effect=OSError();self.a._model=Mock(return_value=call('jiaofeiyiOrderQuery',{'id':'1'}))
  result=self.a.turn('','查询',{});self.assertEqual(result['trace'][0]['status'],'not_started');self.upstream.assert_not_called()
 def test_batch_stops_at_approval_and_denial_skips_rest(self):
  batch={'tool_calls':[call('jiaofeiyiOrderQuery',{'id':'1'},'a')['tool_calls'][0],call('qztMemberOpen',{'id':'2'},'b')['tool_calls'][0],call('jiaofeiyiOrderQuery',{'id':'3'},'c')['tool_calls'][0]]}
  self.a._model=Mock(return_value=batch);r=self.a.turn('','任务',{});self.assertEqual(r['state'],'approval');self.assertEqual(self.upstream.call_count,1)
  self.a.approve(r['sessionId'],r['approvalId'],False);self.assertEqual(self.upstream.call_count,1)
 def test_batch_resumes_after_approval_in_order(self):
  batch={'tool_calls':[call('qztMemberOpen',{'id':'2'},'b')['tool_calls'][0],call('jiaofeiyiOrderQuery',{'id':'3'},'c')['tool_calls'][0]]}
  self.a._model=Mock(side_effect=[batch,{'content':'完成'}]);r=self.a.turn('','任务',{});self.upstream.assert_not_called()
  done=self.a.approve(r['sessionId'],r['approvalId'],True);self.assertEqual(done['answer'],'完成');self.assertEqual([x.args[1]['name'] for x in self.upstream.call_args_list],['qztMemberOpen','jiaofeiyiOrderQuery'])
 def test_saas_order_cannot_be_silently_used_as_jiaofeiyi_order(self):
  item={'name':'jiaofeiyiOrderQuery','inputSchema':{'type':'object','properties':{'out_order_no':{'type':'string'}},'required':['out_order_no']}}
  self.a.discover=lambda:[item];self.a._model=Mock(side_effect=[call('jiaofeiyiOrderQuery',{'out_order_no':'SAAS-1'}),{'content':'请提供缴费易订单号'}])
  result=self.a.turn('','查一下当前订单',{'currentRecord':{'externalOrderNo':'SAAS-1','payment':None}})
  self.assertIn('订单号',result['answer']);self.upstream.assert_not_called()
 def test_explicit_jiaofeiyi_mapping_can_be_queried(self):
  item={'name':'jiaofeiyiOrderQuery','inputSchema':{'type':'object','properties':{'out_order_no':{'type':'string'}},'required':['out_order_no']}}
  self.a.discover=lambda:[item];self.a._model=Mock(side_effect=[call('jiaofeiyiOrderQuery',{'out_order_no':'SAAS-1'}),{'content':'已查询'}])
  ctx={'currentRecord':{'externalOrderNo':'SAAS-1','payment':{'type':'merchantOrderNo','product':'jiaofeiyi','id':'SAAS-1'}}}
  result=self.a.turn('','查一下当前订单',ctx);self.assertEqual(result['answer'],'已查询');self.assertEqual(self.upstream.call_count,1)
 def test_agent_cannot_invent_a_different_jiaofeiyi_order(self):
  item={'name':'jiaofeiyiOrderQuery','inputSchema':{'type':'object','properties':{'out_order_no':{'type':'string'}},'required':['out_order_no']}}
  self.a.discover=lambda:[item];self.a._model=Mock(side_effect=[call('jiaofeiyiOrderQuery',{'out_order_no':'GUESSED-2'}),{'content':'请提供缴费易订单号'}])
  self.a.turn('','查一下当前订单',{'currentRecord':{'externalOrderNo':'SAAS-1','payment':None}});self.upstream.assert_not_called()
 def test_cashier_id_cannot_be_used_as_trade_no(self):
  item={'name':'openTradeQuery','inputSchema':{'type':'object','properties':{'trade_no':{'type':'string'}},'required':['trade_no']}}
  self.a.discover=lambda:[item];self.a._model=Mock(side_effect=[call('openTradeQuery',{'trade_no':'CASHIER-1'}),{'content':'请提供交易流水号'}])
  ctx={'currentRecord':{'externalOrderNo':'SAAS-1','payment':{'type':'cashierOrderNo','id':'CASHIER-1'}}}
  r=self.a.turn('','查支付状态',ctx);self.assertEqual(r['state'],'done');self.upstream.assert_not_called()
 def test_cashier_id_cannot_be_used_as_out_trade_no(self):
  item={'name':'openTradeQuery','inputSchema':{'type':'object','properties':{'out_trade_no':{'type':'string'}},'required':['out_trade_no']}}
  self.a.discover=lambda:[item];self.a._model=Mock(side_effect=[call('openTradeQuery',{'out_trade_no':'CASHIER-1'}),{'content':'请提供商户交易流水号'}])
  ctx={'currentRecord':{'externalOrderNo':'SAAS-1','payment':{'type':'cashierOrderNo','id':'CASHIER-1'}}}
  r=self.a.turn('','查支付状态',ctx);self.assertEqual(r['state'],'done');self.upstream.assert_not_called()
if __name__=='__main__':unittest.main()
