"""Durability/actor tests against isolated synthetic transfer journals and HTTP."""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import socket
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4
from lib.mobile_fixture_journal import FixtureJournal,ROOT
from lib.mobile_vehicle_transfer_fixture import digest,seed_dataset

output=ROOT/".backups"/("transfer-journal-test-"+str(uuid4()))
output.mkdir(parents=True)
checks=[]
path=output/"state.json"
def call(journal,path,method="GET",body=None,token=None,key=None):
    return journal.transact("/api/mobile/v1/"+path,method,body or {},{"Authorization":"Bearer "+(token or ""),**({"Idempotency-Key":key} if key else {})})
def login(journal,name="qa"):
    status,result,_=call(journal,"session","POST",{"email":name,"password":"fixture-password"})
    assert status==200
    return result["token"]
def reviewed(journal,auth,vehicle=7101,action="transfer"):
    status,prep,_=call(journal,f"vehicles/{vehicle}/transfers",token=auth);assert status==200
    body={"action":action,"revision":prep["vehicle"]["revision"],"note":"Checkpoint QA"}
    if action=="transfer":body["to_store_id"]=24
    else:body.update(transfer_event_id=prep["transfer"]["id"],transfer_event_revision=prep["transfer"]["revision"])
    before=digest(journal.state)
    status,preview,_=call(journal,f"vehicles/{vehicle}/transfers/preview","POST",body,auth);assert status==200,preview
    assert before==digest(journal.state)
    return {**body,"review_snapshot":preview["snapshot"]}
def write(journal,auth,body,key,vehicle=7101):return call(journal,f"vehicles/{vehicle}/transfers","POST",body,auth,key)
def resolve(journal,auth,key,operation):return call(journal,f"write-requests/{key}/resolve","POST",{"operation":operation},auth)

j=FixtureJournal(path)
try:
    try:FixtureJournal(path)
    except RuntimeError:pass
    else:raise AssertionError("A second owner acquired the same checkpoint")
    sender=login(j);receiver=login(j,"qa-receiver");body=reviewed(j,sender);key=str(uuid4())
    j.control(lambda state:state.update(mode="lost"))
    status,proof,lost=write(j,sender,body,key);assert status==200 and lost and j.state["writes"]==1
    committed=deepcopy(j.state);generation=j.generation
finally:j.close()
j=FixtureJournal(path)
assert j.state==committed and j.generation==generation
assert call(j,f"vehicle-transfers/requests/{key}",token=sender)[1]["receipt"]["requestId"]==key
assert call(j,f"vehicle-transfers/requests/{key}",token=receiver)[1]["receipt"] is None
assert resolve(j,receiver,key,"vehicle.transfer:7101")[1]["status"]=="cancelled"
assert resolve(j,sender,key,"vehicle.transfer:7101")[1]["status"]=="committed"
assert write(j,sender,{**body,"note":"Changed"},key)[0]==409
assert resolve(j,sender,key,"vehicle.cancel:7101")[0]==409
assert write(j,sender,body,key)[1]["replayed"] and j.state["writes"]==1
checks.append("Exclusive process lock; lost commit, both actor sessions and immutable original proof survive reopening; replay/payload/action and actor isolation")

receive=reviewed(j,receiver,action="receive");receive_key=str(uuid4())
assert write(j,receiver,receive,receive_key)[0]==200
old=call(j,f"vehicle-transfers/requests/{key}",token=sender)[1]["receipt"]
assert not old["current"] and not old["vehicleCurrent"] and not old["transferCurrent"] and old["eventsCurrent"]
assert old["review"]==proof["review"] and old["events"]==proof["events"]
assert call(j,"session","DELETE",token=receiver)[0]==200
j.close();j=FixtureJournal(path)
assert call(j,"session",token=receiver)[0]==401
receiver=login(j,"qa-receiver")
assert call(j,f"vehicle-transfers/requests/{receive_key}",token=receiver)[1]["receipt"]["current"]
checks.append("Different receiver resolves dispatch; sender proof stays immutable with noncurrent flags; logout revocation and new actor login persist")

drop=reviewed(j,sender,7104);drop_key=str(uuid4());j.control(lambda state:state.update(mode="drop"))
assert write(j,sender,drop,drop_key,7104)[0]==503
assert len(j.state["delayed"])==1
j.close();j=FixtureJournal(path)
assert resolve(j,sender,drop_key,"vehicle.transfer:7104")[1]["status"]=="cancelled"
saved=digest(j.state);j.close();j=FixtureJournal(path);assert digest(j.state)==saved
assert write(j,sender,drop,drop_key,7104)[0]==409 and j.state["writes"]==2
assert j.state["delayed"][0]["body"]==drop and j.state["delayed"][0]["actorId"]==7
checks.append("Unsent envelope and tombstone both persist across restarts; a late writer cannot resurrect the cancelled UUID")

body=reviewed(j,sender,7105);concurrent_key=str(uuid4())
with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(lambda _:write(j,sender,body,concurrent_key,7105),range(4)))
assert all(row[0]==200 for row in results) and j.state["writes"]==3
assert sum(not row[1]["replayed"] for row in results)==1
checks.append("Concurrent HTTP-equivalent retries commit one stock movement and replay the same proof")

prior_requests=deepcopy(j.state["requests"]);prior_vehicles=deepcopy(j.state["vehicles"])
j.control(lambda state:seed_dataset(state,7200));assert j.state["requests"]==prior_requests
assert all(j.state["vehicles"][key]==vehicle for key,vehicle in prior_vehicles.items())
saved=digest(j.state)
try:j.control(lambda state:seed_dataset(state,7200))
except AssertionError:pass
else:raise AssertionError("An existing dataset was overwritten")
assert digest(j.state)==saved
alias=login(j,"qa8");assert call(j,"session",token=alias)[1]["user"]["id"]==8
checks.append("A new retry dataset only appends unused vehicles; existing stock/proof cannot be reset; Telex-safe alias authenticates the separate receiver actor")

before=deepcopy(j.state);before_disk=path.read_bytes();generation=j.generation
with patch("lib.mobile_fixture_journal.os.replace",side_effect=OSError("QA replace failure")):
    try:resolve(j,sender,str(uuid4()),"vehicle.cancel:7107")
    except OSError:pass
    else:raise AssertionError("A failed disk commit returned a result")
assert j.state==before and path.read_bytes()==before_disk and j.generation==generation
j.close();j=FixtureJournal(path);assert j.state==before
j.close()
checks.append("Failed atomic replacement never changes authoritative RAM/disk state or acknowledges an unpersisted tombstone")

corrupt=output/"corrupt.json";corrupt.write_text(path.read_text(encoding="utf-8").replace('"fixtureOnly":true','"fixtureOnly":false',1),encoding="utf-8")
for filename in (corrupt,output/"unfinished.json"):
    if filename.name=="unfinished.json":filename.with_suffix(".json.tmp").write_text("partial",encoding="utf-8")
    try:FixtureJournal(filename)
    except (AssertionError,ValueError):pass
    else:raise AssertionError("Invalid checkpoint was accepted or blank-reset")
checks.append("Corrupt or incomplete initial checkpoints fail closed without blank seeding")

with socket.socket() as sock:sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
server=None
def http(path,method="GET",body=None,auth=None,key=None):
    request=urllib.request.Request(f"http://127.0.0.1:{port}"+path,data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type":"application/json",**({"Authorization":"Bearer "+auth} if auth else {}),**({"Idempotency-Key":key} if key else {})},method=method)
    try:
        with urllib.request.urlopen(request,timeout=5) as response:return response.status,json.load(response)
    except urllib.error.HTTPError as error:return error.code,json.load(error)
def start():
    proc=subprocess.Popen([sys.executable,str(ROOT/"scripts/mobile-transfer-fixture-server.py"),"--port",str(port),"--state-file",str(path)],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                          creationflags=subprocess.CREATE_NO_WINDOW if os.name=="nt" else 0)
    for _ in range(100):
        if proc.poll() is not None:raise AssertionError("QA server stopped before health")
        try:
            if http("/health")[1]["fixtureOnly"]:return proc
        except urllib.error.URLError:time.sleep(.05)
    proc.terminate();proc.wait(timeout=5);raise AssertionError("QA server did not listen")
try:
    server=start();baseline=http("/__fixture_state")[1]
    assert http("/api/mobile/v1/session",auth=sender)[0]==200
    server.terminate();server.wait(timeout=5);server=start()
    assert http("/__fixture_state")[1]==baseline
    assert http(f"/api/mobile/v1/vehicle-transfers/requests/{key}",auth=sender)[1]["receipt"]["requestId"]==key
    assert http("/__fixture_late","POST",{})[1]["lateStatus"]==409
    checks.append("Real server stop/start restores the exact checkpoint digest, proof and token; late delayed HTTP intent still returns 409")
finally:
    if server and server.poll() is None:server.terminate();server.wait(timeout=5)
result={"passed":len(checks),"checks":checks,"fixtureOnly":True,"operationalWrites":0,"checkpointDirectory":str(output)}
(ROOT/".backups/mobile-transfer-fixture-results.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(result,ensure_ascii=False,indent=2))
