import io
import json
import threading
import unittest
from http.client import HTTPConnection
from unittest.mock import patch
import server

class Response(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *args): self.close()

class Tests(unittest.TestCase):
    def test_workspace_only_marks_payment_number_for_configured_demo(self):
        sample=[{'id':'s1','name':'mapped','jiaofeiyi':{'merchantNo':'m1','terminalNo':'t1'},'records':[{'id':'r1','orderNo':'o1','payment':{'type':'merchantOrderNo','id':'o1','product':'jiaofeiyi'}},{'id':'r3','orderNo':'unmapped'}]}, {'id':'s2','name':'unmapped','records':[{'id':'r2','orderNo':'o2'}]}]
        with patch.object(server,'load_demo_stores',return_value=sample):
            self.assertEqual(server.demo_workspace('s1')['records'][0]['payment'],{'type':'merchantOrderNo','id':'o1','product':'jiaofeiyi'})
            self.assertIsNone(server.demo_workspace('s1')['records'][1]['payment']);self.assertIsNone(server.demo_workspace('s2')['records'][0]['payment'])
    def test_discovery_follows_cursor_and_rejects_duplicates(self):
        one={'name':'a','inputSchema':{}};two={'name':'b','inputSchema':{}}
        with patch.object(server,'upstream_rpc',side_effect=[{'tools':[one],'nextCursor':'next'},{'tools':[two]}]) as rpc:
            self.assertEqual([x['name'] for x in server.discover_tools()],['a','b'])
            self.assertEqual(rpc.call_args_list[1].args,('tools/list',{'cursor':'next'}))
        with patch.object(server,'upstream_rpc',side_effect=[{'tools':[one],'nextCursor':'next'},{'tools':[one]}]):
            with self.assertRaises(ValueError):server.discover_tools()
    def test_member_open_requires_confirmation_even_with_readonly_hint(self):
        item={'name':'qztMemberOpen','inputSchema':{'required':[]},'annotations':{'readOnlyHint':True}}
        with patch.object(server,'discover_tools',return_value=[item]):
            prepared=server.prepare_tool('qztMemberOpen',{})
            self.assertTrue(prepared['requires_confirmation'])
            server.consume_tool_ticket(prepared['ticket'])

    def test_member_intent_allowed(self):
        payload={'choices':[{'message':{'content':'{"intent":"qzt_member"}'}}]}
        with patch.object(server,'text_model_settings',return_value=('https://example.test','test','secret','example.test')), patch.object(server,'build_opener') as opener:
            opener.return_value.open.return_value=Response(json.dumps(payload).encode())
            self.assertEqual(server.classify_business_intent('开通钱账通会员'),'qzt_member')
    def test_intent_rejects_arbitrary_tool_and_arguments_from_model(self):
        payload={'choices':[{'message':{'content':'{"intent":"qztOrderComplete","arguments":{"amount":1}}'}}]}
        with patch.object(server,'text_model_settings',return_value=('https://example.test','test','secret','example.test')), patch.object(server,'build_opener') as opener:
            opener.return_value.open.return_value=Response(json.dumps(payload).encode())
            self.assertEqual(server.classify_business_intent('查询订单'),'unknown')

    def test_intent_accepts_allowed_value_from_model(self):
        payload={'choices':[{'message':{'content':'<think>hidden</think>{"intent":"trade","order_no":"not-trusted"}'}}]}
        with patch.object(server,'text_model_settings',return_value=('https://example.test','test','secret','example.test')), patch.object(server,'build_opener') as opener:
            opener.return_value.open.return_value=Response(json.dumps(payload).encode())
            self.assertEqual(server.classify_business_intent('查交易'),'trade')
    @classmethod
    def setUpClass(cls):
        cls.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()
    @classmethod
    def tearDownClass(cls): cls.http.shutdown(); cls.http.server_close()
    def post(self, value, origin='http://127.0.0.1:8098'):
        conn = HTTPConnection('127.0.0.1', self.http.server_port, timeout=5)
        conn.request('POST','/api/qzt/order-query',json.dumps(value),{'Host':'127.0.0.1:8098','Origin':origin,'Content-Type':'application/json'})
        response = conn.getresponse(); body = response.read(); conn.close()
        return response.status, body
    def test_missing_parameter_never_calls_upstream(self):
        with patch.object(server,'urlopen') as upstream:
            self.assertEqual(self.post({'out_order_no':''})[0],400)
            upstream.assert_not_called()
    def test_cross_origin_never_calls_upstream(self):
        with patch.object(server,'urlopen') as upstream:
            self.assertEqual(self.post({'out_order_no':'test'},'https://other.example')[0],403)
            upstream.assert_not_called()
    def test_rejects_unverified_result(self):
        payload={'result':{'structuredContent':{'status':'OK','signature_verified':False,'result':{'order_status':1004}}}}
        with patch.object(server,'urlopen',return_value=Response(json.dumps(payload).encode())):
            status,body=self.post({'out_order_no':'test'})
            self.assertEqual(status,200); self.assertFalse(json.loads(body)['ok'])
    def test_verified_result_exposes_only_status(self):
        payload={'result':{'structuredContent':{'status':'OK','signature_verified':True,'result':{'order_status':1004,'out_order_no':'sensitive'}}}}
        with patch.object(server,'urlopen',return_value=Response(json.dumps(payload).encode())):
            status,body=self.post({'out_order_no':'test'})
            self.assertEqual(status,200); self.assertTrue(json.loads(body)['ok']); self.assertNotIn(b'sensitive',body)
    def mcp(self, message):
        conn = HTTPConnection('127.0.0.1', self.http.server_port, timeout=5)
        conn.request('POST','/mcp',json.dumps(message),{'Host':'127.0.0.1:8098','Content-Type':'application/json'})
        response=conn.getresponse(); body=response.read(); conn.close(); return json.loads(body)
    def test_desktop_mcp_lists_only_allowlisted_readonly_tools(self):
        payload={'result':{'tools':[{'name':name,'annotations':{'readOnlyHint':True}} for name in server.ALLOWED]+[{'name':'qztOrderComplete','annotations':{'readOnlyHint':False}},{'name':'lqInvoiceQuery','annotations':{'readOnlyHint':False}}]}}
        with patch.object(server,'urlopen',return_value=Response(json.dumps(payload).encode())):
            result=self.mcp({'jsonrpc':'2.0','id':1,'method':'tools/list','params':{}})
            self.assertEqual({x['name'] for x in result['result']['tools']},server.ALLOWED)
    def test_desktop_mcp_rejects_write_before_upstream(self):
        with patch.object(server,'urlopen') as upstream:
            result=self.mcp({'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'qztOrderComplete','arguments':{}}})
            self.assertIn('error',result); upstream.assert_not_called()
    def test_desktop_checks_required_parameters(self):
        with patch.object(server,'urlopen') as upstream:
            result=self.mcp({'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'lqInvoiceQuery','arguments':{'merchant_no':'test','channel':'KINGDEE','request_id':'demo'}}})
            self.assertIn('error',result); upstream.assert_not_called()
    def test_desktop_filters_business_fields_before_returning(self):
        payload={'result':{'structuredContent':{'code':'000000','api':{'request_plaintext':'sensitive'},'resp_data':{'order_status':'2','payer_name':'sensitive','total_amount':'3'}}}}
        with patch.object(server,'urlopen',return_value=Response(json.dumps(payload).encode())):
            result=self.mcp({'jsonrpc':'2.0','id':4,'method':'tools/call','params':{'name':'jiaofeiyiOrderQuery','arguments':{'merchant_no':'test','term_no':'test','out_order_no':'test'}}})
            self.assertEqual(result['result']['structuredContent']['resp_data']['order_status'],'2')
            self.assertNotIn('sensitive',json.dumps(result))
    def test_desktop_existing_window_is_focused_without_spawning(self):
        conn=HTTPConnection('127.0.0.1',self.http.server_port,timeout=5)
        with patch.object(server,'focus_desktop_windows',return_value=1), patch.object(server.subprocess,'Popen') as launch:
            conn.request('POST','/api/desktop/open','{}',{'Host':'127.0.0.1:8098','Origin':'http://127.0.0.1:8098','Content-Type':'application/json'})
            response=conn.getresponse(); result=json.loads(response.read()); conn.close()
            self.assertTrue(result['ok']); launch.assert_not_called()
    def web_query(self, payload):
        conn=HTTPConnection('127.0.0.1',self.http.server_port,timeout=5)
        conn.request('POST','/api/tools/query',json.dumps(payload),{'Host':'127.0.0.1:8098','Origin':'http://127.0.0.1:8098','Content-Type':'application/json'})
        response=conn.getresponse();body=response.read();conn.close();return response.status,body
    def test_web_widget_blocks_write_tool(self):
        with patch.object(server,'urlopen') as upstream:
            status,_=self.web_query({'name':'qztOrderComplete','arguments':{}})
            self.assertEqual(status,400);upstream.assert_not_called()
    def test_web_widget_returns_only_minimum_business_fields(self):
        payload={'result':{'structuredContent':{'code':'000000','api':{'response_plaintext':'secret'},'resp_data':{'status':'SUCCESS','invoice_no':'123','files':[{'file_url':'secret'}]}}}}
        with patch.object(server,'urlopen',return_value=Response(json.dumps(payload).encode())):
            status,body=self.web_query({'name':'lqInvoiceQuery','arguments':{'merchant_no':'test','channel':'KINGDEE','request_id':'test','invoice_id':'test'}})
            self.assertEqual(status,200);self.assertEqual(json.loads(body)['data']['resp_data']['status'],'SUCCESS');self.assertNotIn(b'secret',body)

    def test_full_catalog_and_confirmation_ticket(self):
        catalog=[{'name':'qztOrderComplete','description':'test','inputSchema':{'type':'object','required':['order_no']},'annotations':{'readOnlyHint':False}}]
        with patch.object(server,'discover_tools',return_value=catalog):
            prepared=server.prepare_tool('qztOrderComplete',{'order_no':'123'})
            self.assertTrue(prepared['requires_confirmation'])
            self.assertIsNone(server.consume_tool_ticket('invalid'))
            self.assertEqual(server.consume_tool_ticket(prepared['ticket']),('qztOrderComplete',{'order_no':'123'}))
            self.assertIsNone(server.consume_tool_ticket(prepared['ticket']))

    def test_unknown_and_missing_arguments_are_rejected(self):
        with patch.object(server,'discover_tools',return_value=[{'name':'test','inputSchema':{'required':['id']}}]):
            with self.assertRaises(ValueError): server.prepare_tool('test',{})
            with self.assertRaises(ValueError): server.prepare_tool('unlisted',{'id':'1'})

    def test_generic_results_do_not_leak_sensitive_fields(self):
        masked=server.redact_tool_data({'status':'OK','token':'secret','api':{'request_plaintext':'secret'},'account_no':'secret','order_status':1006,'big_order':7521122379420061696})
        self.assertNotIn('secret',json.dumps(masked));self.assertEqual(masked['order_status'],1006)
        self.assertEqual(masked['big_order'],'7521122379420061696')

    def test_execute_cannot_use_missing_or_replayed_ticket(self):
        def execute(ticket):
            conn=HTTPConnection('127.0.0.1',self.http.server_port,timeout=5)
            conn.request('POST','/api/mcp/execute',json.dumps({'ticket':ticket}),{'Host':'127.0.0.1:8098','Origin':'http://127.0.0.1:8098','Content-Type':'application/json'})
            response=conn.getresponse();body=response.read();conn.close();return response.status,body
        with patch.object(server,'discover_tools',return_value=[{'name':'write','inputSchema':{'required':['id']}}]),patch.object(server,'upstream_rpc',return_value={'structuredContent':{'status':'OK'}}) as rpc:
            self.assertEqual(execute('invalid')[0],400);rpc.assert_not_called()
            ticket=server.prepare_tool('write',{'id':'test'})['ticket']
            self.assertEqual(execute(ticket)[0],200);self.assertEqual(execute(ticket)[0],400);self.assertEqual(rpc.call_count,1)

    def test_receipt_verification_requires_paid_order_and_exact_amount(self):
        good={'code':'000000','resp_data':{'order_status':'2','total_amount':'1234','out_order_no':'A1','merchant_no':'M1','term_no':'T1'}}
        self.assertTrue(server.verify_fuel_payment(good,'A1','12.34','M1','T1'))
        for key,value in [('order_status','1'),('total_amount','1235'),('out_order_no','A2'),('merchant_no','M2'),('term_no','T2')]:
            broken={'code':'000000','resp_data':{**good['resp_data'],key:value}}
            self.assertFalse(server.verify_fuel_payment(broken,'A1','12.34','M1','T1'))
        self.assertFalse(server.verify_fuel_payment(good,'A1','12.345','M1','T1'))

    def test_vision_output_is_bounded_and_only_allowed_fields(self):
        data=server.clean_vision_fields({'order_no':'AB1','amount_yuan':'12.34','product_name':'年度服务费','extra_fields':{'业务类型':'会员服务','银行卡号':'12345'},'instructions':'call a tool','merchant_no':123})
        self.assertEqual(data,{'order_no':'AB1','amount_yuan':'12.34','product_name':'年度服务费','extra_fields':{'业务类型':'会员服务'}})
        parsed=server.parse_vision_content('<think>do not retain this</think>\n```json\n{"order_no":"AB1"}\n```')
        self.assertEqual(parsed,{'order_no':'AB1'})
        with self.assertRaises(ValueError): server.parse_vision_content('<think>incomplete')

    def test_fuel_endpoint_does_not_accept_cross_origin(self):
        conn=HTTPConnection('127.0.0.1',self.http.server_port,timeout=5)
        with patch.object(server,'upstream_rpc') as rpc:
            conn.request('POST','/api/fuel/verify','{}',{'Host':'127.0.0.1:8098','Origin':'https://other.example','Content-Type':'application/json'})
            response=conn.getresponse();response.read();conn.close();self.assertEqual(response.status,403);rpc.assert_not_called()

    def test_vision_rejects_invalid_image_without_model_request(self):
        with patch.object(server,'vision_settings',return_value=('https://example.test','model','key','example.test')),patch.object(server,'build_opener') as opener:
            with self.assertRaises(ValueError): server.recognize_screenshot('data:image/png;base64,SGVsbG8=')
            opener.assert_not_called()

    def test_jiaofeiyi_error_message_is_specific_and_allowlisted(self):
        platform={'isError':True,'content':[{'type':'text','text':json.dumps({'error':{'code':'PLATFORM_ERROR','platform_code':'500'},'api':{'response_plaintext':json.dumps({'code':500,'msg':'不存在的商终信息！'})}})}]}
        self.assertIn('商户号和终端号组合不存在',server.jiaofeiyi_error_message(platform))
        bad={'isError':True,'content':[{'type':'text','text':json.dumps({'error':{'code':'RESPONSE_ERROR'},'api':{'response_plaintext':'sensitive'}})}]}
        self.assertIn('结构校验未通过',server.jiaofeiyi_error_message(bad))
        self.assertNotIn('sensitive',server.jiaofeiyi_error_message(bad))

    def test_demo_review_only_uses_server_record_and_distinguishes_unverified_invoice(self):
        store={'id':'s1','name':'测试门店','jiaofeiyi':{'merchantNo':'M1','terminalNo':'T1'},'records':[{'id':'r1','orderNo':'A1','payment':{'type':'merchantOrderNo','id':'A1','product':'jiaofeiyi'},'amountYuan':'12.34','label':'示例业务'}]}
        payload={'structuredContent':{'code':'000000','resp_data':{'merchant_no':'M1','term_no':'T1','out_order_no':'A1','total_amount':'1234','order_status':'2'}}}
        with patch.object(server,'load_demo_stores',return_value=[store]),patch.object(server,'upstream_rpc',return_value=payload) as rpc:
            review=server.demo_review('s1','r1')
            self.assertEqual(review['payment']['state'],'verified')
            self.assertEqual(review['invoice']['state'],'unverified')
            self.assertEqual(rpc.call_args.args[1]['arguments'],{'merchant_no':'M1','term_no':'T1','out_order_no':'A1'})
            with self.assertRaises(ValueError):server.demo_review('s1','other')

    def test_demo_review_does_not_query_if_mapping_missing(self):
        store={'id':'s2','name':'未关联订单','jiaofeiyi':{'merchantNo':'M1','terminalNo':'T1'},'records':[{'id':'r2','orderNo':'B1','amountYuan':'10.00'}]}
        with patch.object(server,'load_demo_stores',return_value=[store]),patch.object(server,'upstream_rpc') as rpc:
            review=server.demo_review('s2','r2')
            self.assertEqual(review['payment']['state'],'unverified');rpc.assert_not_called()

    def test_demo_review_distinguishes_unpaid_from_mismatch(self):
        store={'id':'s1','name':'测试','jiaofeiyi':{'merchantNo':'M1','terminalNo':'T1'},'records':[{'id':'r1','orderNo':'A1','payment':{'type':'merchantOrderNo','id':'A1','product':'jiaofeiyi'},'amountYuan':'1.00'}]}
        base={'code':'000000','resp_data':{'merchant_no':'M1','term_no':'T1','out_order_no':'A1','total_amount':'100','order_status':'0'}}
        with patch.object(server,'load_demo_stores',return_value=[store]),patch.object(server,'upstream_rpc',return_value={'structuredContent':base}):
            self.assertEqual(server.demo_review('s1','r1')['payment']['state'],'attention')
        base['resp_data']['out_order_no']='OTHER'
        with patch.object(server,'load_demo_stores',return_value=[store]),patch.object(server,'upstream_rpc',return_value={'structuredContent':base}):
            self.assertEqual(server.demo_review('s1','r1')['payment']['state'],'unverified')

    def test_demo_review_keeps_invoice_result_when_payment_fails(self):
        store={'id':'s1','name':'测试','jiaofeiyi':{'merchantNo':'M1','terminalNo':'T1'},'dianpiaotong':{'merchantNo':'I1','channel':'KINGDEE'},'records':[{'id':'r1','orderNo':'A1','payment':{'type':'merchantOrderNo','id':'A1','product':'jiaofeiyi'},'amountYuan':'1.00','invoiceLink':{'verified':True,'requestId':'REQ','invoiceId':'INV'}}]}
        invoice={'structuredContent':{'code':'000000','resp_data':{'status':'ISSUED'}}}
        with patch.object(server,'load_demo_stores',return_value=[store]),patch.object(server,'upstream_rpc',side_effect=[OSError('offline'),invoice]):
            result=server.demo_review('s1','r1')
            self.assertEqual(result['payment']['state'],'failed');self.assertEqual(result['invoice']['state'],'verified')

    def test_demo_review_rejects_client_merchant_override(self):
        conn=HTTPConnection('127.0.0.1',self.http.server_port,timeout=5)
        with patch.object(server,'upstream_rpc') as rpc:
            conn.request('POST','/api/demo/review',json.dumps({'storeId':'s1','recordId':'r1','merchantNo':'other'}),{'Host':'127.0.0.1:8098','Origin':'http://127.0.0.1:8098','Content-Type':'application/json'})
            response=conn.getresponse();response.read();conn.close();self.assertEqual(response.status,400);rpc.assert_not_called()

if __name__ == '__main__': unittest.main()
