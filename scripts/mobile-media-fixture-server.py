"""Loopback JPEG/media QA transport with journal commits before responses."""
import argparse,base64,json
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from lib.mobile_fixture_journal import FixtureJournal
from lib import mobile_record_media_fixture as model
def serve(port,path):
    journal=FixtureJournal(path,model=model)
    class Handler(BaseHTTPRequestHandler):
        protocol_version='HTTP/1.1'
        def log_message(self,*_args):pass
        def respond(self,status,data):
            binary='_bytesBase64' in data;payload=base64.b64decode(data['_bytesBase64']) if binary else json.dumps(data,ensure_ascii=False).encode()
            self.send_response(status);self.send_header('Content-Type',data['mimeType'] if binary else 'application/json; charset=utf-8');self.send_header('Content-Length',str(len(payload)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(payload)
        def handle_request(self):
            try:
                if self.path=='/health':return self.respond(200,{'fixtureOnly':True})
                if self.path=='/__fixture_state':return self.respond(200,journal.summary())
                size=int(self.headers.get('Content-Length','0'))
                if not 0<=size<=2*1024*1024:return self.respond(413,{'message':'Fixture body too large'})
                raw=self.rfile.read(size) if size else b''
                body={'jpeg':base64.b64encode(raw).decode()} if self.command=='PUT' else json.loads(raw) if raw else {}
                if self.path=='/__fixture_mode' and self.command=='POST':
                    assert body['mode'] in model.MODES;journal.control(lambda s:s.update(mode=body['mode']));return self.respond(200,{'fixtureOnly':True,**body})
                if self.path=='/__fixture_dataset' and self.command=='POST':
                    journal.control(lambda s:model.seed_dataset(s,body['base']));return self.respond(200,{'fixtureOnly':True,**body})
                if self.path=='/__fixture_scope' and self.command=='POST':
                    assert body['actorId'] in (7,8) and type(body['allStores']) is bool;journal.control(lambda s:s['scopes'].update({str(body['actorId']):body['allStores']}));return self.respond(200,{'fixtureOnly':True,**body})
                if self.path=='/__fixture_late' and self.command=='POST':
                    result=journal.transact(**journal.state['delayed'][-1]);return self.respond(200,{'fixtureOnly':True,'lateStatus':result[0]})
                if self.headers.get('Origin') is not None:return self.respond(403,{'message':'Native QA transport required'})
                status,data,_lost=journal.transact(self.path,self.command,body,dict(self.headers));return self.respond(status,data)
            except (ValueError,AssertionError,KeyError):return self.respond(400,{'message':'Invalid synthetic media request'})
            except OSError:return self.respond(503,{'message':'Cannot persist QA checkpoint'})
        do_GET=handle_request;do_POST=handle_request;do_PUT=handle_request;do_DELETE=handle_request
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    try:print(f'Media fixture 127.0.0.1:{port}; QA journal only, no operational accounts/DB.',flush=True);server.serve_forever()
    finally:server.server_close();journal.close()
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8099);parser.add_argument('--state-file',type=Path,required=True);args=parser.parse_args()
    if args.port in (8081,8091,8093,8094,8097,8098) or not 1024<=args.port<=65535:raise ValueError('Use an isolated media fixture port')
    serve(args.port,args.state_file)
