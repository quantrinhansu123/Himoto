# Mobile write reconciliation — 01/11/2026

The Account screen lists unresolved device requests for the current API origin,
actor and store scope. Staff explicitly confirm reconciliation. It returns an
existing committed receipt, or permanently blocks an uncommitted request key.
No production settings, migrations, operational rows or `.env.local` were changed.

## Protocol and transaction boundary

`POST /api/mobile/v1/write-requests/:key/resolve` accepts only `{ operation }`.
It requires a fresh native session and the current read/write grants for that
customer, draft, issuance or handover operation. Payload and UUID validation run
before acquiring a business connection. The operation must match the stored key.

The resolver uses the same `(user_id, request_id)` primary key, conflict insert
and `FOR UPDATE` row lock as `idempotentMobileWrite`, inside a scoped transaction.

- If the business write wins, resolution waits for its commit and returns its
  receipt after checking current resource visibility. It does not cancel the
  business operation or change the money, contract or stock.
- If resolution wins, it inserts a durable `cancelled:<original operation>`
  tombstone. A delayed write with that key fails before running its domain write.
  Older server code also rejects the different operation, making a mixed-version
  rollout fail closed. No additional schema migration is needed.
- A failed/rolled-back business write leaves no receipt. Resolution can then
  commit its tombstone. A timeout or ambiguous commit response keeps the device
  key; repeating resolution is safe.
- Existing receipts, fingerprints and tombstones must not be deleted or expired
  without a coordinated retry-expiry protocol. A null receipt alone is not proof
  that the business request cannot still arrive.

The client checks that the acknowledgement matches the exact key, operation and
resource. It removes local metadata only after a confirmed cancellation, or when
staff open the recovered committed result. Outages, corrupt storage, authentication
changes and invalid responses preserve unresolved keys. The existing eight-key
device limit and no-token/no-form storage policy remain in force.

## Evidence and limits

- `node scripts/check-mobile-write-recovery.cjs`: **6 groups**, exercising the
  resolver and write helper against a synthetic transaction/unique-key-lock model.
  Covers a delayed writer, an in-flight writer, rollback, cancellation acknowledgement
  loss/replay, actor/store isolation, grants/body validation, commit failure and
  client decoding. `.backups/mobile-write-recovery-results.json`.
- `npm run test:mobile`: **49 groups** passed after adding recovery. Native-storage
  stubs additionally check that the recovery list never returns another account,
  origin or store's keys.
- The previously outstanding browser refresh case passed with the original
  **7/7** contract workflow groups:
  `.backups/mobile-contract-ui-refresh-20261101/results.json`.
- Final extended browser workflow passed **10/10**:
  `.backups/mobile-contract-recovery-ui-20261101-current/results.json`. Includes
  cancellation confirmation/cancel, lost cancellation response, late request
  rejection, server outage, recovery of committed results and expiry during
  reconciliation followed by sign-in. Theme assertions wait for the actual
  rendered light/dark text color before capturing the screenshots.
  This final rerun uses the re-exported browser bundle including the last
  session/permission-key guard and finished at 11:06:41 Asia/Saigon. The earlier
  isolated `-verified` run also passed 10 groups.
- Foundation/customer browser regression **35/35** and draft browser regression
  **12/12** passed: `.backups/mobile-recovery-base-regression-20261101/` and
  `.backups/mobile-recovery-draft-regression-20261101/`.
- Root/mobile lint and typechecks passed; production backend build passed with
  the new route. Shared domain release checks **44/44**, external networking off.
  The last backend build is logged in
  `.backups/mobile-write-recovery-backend-build-20261101.log`.
- Android/iOS JS/Hermes export passed after redirecting temporary storage to E:
  `mobile/.expo/native-write-recovery-qa/`. This checks packaging, not a signed
  native release or physical-device behavior. Final packaging also passed in
  `mobile/.expo/native-write-recovery-qa-final/` after the last UI session-key guard.
- Source hashes, without environment files, are recorded in
  `.backups/mobile-write-recovery-provenance.json`. The branch remains
  `feat/mobile-foundation` at `6467b6a`; implementation is still uncommitted.
- Android `--contracts` native acceptance passed **12/12**, `mode: full`, at
  **11:04:07 Asia/Saigon**. It uses the existing debug APK with the current Admin
  Metro bundle, not a newly built signed release. Evidence:
  `.backups/mobile-write-recovery-native-20261101-verified/results.json`, plus
  screenshots `16-native-cancelled-request.png` and `17-native-resolved-commit.png`.
  Both new scenarios survive process termination. Reconciliation either locks an
  uncommitted key without business writes, or recovers the committed receipt with
  no additional collection. Login, filters, issuance/handover, session restoration
  and logout also pass. The scope is selected contract/recovery workflows, not
  every business module or physical-device certification.
- A separate post-run audit found **0 new app crashes** during that run and one
  earlier inspector crash. Evidence: the same directory's `crash-audit.json` and
  `crash-buffer-audit.log`. The unresolved earlier crash is retained below.
- The browser failure-report path was deliberately tested against an unavailable
  loopback preview: it returned a nonzero process exit and `status: failed`, zero
  completed groups, no real logins or operational writes.
  `.backups/mobile-ui-failure-report-probe-20261101/results.json`.

One concurrent browser rerun exceeded its 5-second theme assertion; the isolated
rerun above passed all ten groups with the same timeout. One Android attempt
stopped after two groups when UI Automator returned no fresh hierarchy during
password entry. These attempts are not acceptance passes. Browser/native harnesses
now write explicit failed results and timestamps, so a failed rerun cannot leave
an old passing `results.json` as if it described the latest attempt. Native reads
retry at most three times with fresh dump paths; taps/writes are never retried.
The native harness also records the crash buffer and rejects new Java/native app
crashes using the emulator's epoch at the beginning of acceptance. This guard
was added while the verified suite below was already running; that run therefore
requires the separately recorded crash-buffer audit, not a claim that the new
guard executed in it.

The failed Android attempt also logged a native debug crash at **10:50:32
Asia/Saigon**, process 3813, in
`com.facebook.react.devsupport.CxxInspectorPackagerConnection.WebSocketDelegate.didReceiveMessage`.
The subsequent verified run begins after 10:53. Preserve and compare the crash
buffer at its completion rather than calling the earlier crash resolved. Log:
`.backups/mobile-write-recovery-prior-debug-crash.log`. Its cause and behavior in
a release build remain unverified; no upstream fix was confirmed.

All automated business writes above are synthetic, with zero operational writes
and zero real logins. The concurrency model is not a PostgreSQL race test. Actual
PostgreSQL transaction/RLS concurrency on isolated staging remains a rollout
gate. Docker is installed but its daemon is unavailable; no operational database
was used to work around that limitation.

## Local environment recovery

The first export failed with `ENOSPC`: drive C had zero free space. The two
temporary QCOW2 overlays were verified by their backing-file paths to belong to
`E:\Himoto\.backups\android-avd\Himoto_QA_20261031.avd`. After stopping that QA
emulator, they were moved, not deleted, to
`.backups/mobile-emulator-temp-archive-20261101/` on E. The original AVD is retained.
Subsequent commands and the local Admin Metro helper set process-only `TEMP`/`TMP`
to `E:\Himoto\.backups\mobile-tmp`; no global environment setting was changed.

The user explicitly authorized Admin Metro. The helper's state file and HTTP
`/status` were checked after restart. Native evidence must still identify the
fixture origin and successful test run; an open Metro port is not device acceptance.
