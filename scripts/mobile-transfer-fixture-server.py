"""Loopback transfer QA server: actor-bound sessions and durable checkpoint."""
import argparse
import json
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from lib.mobile_fixture_journal import FixtureJournal
from lib.mobile_vehicle_transfer_fixture import record,seed_dataset

def serve(port,path):
    journal=FixtureJournal(path)
    class Handler(BaseHTTPRequestHandler):
        protocol_version="HTTP/1.1"
        def log_message(self,*_args):pass
        def respond(self,status,data):
            payload=json.dumps(data,ensure_ascii=False).encode()
            self.send_response(status);self.send_header("Content-Type","application/json; charset=utf-8");self.send_header("Content-Length",str(len(payload)))
            self.send_header("Cache-Control","no-store");self.end_headers();self.wfile.write(payload)
        def handle_request(self):
            try:
                if self.path=="/health":return self.respond(200,{"fixtureOnly":True})
                if self.path=="/__fixture_state" and self.command=="GET":return self.respond(200,journal.summary())
                size=int(self.headers.get("Content-Length","0"))
                if size<0 or size>16384:return self.respond(413,{"message":"Fixture payload too large"})
                body=json.loads(self.rfile.read(size)) if size else {}
                if self.path=="/__fixture_dataset" and self.command=="POST":
                    if set(body)!={"base"}:return self.respond(400,{"message":"Invalid fixture dataset"})
                    journal.control(lambda state:seed_dataset(state,body["base"]));return self.respond(200,{"fixtureOnly":True,"base":body["base"]})
                if self.path=="/__fixture_mode" and self.command=="POST":
                    if set(body)!={"mode"} or body["mode"] not in ("none","lost","drop","conflict"):return self.respond(400,{"message":"Invalid fixture mode"})
                    journal.control(lambda s:s.update(mode=body["mode"]));return self.respond(200,{"fixtureOnly":True,"mode":body["mode"]})
                if self.path=="/__fixture_late" and self.command=="POST":
                    def late(state):
                        delayed=state["delayed"][-1];old=state["requests"].get(f"{delayed['actorId']}:{delayed['key']}")
                        assert old and old["status"]=="cancelled","Cancel the original intent first"
                        status,_,_=record(state,state["vehicles"][str(delayed["vehicleId"])],delayed["body"],delayed["key"],delayed["actorId"])
                        assert status==409
                    journal.control(late);return self.respond(200,{"fixtureOnly":True,"lateStatus":409})
                if self.headers.get("Origin") is not None:return self.respond(403,{"message":"Native client required","code":"NATIVE_CLIENT_REQUIRED"})
                status,data,lost=journal.transact(self.path,self.command,body,dict(self.headers))
                if lost:return self.respond(503,{"message":"Phản hồi QA bị mất sau commit.","code":"SERVICE_UNAVAILABLE"})
                self.respond(status,data)
            except (ValueError,AssertionError,KeyError):self.respond(400,{"message":"Invalid fixture request"})
            except OSError:self.respond(503,{"message":"Không lưu được checkpoint QA.","code":"SERVICE_UNAVAILABLE"})
        do_GET=handle_request
        do_POST=handle_request
        do_DELETE=handle_request
    try:
        server=ThreadingHTTPServer(("127.0.0.1",port),Handler)
        print(f"Synthetic transfer API on 127.0.0.1:{port}; durable QA checkpoint, no real accounts/DB.",flush=True);server.serve_forever()
    finally:journal.close()
if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--port",type=int,default=8097);parser.add_argument("--state-file",type=Path,required=True)
    args=parser.parse_args()
    if args.port in (8081,8091,8093,8094) or not 1024<=args.port<=65535:raise ValueError("Use a separate transfer fixture port")
    serve(args.port,args.state_file)
