# Local Android acceptance

Current workspace note (02/11): follow
[the latest handoff](mobile-handoff-2026-11-02.md) before starting any server.
Legacy fixture 8091 stopped with uncheckpointed RAM; do not run the historical
blank startup command below against that port. Preserve live return/swap
fixtures 8093/8094. The transfer suite below uses its own durable checkpoint.

This run uses a development APK and synthetic API. It does not certify an iOS
build, a physical device or readiness for staff rollout. Current results are in
[the customer QA log](qa/2026-10-31-mobile-customers.md).

## Prepare the fixture and Metro

These are historical fresh-workspace instructions; they do not authorize
replacing the current workspace's prior fixture state.

From the repository root, in one terminal:

```powershell
python scripts/mobile-fixture-server.py
```

From `mobile/`, in another terminal:

```powershell
$env:EXPO_PUBLIC_API_URL='http://10.0.2.2:8091'
$env:EXPO_NO_TELEMETRY='1'
$env:EXPO_NO_DEV_MENU='1'
npx.cmd expo start --dev-client --host localhost --port 8081 --max-workers 1
```

`10.0.2.2` addresses the Windows host from the Android emulator. These are local
fixture settings only. A physical iPhone cannot use this Android emulator URL.
Keep the production build's configured HTTPS origin and backend rollout separate.

Do not copy the repository root's environment file into `mobile/`. The fixture
API binds only to `127.0.0.1:8091`; `/health` must return `fixtureOnly: true`.

## Build on Windows

Install dependencies in `mobile/` with `npm.cmd ci`. Set `JAVA_HOME`,
`ANDROID_HOME` and `ANDROID_SDK_ROOT` to the installed JDK/SDK paths. Generate the
native project through Expo; generated Android/iOS files remain ignored.

```powershell
npx.cmd expo prebuild --platform android --no-install
Set-Location android
.\gradlew.bat :app:assembleDebug --no-daemon --console=plain --max-workers=1 '-Dorg.gradle.parallel=false' '-Dorg.gradle.jvmargs=-Xmx1280m -XX:MaxMetaspaceSize=512m' '-Pkotlin.compiler.execution.strategy=in-process' '-Pandroid.cmakeVersion=3.31.6' '-PreactNativeArchitectures=x86_64'
```

The one-worker settings are for the 8-GB development host. Stop the emulator
during the initial build if memory pressure causes worker connection timeouts.
Native CMake/Ninja compilation may still use multiple compiler processes.
The first build downloads Gradle, SDK packages and native dependencies. Native
compiler warnings and JavaScript bundle export do not prove APK success.

This Windows host has long paths enabled. Install the Android SDK's CMake
3.31.6 package (Ninja 1.12.1) through SDK Manager before the above command. Its
older CMake 3.22.1/Ninja 1.10.2 combination failed on Gesture Handler's generated
C++ object path. Passing `android.cmakeVersion` on the command line keeps this
Windows workaround local; no generated native file or global Gradle setting is
edited. See [Expo's Windows long-path guidance](https://docs.expo.dev/troubleshooting/windows-long-paths/).

The expected artifact is
`mobile/android/app/build/outputs/apk/debug/app-debug.apk`. This is an x86_64,
debug-signed development build for an emulator, not a production distribution.

## Install and run acceptance

Use a dedicated blank QA AVD, rather than another project's existing device.
This workstation's `Himoto_QA_20261031` lives under the ignored
`.backups/android-avd/` directory. Set `ANDROID_AVD_HOME` to its absolute path
before launching it. It uses the installed Android 35 Google APIs x86_64 system
image and Pixel 7 device definition. Read-only mode avoids retaining test writes
on its base disk. On an 8-GB host, finish building before starting the emulator.

Using the installed `adb` executable, select the intended emulator explicitly:

```powershell
adb -s emulator-5554 install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
python scripts/check-mobile-native.py --adb E:/Android/Sdk/platform-tools/adb.exe --serial emulator-5554 --customers --drafts --output .backups/mobile-draft-native-20261101
```

Run these from the repo root. The suite checks the transformed Metro bundle's
fixture origin before entering credentials and refuses physical-device serials.
It uses `qa` / `fixture-password`, never a real staff account. It exercises native
keyboard entry, protected navigation, search, filters, hardware Back, process
termination/session restoration and logout across relaunch. With `--customers`
it also checks the Android date picker, customer creation/editing and recovery
of a committed write after process termination. The fixture deliberately returns
one 503 after committing `Native-Lost-Response`; receipt recovery must not create
another customer. Screenshots and successful results are saved in `--output`.

With `--drafts` it also checks Android date/time pickers, customer confirmation,
stock selection, draft creation/reopening/update, unsaved hardware Back and
receipt recovery after both process termination and sign-out/sign-in. The local
fixture returns a committed-but-unacknowledged 503 for paper number `90003`.
Its fixture state endpoint exposes only synthetic counters/document identifiers
used to assert that recovery did not create a second contract.

For focused write iterations, `--customers --drafts --writes-only` reuses an
existing fixture login after checking the compiled API origin and QA identity.
It still checks process restoration and logout, but skips fresh sign-in and
catalogue regression. Its result explicitly records `mode: writes-only`; do not
count it as a full acceptance run. Use the default mode for a complete rerun.

`--contracts` exercises the separately seeded synthetic financial contracts:
legacy-window review/alignment, issuance with an initial collection, a committed
reservation with a failed response and process restart, and handover without
collecting its advance twice. The fixture deliberately fails the first response
for reservation ID 3002. Reuse the existing APK; these screens add no native
dependency. Always restart the owned fixture process after fixture source changes.

The extended `--contracts` suite also verifies Account reconciliation after
process termination: one request lost before commit is cancelled with a server
tombstone only after confirmation, and one committed request recovers its saved
result without another collection. It adds two groups (12 total in full mode).
Account logout now scrolls to the real control below the recovery card.

`--finance` selects the dedicated synthetic contracts 4001/4002 and financial
workflows. It checks exact recorded receipts, cash/personal/company account IDs,
deposit collection, deposit/rental refunds, explicit over-collection, committed payment recovery
through Account after process termination, and server-confirmed cancellation of
an uncommitted payment. It adds five groups to the seven baseline/session groups
in full mode (12 total). Restart the owned fixture after source changes. The
native harness records crash and ANR buffers and rejects new app crashes or
`am_anr` events in that run.

`--scope-recovery --writes-only` needs a fresh synthetic fixture and checks one
committed payment across a branch-to-all-stores grant change and process restart.
It must recover the same UUID from Android SecureStore and return the exact
transaction before another payment can be recorded. It then checks session
restoration and logout (three groups, explicitly `writes-only`). The loopback-only
`/__fixture_scope` control belongs to the QA server, not the application API.

`--bills` checks camera permission denial, system-picker cancellation, actual
native JPEG preparation, bill review/upload, explicitly reviewed replacement,
lost-response recovery after process termination, and durable cancellation of an
uncommitted upload. The media development APK must contain ImagePicker,
ImageManipulator and FileSystem. There are four bill groups plus seven baseline/
session groups (**11 full**), or **6** with `--writes-only`. The suite refuses a
fixture with previous bill writes; acknowledge all device keys before resetting
the owned synthetic server. It never clears app data to bypass recovery.

`--bills --writes-only --bill-preview-only` is a smaller zoom/Back/discard check,
followed by session restoration/logout (**3 focused groups**). It accepts existing
bill counters and must leave image writes and money unchanged. This is useful
for the viewport fix; it does not substitute for the 11-group workflow.

`--renewals` targets the new editor with fresh synthetic contracts: unpaid fee/
date changes with native date/time controls, paid rental/outside receipts, bill
upload returning to the preserved form, lost-response recovery through Account
after process termination, and cancellation with retained input. Its expected
scope is four renewal groups plus seven baseline/session groups (11 full), or
six with `--writes-only`. Check the result instead of treating these expected
counts as a pass. No deployment/migration or operational data is used.

On this host, set process-only `TEMP` and `TMP` to
`E:\Himoto\.backups\mobile-tmp` before launching Expo, Playwright or the emulator.
The directory must exist. Drive C ran out of space during Hermes export and AVD
startup; the Admin Metro helper was updated to use this same E directory.
Inspect free disk/memory before running multiple native build tasks together.

Run only one UI Automator reader on the selected emulator. Parallel inspection
can disconnect the automation service. The harness verifies that each dump
produces a new XML file, filters clipped/invalid bounds and checks text-input
focus before typing. It determines keyboard visibility from display insets;
hidden keyboard nodes alone are insufficient. Scrolling waits for the
interactive control, rather than only its text label at the viewport edge.
The 01/11 acceptance run used a 720×1600/280-dpi display
override on the project QA AVD; this does not alter a physical device.

The suite prewarms the full Hermes development entry before timing app UI. The
first cold Metro compilation on this host exceeded five minutes; these debug
timings do not establish production startup performance.
It also probes Metro and the synthetic API from the emulator: Android's boot
flag can become ready before its network. Generate HTTP line endings on-device
because Windows adb shell stdin can alter CRLF. During a native run, freeze all
mobile/shared source and generated route changes; Fast Refresh can reset the
navigation and invalidates that run. Keep failed artifacts and use a new output
directory for the next attempt. Wait for the bill form after closing the zoom
modal before sending a second Back.
New runs save `source-provenance.json` with the installed APK checksum, prewarmed
development entry hash and an explicit mobile/assets/shared/config snapshot
which excludes all local environment files. A changed snapshot fails acceptance
at the end. A post-run-only snapshot is labelled as such and cannot establish
the before/after guard for an older run.

Regular AOSP images may need an explicit association with the synthetic
`AndroidWifi` network after boot (`adb shell cmd wifi connect-network AndroidWifi
open` on the dedicated QA AVD). Verify host service reachability again before
starting. The input harness must check actual IME insets before dismissing the
keyboard; blindly sending Back can close the Activity when a hardware/Next
action already hid it. Prefilled fees use explicit selection/replacement and a
value check; do not append test values to a suggested amount.

`check-mobile-native-diagnostics.py` covers timestamp/process boundaries and
unknown-start handling. New harness failures retain crash/ANR buffers and
`runtime-diagnostics.json` as well as screenshots/XML. A run which never reached
its start timestamp reports unknown counts, not zero. System UI ANRs are
reported separately from app ANRs. Earlier failure artifacts may have been
collected manually; their original verdicts remain unchanged.

VoiceOver/TalkBack, larger system text, camera/media, physical-device behavior,
iOS signing and all write workflows have separate acceptance requirements in
[the mobile roadmap](mobile-roadmap.md).

## Transfer acceptance with a durable fixture

Use a new, free port and a new checkpoint name for an independent run. The
following example uses 8107; verify the port is free first. All credentials,
stock and events in this service are synthetic. It never opens a database or
reads environment files. Start from the repository root:

    python scripts/mobile-transfer-fixture-server.py --port 8107 --state-file .backups/transfer-qa-new/state.json

Keep the verified physical-device Metro on 8081 with API origin 127.0.0.1:8091.
Finish builds/tests before running the native UI suite, freeze source/QA scripts
and run only one UIAutomator reader. The suite temporarily maps phone port 8091
to the selected host fixture port and restores the original route on success:

    python scripts/check-mobile-transfer-native.py --serial 282a05859f3f7ece --fixture-port 8107 --output .backups/transfer-native-new

The fixture gives separate sessions to sender qa and receiver qa8 (qa-receiver
is also accepted for browser tests). The short receiver alias avoids the
physical phone's Telex composition changing the typed account name. The suite
does not change the user's keyboard, autofill, installed apps or device data.

Checkpoint writes include full stock/events, actor-scoped request/body/proof,
tombstones, sessions/revocation and delayed envelopes. The service locks one
owner, validates existing state before listening, fsyncs an atomic replacement
before responding and refuses corrupt/incomplete initial state. Restarting
must reuse the exact checkpoint; verify digest/generation and proofs before
resuming. Never delete/replace a checkpoint or infer its contents from counts.

For a retry after a partial suite, first reconcile any pending device key.
Append an unused synthetic dataset, then run with the matching vehicle base:

    Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8107/__fixture_dataset -ContentType application/json -Body '{"base":7200}'
    python scripts/check-mobile-transfer-native.py --serial 282a05859f3f7ece --fixture-port 8107 --vehicle-base 7200 --output .backups/transfer-native-retry

Existing IDs are rejected instead of overwritten; pick another unused hundred
for subsequent attempts.
The runner requires no prior receipts in that dataset and checks that earlier
transfer proofs and return/swap fixtures stay unchanged. Its result describes
one focused transfer suite, not whole-app or signed-release acceptance.

Fixture durability/actor checks can run without a device:

    python scripts/check-mobile-transfer-fixture.py

They use unique checkpoint directories inside .backups and terminate only
the test server they spawned. They do not reset a live acceptance fixture.

## Record-media physical checks

The media fixture uses its own durable journal. Preserve existing records,
photos, original receipts, delayed bodies, tombstones and device pending keys.
For a new full run, append an unused dataset instead of resetting a used one:

    python scripts/mobile-media-fixture-server.py --port 8099 --state-file .backups/mobile-media-fixture-20261102/state.json
    Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8099/__fixture_dataset -ContentType application/json -Body '{"base":9300}'
    python scripts/check-mobile-media-native.py --serial 282a05859f3f7ece --fixture-port 8099 --dataset-base 9300 --output .backups/media-native-next

Start the fixture only if no process owns that journal/port. Metro must use the
QA API8091 with EXPO_NO_DOTENV=1. One reader freezes mobile/shared/QA for the
whole run; it temporarily reverses phone8091 to fixture8099 and restores the
exact previous mappings in finally. Only the uniquely named synthetic QA JPEG
may be selected. A GMS backport picker may require manual selection because it
does not expose the filename; never select an unidentified personal thumbnail.
The runner fails on native error overlays, preserves failure artifacts and
requires an untouched dataset for new writes. `--recover-contract <id>` can
reconcile one known original QA receipt through Account before that new run.

For an existing journal, verify the final ledger without media mutations:

    python scripts/check-mobile-media-native.py --serial 282a05859f3f7ece --fixture-port 8099 --dataset-base 9200 --ledger-only --output .backups/media-native-ledger-next

This checks Account's actual empty-ledger message plus session restoration and
logout, with no picker/upload/resolve/ack of image requests. It preserves all
receipts/tombstones and refuses to combine recovery acknowledgement with this
mode. The focused media8/8 and separate ledger3/3 results on02/11 do not certify
camera, video, HEIC, picker Activity death, cache/memory or signed iPhone/release.
See [media QA](qa/2026-11-02-mobile-record-media.md).

References: [Android emulator host addresses](https://developer.android.com/studio/run/emulator-networking-address),
[Expo development workflows](https://docs.expo.dev/develop/development-builds/development-workflows/),
[Gradle build configuration](https://docs.gradle.org/current/userguide/build_environment.html).
