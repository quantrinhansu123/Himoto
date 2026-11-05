# Renewal bill attachments — Android acceptance checkpoint

The app can prepare a bill image, review it at larger size and confirm attachment
to a prepared renewal version. This step saves evidence only. Renewal dates,
fees/collection and linked later receipts still require the renewal workflow.

GET/PUT `/api/mobile/v1/contracts/:id/renewals/:version/bill` requires current
`contracts.read` + `contracts.renew`. JSON metadata identifies the primary slot's
revision; `?revision=...` reads that exact image. Native bearer tokens stay at the
API origin; trusted remote storage is proxied instead of redirecting the device.
Image bytes are bounded to 2 MiB and never returned as JSON/base64. Native image
views disable disk caching and support explicit zoom/retry.

PUT uses raw JPEG bytes, `Idempotency-Key`, `X-Contract-Revision` and
`X-Bill-Revision` (0 means no primary image). The shared request lock, order lock,
next-version check and reviewed image revision prevent stale/implicit overwrites.
`writeRecordPhoto`, immutable bill metadata and the mobile request commit together.
`GET /bills/requests/:key` rechecks actor/grants/contract scope, returns the exact
image receipt and indicates if that slot has changed since the acknowledged save.
`renewal.bill:<contract ID>` participates in durable cancellation. The native
ledger retains its UUID across process/session/scope changes; another upload is
blocked until reconciliation. Account recovery opens the dedicated result without
clearing the key. The user can acknowledge a current bill only after it loads.

`docs/sql/2026-11-01-mobile-bills.sql` adds actor-scoped, append-only receipt
metadata after mobile-writes.sql. It contains no image bytes or tokens. It has
been applied only in isolated in-memory tests; deployment/production is unchanged.
Do not enable staff use until migration and deployed RLS acceptance are complete.

Evidence so far:

- Four API/client/preflight groups: `.backups/mobile-bills-api-results.json`.
- Five actual PostgreSQL bill groups in `.backups/mobile-finance-sql-results.json`
  (27 overall after renewal-write work): bytes/receipt atomicity, replay, reviewed replacement/stale reject,
  rollback, lost commit, cancellation/late upload, current scope and limits.
  Actual primary image metadata/bytes/revision lookup is exercised as well.
- Mobile suite 77 groups at the bill checkpoint:
  `.backups/mobile-bills-api-full-20261101.log`. The later renewal API adds four
  groups (81 overall): `.backups/mobile-renewal-api-full-20261101.log`.
- Root/mobile typecheck/lint passed with the new routes/client/UI.
- Production backend build: `.backups/mobile-bills-backend-build-20261101.log`.
- New x86_64 debug APK: 96,667,760 bytes, SHA256
  `3c77592afa537ff0b22372f6b84ffcf15a1fc80a18d309706a1af50629739abd`.
  Build: `.backups/mobile-media-native-build-20261101-verified.log` (22m14s).
  AAPT confirms CAMERA and absence of RECORD_AUDIO. This is not a release APK.
- Android `--bills --writes-only`: **6/6 passed** at 16:41:58 +07,
  `.backups/mobile-bills-native-20261101/results.json`.
- Android `--bills`, full: **11/11 passed** at 16:52:52 +07,
  `.backups/mobile-bills-native-20261101-final/results.json`, zero new app crashes
  or ANRs. Covers camera denial, picker cancellation, real native JPEG conversion,
  reviewed upload/replacement, lost-response recovery after process termination,
  cancellation of an uncommitted request and session/logout regression. No
  financial writes occur in the bill cases.
- Actual uploaded JPEG decoded by Sharp: **2200 × 1467, 160,598 bytes**,
  `.backups/mobile-bill-image-validation-20261101.log`. Source is a synthetic QA image.
- Visual inspection of the full run showed the zoomed image obscuring the
  toolbar. The subsequent viewport clipping/toolbar fix passed **3/3 focused**
  at 17:41:15 +07, `.backups/mobile-bill-viewer-native-20261101-checked/`.
  Screenshot `26-native-bill-toolbar.png` and `viewer.xml` show the close/zoom
  controls above the 2× image. Back/discard changes no images or money; session
  restoration/logout also passed, with zero new app crashes/ANRs. This is separate
  from the earlier 11/11 scope. Installed APK SHA256 matches the media APK above.
- Failed focused iterations are retained separately. They exposed early emulator
  networking, back events sent before the modal had closed, and a source edit
  causing Fast Refresh/navigation reset during QA. One route JSX error was caught
  by typecheck/Metro before the app opened. The accepted run freezes device source.
  Its checksum snapshot was captured **after** the run (explicitly labelled in
  `source-provenance.json`); later harness runs compare snapshots before/after
  and record the prewarmed entry hash and installed APK checksum automatically.

SQL uses one PGlite connection with synthetic base policies, the actual request/
bill migrations and real transaction plumbing/domain. Concurrent sessions,
deployed RLS and staging performance remain separate gates. Photos from a
terminated process may remain in private OS cache until cleanup; the ledger
stores no paths, forms or image bytes. Cache lifecycle across process loss,
Activity recreation/pending picker results, HEIC/rotation/readability, successful
camera capture, physical devices and iOS signing/permissions remain open.
