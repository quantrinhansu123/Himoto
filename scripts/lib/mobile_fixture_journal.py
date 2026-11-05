"""Atomic QA-only checkpoint with a process lock; never reads environment files."""
import json
import os
import threading
from copy import deepcopy
from pathlib import Path
from lib.mobile_vehicle_transfer_fixture import SCHEMA,digest
from lib import mobile_vehicle_transfer_fixture as transfer_model

ROOT=Path(__file__).resolve().parents[2]
class FixtureJournal:
    def __init__(self,path,*,model=None):
        self.model=model or transfer_model
        self.path=Path(path).resolve()
        if not self.path.is_relative_to((ROOT/".backups").resolve()):raise ValueError("Fixture checkpoint must stay inside workspace .backups")
        self.path.parent.mkdir(parents=True,exist_ok=True);self.mutex=threading.RLock()
        self.lock_path=self.path.with_suffix(self.path.suffix+".lock");self.lock=self.lock_path.open("a+b")
        if self.lock_path.stat().st_size==0:self.lock.write(b"1");self.lock.flush()
        self.lock.seek(0)
        try:
            if os.name=="nt":
                import msvcrt
                msvcrt.locking(self.lock.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(self.lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except Exception:self.lock.close();raise RuntimeError("Fixture checkpoint is already in use")
        try:
            if self.path.exists():
                payload=json.loads(self.path.read_text(encoding="utf-8"))
                assert payload["schema"]==self.model.SCHEMA and payload.get("fixtureOnly") is True and payload["digest"]==self.model.digest(payload["state"])
                assert type(payload["generation"]) is int and payload["generation"]>0
                self.state=self.model.valid_state(payload["state"]);self.generation=payload["generation"]
            else:
                if self.path.with_suffix(self.path.suffix+".tmp").exists():raise ValueError("Incomplete initial checkpoint; refusing a blank reset")
                self.state=self.model.seed_state();self.generation=0;self.persist(self.state)
        except Exception:self.close();raise
    def close(self):
        if not self.lock.closed:self.lock.close()
    def persist(self,state):
        self.model.valid_state(state);generation=self.generation+1
        payload={"schema":self.model.SCHEMA,"fixtureOnly":True,"generation":generation,"digest":self.model.digest(state),"state":state}
        temporary=self.path.with_suffix(self.path.suffix+".tmp")
        with temporary.open("w",encoding="utf-8",newline="\n") as out:
            json.dump(payload,out,ensure_ascii=False,separators=(",",":"));out.flush();os.fsync(out.fileno())
        os.replace(temporary,self.path)
        self.generation=generation
    def transact(self,path,method,body,headers):
        with self.mutex:
            candidate=deepcopy(self.state)
            result=self.model.response(path,method,body,headers,candidate)
            if candidate!=self.state:self.persist(candidate);self.state=candidate
            return result
    def control(self,change):
        with self.mutex:
            candidate=deepcopy(self.state);change(candidate)
            self.persist(candidate);self.state=candidate
    def summary(self):
        if hasattr(self.model,'summary'):
            with self.mutex:return self.model.summary(self.state,self.generation)
        with self.mutex:return {"fixtureOnly":True,"schema":SCHEMA,"generation":self.generation,"digest":digest(self.state),"writes":self.state["writes"],
            "receipts":[deepcopy(row["receipt"]) for row in self.state["requests"].values() if row["status"]=="committed"],
            "tombstones":[{"actorId":row["actorId"],"key":row["key"],"operation":row["operation"]} for row in self.state["requests"].values() if row["status"]=="cancelled"]}
