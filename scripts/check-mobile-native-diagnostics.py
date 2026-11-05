"""Offline checks that old/other-process events cannot certify or fail a run."""
import json
from lib.mobile_native_diagnostics import verdict,physical_evidence

crash = """99.000 1 1 E DEBUG: Process: vn.himoto.staff, PID: 7
100.000 1 1 E DEBUG: Process: vn.himoto.staff.helper, PID: 8
101.000 1 1 E DEBUG: Process: vn.himoto.staff, PID: 7
102.000 1 1 E DEBUG: >>> vn.himoto.staff <<<
"""
anr = """99.000 1 1 I am_anr: [0,7,vn.himoto.staff,1,Old]
100.000 1 1 I am_anr: [0,8,vn.himoto.staff.helper,1,Other]
101.000 1 1 I am_anr: [0,7,vn.himoto.staff,1,Current]
102.000 1 1 I am_anr: [0,9,com.android.systemui,1,Current]
"""
assert verdict(crash,anr,100,"vn.himoto.staff") == {"newAppCrashes":2,"newAppAnrs":1,"newSystemUiAnrs":1}
assert verdict(crash,anr,None,"vn.himoto.staff") == {"newAppCrashes":None,"newAppAnrs":None,"newSystemUiAnrs":None}
assert verdict(crash,anr,103,"vn.himoto.staff") == {"newAppCrashes":0,"newAppAnrs":0,"newSystemUiAnrs":0}
scoped=physical_evidence(crash+'103.000 2 2 E AndroidRuntime: Process: unrelated.private.app, PID: 99\n',anr,100,'vn.himoto.staff')
assert verdict(*scoped,100,'vn.himoto.staff')==verdict(crash,anr,100,'vn.himoto.staff')
assert 'unrelated.private.app' not in scoped[0] and 'staff.helper' not in ''.join(scoped) and '99.000' not in ''.join(scoped)
print(json.dumps({"passed":4,"checks":["Timestamp and exact process boundaries exclude historical/unrelated failures", "A run which never started remains unverified instead of reporting zero crashes", "System UI and app ANRs are reported separately","Physical-phone artifacts retain only current Himoto/SystemUI failure markers while preserving the failure verdict"],"externalNetworkAllowed":False}))
