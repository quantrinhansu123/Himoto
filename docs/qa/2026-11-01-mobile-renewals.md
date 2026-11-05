# Mobile renewals — write API in progress

The preparation service, bill upload and renewal write/receipt APIs exist.
The renewal editor passed eight browser groups with intercepted synthetic data;
Android renewal acceptance passed six focused groups and eleven full groups;
physical/iOS acceptance remains unfinished. Bill-only
Android acceptance is documented separately in
[bill QA](2026-11-01-mobile-bills.md); it does not certify saving a renewal.

`POST /api/mobile/v1/contracts/:id/renewals` uses the same renewal/collection
domain as web. It locks the mobile UUID and order, checks reviewed order/vehicle
revisions and the exact next version, and requires the reviewed primary bill's
revision before recording money. Renewal, linked rental receipt, outside receipt
and immutable mobile acknowledgement commit together. Outside collection keeps
its independent transaction ID and does not increase rental totals or paid money.
Unpaid and zero rental-fee/outside-only cases remain supported by the domain.

`GET /api/mobile/v1/renewals/requests/:key` returns the actor's original version,
amounts, bill revision and exact receipt IDs under current contract visibility.
Later changes to the version or cashbook mark `current:false`; replay still
performs no second renewal or collection. Generic `renewal.record:<id>`
reconciliation can durably cancel a request which has not committed. The native
typed client and keyed editor retain these UUIDs until the original version and
exact receipt IDs have been displayed and acknowledged. A failed/uncertain write
locks further editing; server-confirmed cancellation retains the form for review.
Account recovery opens this dedicated result without clearing its key first.
Bill editing can return to the existing renewal form, which refetches and requires
a fresh image review. Native upload-and-return/form retention still needs its
dedicated renewal run; browser image tests use a tiny synthetic legacy PNG and
do not establish camera/codec behavior or bill readability.

The new append-only migration `docs/sql/2026-11-01-mobile-renewals.sql` has been
applied **only in isolated PGlite**. Same-branch metadata visibility preserves
version numbering across operators even when JSON history is reconciled or the
manual notification queue fails; receipt API lookup remains actor-bound. The
shared version helper retains compatibility when this optional table is absent.
Production has not been migrated. No Telegram message is sent by these APIs;
post-commit processing only prepares the existing manual outbox.

Current write evidence:

- Four API/client/preflight groups: `.backups/mobile-renewal-write-results.json`.
- Four review/fee/date/account/bill form groups:
  `.backups/mobile-renewal-form-results.json`.
- Eleven actual SQL write/reference groups, **27 SQL groups overall**:
  `.backups/mobile-renewal-write-sql-final-20261101.log` and
  `.backups/mobile-finance-sql-results.json`. Covers atomic paid/outside/unpaid
  writes, missing/stale bill and version, rollback, lost commit/replay,
  cancellation, actor/branch scope, later cashbook changes, JSON-history trimming
  across operators and compatibility with an unmigrated web schema. Changed
  receipt-period links/outside-receipt pointers also mark `current:false` while
  preserving the immutable original result, even if transaction values match.
  A missing original return date remains a valid unchanged period. The added
  null-period test first reproduced a false `current:false` result in
  `.backups/mobile-renewal-write-sql-null-period-before-20261101.log`; the fix
  uses the shared period matcher plus null-safe original-bound comparison.
- Mobile suite **85 groups**: `.backups/mobile-renewal-editor-api-full-20261101.log`.
- Browser **8/8**, `.backups/mobile-renewal-ui-20261101-reviewed/results.json`:
  non-extending date rejection, cancelled review/unpaid agreement, missing bill,
  exact paid/outside recovery through Account, cancellation/late-request blocking,
  and 375/390/768 layouts in light/dark. Zero page errors/unexpected hosts/real
  logins or operational writes. The first browser attempt is preserved in
  `.backups/mobile-renewal-ui-20261101/`; it failed in the test's immediate Back
  before acknowledgement navigation settled. The rerun waits for the record URL.
- Shared release/domain **44/44**:
  `.backups/mobile-renewal-version-domain-20261101.log`.
- Root/mobile typecheck and lint passed after adding the routes and typed client.
  Production backend build containing the write routes passed:
  `.backups/mobile-renewal-write-backend-build-20261101.log`.
  Final production backend build after the null-period fix also passed:
  `.backups/mobile-renewal-write-backend-final-build-20261101.log`.
- Web export: `mobile/.expo/web-renewal-editor-qa/`; Hermes:
  `mobile/.expo/native-renewal-editor-qa/`, Android
  `entry-def6bbdf385c8ea7a6a7c6cef639b15d.hbc`, iOS
  `entry-1ad8a5f6ffef3f4b15ad5b314df04f44.hbc`. These are compiled QA artifacts,
  not signed release/device acceptance. Export logs:
  `.backups/mobile-renewal-media-{web,native}-export-20261101.log`.
- Browser regression on this same export passed **35/35 + 12/12 + 10/10 + 11/11**:
  `.backups/mobile-media-regression-{ui,drafts,contracts,finance}-20261101/`.
  These remain browser checks with intercepted synthetic data.
- First Android `--renewals` full **failed after four baseline groups**, before
  any renewal/bill/financial write: `.backups/mobile-renewal-native-20261101/`.
  The filter step was obscured by an actual app ANR at 17:59:50 (focus dispatch
  waited 5252 ms). `last-anr.txt`, `dropbox-app-anr.txt`, `anr-events.log`, failure
  image/XML and result are retained. The main stack is in Android accessibility
  Binder/ART; guest CPU pressure averaged over 90%, other Google services also
  ANRed and host free RAM was about 178 MB. Resource pressure is a supported
  contributing hypothesis, **not proof that app stability is fixed**. No renewal
  group has passed native yet. The emulator has been stopped for the final
  backend build and to release RAM. A separate full rerun is now starting with
  `-gpu host` on the detected Intel UHD GPU, with no other heavy QA/build tasks:
  `.backups/mobile-renewal-native-20261101-hardware/`, exec `40405`.
  That hardware rerun also **failed before login** with a visible System UI ANR;
  its result and system ANR events/dropbox were retained. Neither attempt reached
  a renewal write. These changed environments are not evidence of a code fix.
  A separate regular AOSP Android 35 x86_64 r2 image has now been installed from
  Google's SDK repository; new AVD creation is in progress. The original Google
  APIs AVD is preserved. This full AOSP image is distinct from ATD images, which
  remove SystemUI/keyboard/camera apps and do not fit these UI/media cases.
  Logs: `.backups/mobile-aosp-image-install-20261101.log` and
  `.backups/mobile-aosp-avd-create-20261101.log`.
  New AVD `Himoto_AOSP_QA_20261101` is separate under `.backups/android-avd/`,
  runs read-only with 1280 MiB/two cores/host GPU and the same 720×1600/280-dpi
  override. Initial host free RAM was about 1.4 GB. The first renewal run on it
  is **focused `--renewals --writes-only`**. Its first attempt
  `.backups/mobile-renewal-native-20261101-aosp/` failed before app launch because
  AOSP had not associated with the emulator's AndroidWifi network. After explicitly
  connecting that network, a second attempt
  `.backups/mobile-renewal-native-20261101-aosp-connected/` navigated Home when the
  harness pressed Back after the keyboard had already closed. Events show an
  app-requested Activity finish, with no app crash. The harness now dismisses only
  a visible keyboard and verifies replacement of prefilled fee input. No app
  source changed to bypass these failures. The next run is
  `.backups/mobile-renewal-native-20261101-aosp-input/` passed the unpaid renewal
  group, then failed in the harness scrolling only downward to a note above the
  restored bill viewport. The note and fee choices were retained, confirmed in
  `.backups/mobile-renewal-aosp-input-cleanup/retained-form.png`. Manual cleanup
  verified zero new app crashes/ANRs or System UI ANRs for that run, acknowledged
  every saved bill/renewal key through the UI, discarded only the unsent form and
  logged out. `all-requests-acknowledged.png` confirms the empty recovery ledger.
  The owned fixture was reset only afterwards. The harness now supports upward
  scrolling and its scripts/fixture files are included in before/after checksums.
  Focused run `.backups/mobile-renewal-native-20261101-aosp-reviewed/` passed
  **6/6** at **18:47:15 +07**, with zero new app crashes, app ANRs or System UI
  ANRs. It verifies unpaid agreed fees, bill upload returning to the retained
  form, exact rental/outside receipt recovery through Account after process loss,
  cancellation of an uncommitted renewal, session restoration and logout.
  Before/after checksums cover the app, shared code, QA scripts and fixture;
  the installed APK hash matches the preserved media APK. This is `writes-only`,
  not a full 11-group result or release/physical-device certification.
  Every pending key was acknowledged or cancelled before resetting the owned
  fixture. The full AOSP rerun at
  `.backups/mobile-renewal-native-20261101-aosp-full/` passed **11/11** at
  **19:00:16 +07**, with zero new app crashes, app ANRs or System UI ANRs.
  Checksums for 104 app/shared/config/QA inputs match before and after. The
  installed APK matches the media APK; the prewarmed entry hash is recorded.
  The emulator was then stopped for backend QA. App is logged out; fixture
  exec `92580` retains terminal synthetic state. Physical/iOS and release
  performance acceptance remain open, as does the earlier host-pressure ANR audit.

The remaining preparation/media notes below describe their earlier checkpoints.

Follow-up work for later partial collections has started in
`src/lib/server/renewal-collection-period.ts`. The calculation helper reuses the
shared period matcher, keeps reviewed remaining money bound to contract/period/
fee, excludes older corrected coverage and rejects ambiguous, over-collected or
malformed periods. Six offline calculation groups passed separately:
`.backups/mobile-renewal-period-results.json`. A read-only service now groups
approved receipts in SQL by period, requires finance read/write permissions and
rechecks branch RLS. Three additional actual SQL groups passed for settled/unpaid
preparation, shared-domain partial collection without fee/date changes, cancelled
receipts and duplicate versions; `numeric(18,2)` sums are covered. No public
endpoint, collection write or editor is wired yet. Do not count preparation as a
completed collection workflow. Expanded mobile **91** and SQL **30** passed:
`.backups/mobile-renewal-collection-prep-api-20261101.log` and
`.backups/mobile-renewal-collection-prep-sql-20261101.log`. Root typecheck/lint:
`.backups/mobile-renewal-collection-prep-checks-20261101.log`.

`GET /api/mobile/v1/contracts/:id/renewals?page=1&search=...` requires a current
mobile session, `contracts.read` and `contracts.renew`. General finance grants do
not substitute for renewal permission. The service uses a scoped, repeatable-read,
read-only transaction and the shared payment context in summary-only mode.

The DTO includes contract revision/balances, receiving accounts keyed by method,
25 active vehicles per page, the next saved renewal version and bill presence for
that version. Names/licenses support accent-insensitive search. Unknown filters,
duplicate parameters and malformed values fail before connecting. Raw composer,
financial history and private document fields are not returned. Ownership plans,
unavailable states, holds, missing active vehicles and invalid money return an
explicit business gate.

`nextContractRenewalVersion` considers saved JSON, notifications, payment and immutable mobile renewal
references. Preparation does not reserve that number. Notification references can
advance it without changing the order's `xmin`; the future write must check both
the reviewed order/line revisions and the prepared version before using an
uploaded bill. Paid renewal must use `renewContractAndCollect` and retain its
saved-bill requirement. Do not open a collection control before upload ownership,
atomic renewal/receipt, recovery and competing-operator cases are implemented.

Evidence:

- Six service/DTO/client groups: `.backups/mobile-renewal-preparation-results.json`.
  Checks rights, read-only scope, projections, pages/search, version references,
  exact bill slot, blocked states and malformed server data.
- Two additional actual PostgreSQL groups in
  `.backups/mobile-finance-sql-results.json` (11 total including finance).
  Executes shared price/version/evidence SQL and `scopedConnect` RLS plumbing,
  including a changed next version with unchanged `xmin`.
- Full mobile suite with preparation: 68 groups,
  `.backups/mobile-renewal-preparation-client-api-20261101.log`.
- Root typecheck/lint after adding the service:
  `.backups/mobile-renewal-prep-typecheck-lint-20261101.log`.

The SQL suite uses in-memory PGlite and synthetic tables/policies; it does not
certify concurrent sessions, deployed RLS or staging performance. Production
backend build including the new GET route passed:
`.backups/mobile-finance-renewal-prep-build-20261101.log`. Native renewal
acceptance remains pending.

The typed client was also exported for iOS/Android Hermes before the subsequent
media dependency addition: `mobile/.expo/native-renewal-preparation-qa/`.
SDK 58-compatible ImagePicker, ImageManipulator and FileSystem are now installed
for bill work; photo/camera permission strings are configured, with microphone
permission disabled for this image phase. Native prebuild passed. The new native
APK and photo/upload behavior require separate build/acceptance; the earlier
financial APK has been preserved under
`.backups/mobile-finance-debug-before-media-20261101.apk`.

`mobile/src/lib/prepare-photo.ts` now prepares a selected local image without
uploading. SDK 58 decode limits cap both dimensions at 2200 before rendering;
JPEG compression tries three qualities and measures each output against the
2 MiB backend limit. It keeps the first acceptable output, releases native image
objects and exposes explicit disposal of generated cache files. It never deletes
the selected original. Invalid/oversized images and cancellation discard new
temporary outputs. Five stubbed SDK/storage groups passed:
`.backups/mobile-photo-preparation-results.json`. The later bill run verified
actual native JPEG preparation, gallery selection, camera denial and lost-upload
recovery (see bill QA). HEIC/rotation, large camera capture, picker Activity loss,
physical readability and deployed attachment concurrency remain open.

The current mobile suite including these image checks passes 73 groups:
`.backups/mobile-media-preparation-api-20261101.log`. Mobile typecheck/lint and
Expo Doctor 20/20 passed after the dependency addition. Production dependency
audit has zero high/critical and 13 moderate findings in the Expo build/config
and glob/minimatch chains; `.backups/mobile-media-dependency-audit-20261101.json`.
Automatic recommendations include incompatible major-version downgrades. They
have not been applied; assess compatible fixes/exposure before release.

Android native prebuild regenerated the CNG project through Expo. The first
Gradle attempt stopped before compilation because JAVA_HOME pointed at the JDK's
parent folder: `.backups/mobile-media-native-build-20261101.log`. The corrected
run uses `E:\Java\temurin-21\jdk-21.0.12.1+1`, Android SDK `E:\Android\Sdk`,
Gradle cache `E:\Android\Gradle` and process-only TEMP/TMP on E. It passed in
22m14s: `.backups/mobile-media-native-build-20261101-verified.log`. The resulting
96,667,760-byte APK is preserved at `.backups/mobile-media-debug-20261101.apk`;
its checksum matches the installed APK in native source-provenance artifacts.

SDK references used for this phase:
[ImagePicker](https://docs.expo.dev/versions/v58.0.0/sdk/imagepicker/),
[ImageManipulator](https://docs.expo.dev/versions/v58.0.0/sdk/imagemanipulator/),
[FileSystem](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/).
