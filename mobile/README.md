# Himoto Staff

React Native + Expo SDK 58. iOS/Android application for Himoto staff and managers.
Architecture, backend migration, security and rollout: [mobile-architecture](../docs/mobile-architecture.md).

Available: scoped sign-in, overview, vehicle/contract/customer lookup, and customer
creation/editing and a four-step contract draft composer with revision checks,
safe retries and receipt recovery across reauthentication. Focused Android draft
acceptance has passed; signed iOS/physical-device acceptance and operational
write workflows remain in progress; see [the roadmap](../docs/mobile-roadmap.md).

Contract preparation, issuance with explicit initial collections, rental-advance
reservations and handover are implemented with the shared domain/replay checks.
Selected Android emulator contract/recovery acceptance passed 12 groups;
signed release and physical-device acceptance remain open.
[Evidence and limits](../docs/qa/2026-11-01-mobile-contract-actions.md).

Account reconciliation now recovers committed results or permanently cancels
uncommitted request keys on the server before removing device metadata. This
prevents a delayed copy of the cancelled request from executing. See
[recovery QA and remaining gates](../docs/qa/2026-11-01-mobile-write-recovery.md).

Contract finance now supports scoped history and five actual receipt/refund
purposes with financial grants, revision/reviewed-balance checks, explicit
confirmation and locked recovery of uncertain writes. Selected Android emulator
finance acceptance passed 12 groups in full mode, with no new app crashes/ANRs.
[Financial evidence and remaining gates](../docs/qa/2026-11-01-mobile-finance.md).

## Development

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
# Set EXPO_PUBLIC_API_URL to the configured backend's HTTPS origin.
npm.cmd start
```

Use a development build for the project. On Windows, build iOS in EAS:

```powershell
npx.cmd eas-cli@latest login
npx.cmd eas-cli@latest init
npx.cmd eas-cli@latest build --platform ios --profile development
```

These commands require the owning Expo/Apple accounts and device provisioning.
They are not run automatically. `preview` builds are for internal QA; `production`
builds require the release acceptance process described in the architecture doc.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npx.cmd expo-doctor
npm.cmd run export:native
```

From the repo root run `npm.cmd run test:mobile` for the server/client contract,
authentication, permission, customer write/recovery and network tests, using
synthetic data only. `node scripts/check-mobile-write-scope.cjs` additionally
checks the write migration in an isolated PostgreSQL schema and rolls it back;
it requires the existing server DB environment and changes no operational rows.
Financial SQL also has a fully offline, in-memory PostgreSQL suite. Follow the
two pinned-runtime commands in [financial QA](../docs/qa/2026-11-01-mobile-finance.md#reproduce-isolated-sql-acceptance)
to run `test:mobile:sql` without DB credentials. Concurrent-session races and
the deployed policies/performance still require staging acceptance.

Run `python scripts/check-mobile-ui.py` and `python scripts/check-mobile-draft-ui.py`
from the repo root against a local web export for browser regression/acceptance;
results and boundaries are in [the composer QA report](../docs/qa/2026-11-01-mobile-drafts.md).

Local Android APK build, loopback fixture setup and emulator acceptance:
[native testing](../docs/mobile-native-testing.md).

Use `npm.cmd run web` for UI development. Web preview intentionally keeps the
session in memory and does not bypass the native API's browser-origin rejection.
Use intercepted fixture responses for browser UI checks; use real iOS/Android
development builds for native authentication tests.
