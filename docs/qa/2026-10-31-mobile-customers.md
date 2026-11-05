# Mobile customer workflow QA — 31/10/2026

Scope: create/edit customers in the staff application, preserving the existing
web validation, duplicate prevention, store scope and PostgreSQL RLS. This is a
development milestone; the full mobile roadmap remains active.

## Implemented

- Incomplete/domestic/foreign profiles, branch selection, contacts, status and
  warnings; optional identity/licence dates and up to two relatives.
- Native date pickers; inline validation; persistent save action; confirmation
  before discarding edits or replacing them with a newer server version.
- One transaction for the customer write and actor-specific idempotency receipt.
  Updates require the original revision. Uncertain responses retain the same key.
- SecureStore keeps opaque request metadata, without form contents. Reopening
  can recover a committed result. Unsaved forms remain in memory only.
- Shared customer domain service used by both mobile and existing web routes;
  the web route retains its existing authentication, scope and response shape.

## Verified

- API/client foundation: 8 groups; palette/contrast/preset checks: 3 groups.
- Customer validation, scoped writes, duplicate/conflict/retry handling, receipt
  visibility, payload validation and pending-request storage: 9 groups.
- Write migration: 4 PostgreSQL RLS groups in an isolated temporary schema, with
  the entire schema/test transaction rolled back. No operational rows or
  operational sequences were used.
- Browser acceptance: **35/35**, including customer create/edit, optional
  documents/relatives, foreign contacts without a phone, conflict reload,
  response loss after commit, unsaved navigation and receipt recovery.
  Light/dark, portrait, landscape and tablet layouts were exercised.
  No browser errors or unexpected network hosts were recorded.
- Existing business regression suite: **44/44** after extracting the shared
  customer service.
- Backend production build generated successfully, including all 7 mobile
  routes. Backend and mobile typecheck/lint passed; Expo Doctor passed 20/20.
- iOS and Android release JS/Hermes exports passed after the final UI changes
  (`mobile/.expo/native-customers-qa/`). These are bundles, not signed apps.
- Android native acceptance completed on 01/11/2026: **10/10** groups, including
  the system date picker, customer create/edit, recovery of a committed write
  after a failed response and process termination, Keystore restoration and
  logout across relaunch. All business responses came from the loopback fixture.

Final browser evidence:
`.backups/mobile-customers-ui-20261101/results.json` and PNGs (**35/35**).
The browser uses intercepted synthetic responses and does not bypass the real
native API's Origin rejection. Browser checks do not certify native behavior.
Native evidence: `.backups/mobile-customers-native-20261101-fresh/results.json`
and screenshots. The blank, project-owned Android 35 Pixel 7 AVD used a
720×1600/280-dpi display override. No physical device is certified by this run.

## Android artifact

The development APK built successfully with the native date-picker module:

- Path: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- Size: 96,424,300 bytes.
- SHA-256: `21b029f8fb0615af05a91a4e0f98ca72a0becd69e3d00c7c32d62d039512ade5`.
- Android x86_64, debug signed, local synthetic API; not a release build.
- Build time: 16m 8s on this 8-GB Windows host; CMake 3.31.6, one Gradle worker.

The original foundation APK's 7/7 result is historical; the new 10/10 result above
covers the date-picker APK. Initial attempts exposed an Android System UI ANR
under host memory pressure and flaws in the test harness: overlapping UI
Automator readers could leave stale XML, and IME resizing could move tap targets.
The successful suite uses one reader, unique hierarchy paths, verified focus and
the native keyboard Next action. Failed attempts remain in their separate QA
directories and are not counted as passes. See [native testing](../mobile-native-testing.md).

React Native Web already resolves `System` to the platform font stack; computed
styles confirmed this for text and inputs. The HTML date field explicitly uses
that stack as well.

The mobile workflow includes browser regression and uploads its evidence on CI.
It has been checked locally; no remote workflow run is claimed before pushing.

Dependency audit with development packages omitted reports 13 moderate findings
in the Expo tooling dependency graph and no high/critical findings. The suggested
forced fix downgrades Expo across major versions and was not applied.

## Rollout boundaries

Both mobile SQL migrations are prepared for review, not applied to production.
No production feature flag or staff account was changed. Signed iOS builds,
physical-device acceptance, native screen readers/large text and release
performance remain outstanding. Contract preparation, issuance/handover,
payments, returns, transfers and media workflows remain on the roadmap.
