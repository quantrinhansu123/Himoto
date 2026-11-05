"""Loopback-only durable GPS QA. Refuses blank resets of written checkpoints."""
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from lib.mobile_fixture_journal import FixtureJournal
from lib import mobile_gps_fixture as model
def serve(port,path):
    journal=FixtureJournal(path,model=model)
    class Handler(BaseHTTPRequestHandler):
        protocol_version='HTTP/1.1'
        def log_message(self,*_args): pass
        def respond(self,status,data):
            payload=json.dumps(data,ensure_ascii=False).encode();self.send_response(status)
            self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(payload)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(payload)
        def handle_request(self):
            try:
                if self.path=='/health':return self.respond(200,{'fixtureOnly':True,'schema':model.SCHEMA})
                if self.path=='/__fixture_state':return self.respond(200,journal.summary())
                size=int(self.headers.get('Content-Length','0'));assert 0<=size<=4096
                body=json.loads(self.rfile.read(size)) if size else {}
                if self.path=='/__fixture_mode' and self.command=='POST':
                    assert set(body)=={'mode'} and body['mode'] in model.MODES;journal.control(lambda state:state.update(mode=body['mode']));return self.respond(200,{'fixtureOnly':True,'mode':body['mode']})
                if self.path=='/__fixture_late' and self.command=='POST':
                    delayed=journal.state['delayed'];assert delayed
                    status,_,_=journal.transact(**delayed);journal.control(lambda state:state.update(lateStatus=status));return self.respond(200,{'fixtureOnly':True,'lateStatus':status})
                if self.headers.get('Origin') is not None:return self.respond(403,{'code':'NATIVE_CLIENT_REQUIRED','message':'Native GPS QA only.'})
                status,data,lost=journal.transact(self.path,self.command,body,dict(self.headers))
                self.respond(503,{'code':'SERVICE_UNAVAILABLE','message':'QA mất phản hồi sau commit GPS.'}) if lost else self.respond(status,data)
            except (ValueError,AssertionError,KeyError,TypeError):self.respond(400,{'message':'Invalid GPS QA request'})
            except OSError:self.respond(503,{'message':'QA checkpoint unavailable'})
        do_GET=handle_request
        do_POST=handle_request
        do_DELETE=handle_request
    try:
        server=ThreadingHTTPServer(('127.0.0.1',port),Handler);print(f'GPS QA on 127.0.0.1:{port}; durable synthetic checkpoint.',flush=True);server.serve_forever()
    finally:journal.close()
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8108);parser.add_argument('--state-file',type=Path,required=True);args=parser.parse_args()
    if not 8100<=args.port<=8199:raise ValueError('Use a separate GPS QA port')
    serve(args.port,args.state_file)
