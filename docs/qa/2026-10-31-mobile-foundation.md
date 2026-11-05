# Mobile foundation verification — 31/10/2026

Base: `origin/main` at `6467b6a`; work on `feat/mobile-foundation`.

Implemented staff/manager app: authenticated overview, fleet/contracts/customer
catalogues, search, store/status filters, infinite pagination, record details,
account scope and server logout. Native clients use a separate versioned API,
revocable hashed sessions and SecureStore; existing web authentication remains.

## Results

| Check | Result |
| --- | --- |
| Web production build (`npm run build`) | Passed; includes four mobile API routes |
| Web typecheck and lint | Passed |
| Existing release suites (`npm run test:release`) | 44/44, external network disabled |
| Mobile API/client/security fixtures (`npm run test:mobile`) | 8/8 groups |
| Branch/RLS regression (`npm run test:account-scope`) | 25/25; no operational writes or sequence changes |
| Scoped database pool (`npm run test:scoped-pool`) | 3/3; read only |
| Mobile TypeScript and ESLint | Passed |
| Expo Doctor | 20/20 |
| iOS and Android JS/Hermes export | Passed with Expo SDK 58.0.22 |
| Browser UI with intercepted synthetic API | 18/18; zero page errors, real logins or operational writes |
| npm dependency audit | 0 high/critical; 25 moderate advisories overall, 12 with dev dependencies omitted |

UI viewports: 375×812 light, 430×932 dark, 812×375 landscape and 1024×768
tablet dark. Reduced motion enabled. Checks cover bad credentials and preserved
input, login, overview, searching and empty results, infinite pagination, record
navigation/back, store/status filters, network failure/retry, account scope,
logout, hidden restricted tabs and 401 expiry. Screenshots and JSON evidence:
`.backups/mobile-ui-20261031/` (synthetic records only).

The UI tests caught and fixed an ambiguous root/index route that left a blank
screen after logout. The root now follows Expo's documented protected group
structure. Session tests also cover serialized secure storage operations and
removing stale unauthorized callbacks. Runtime response validation prevents an
incompatible server response from becoming a partially initialized session.

Two existing release assertions were stale relative to upstream behavior:
`contract-summary` did not include bad-debt rentals in the active rental tab;
`ownership-terms` expected the old draft fields to remain identical after the
upstream correction now deliberately mirrors term/daily-price fields. Tests
were aligned with the existing implementation and still assert financial totals,
receipts and installment schedules are preserved. No business implementation
was changed to make these tests pass.

## Repeat the UI checks

```powershell
cd mobile
$env:EXPO_PUBLIC_API_URL='https://mobile-api.example.invalid'
npx.cmd expo export --platform web --output-dir .expo/web-preview
cd ..
python -m http.server 8083 --bind 127.0.0.1 --directory mobile/.expo/web-preview
# In a second terminal from repo root:
python scripts/check-mobile-ui.py
```

The script blocks non-local hosts other than its intercepted fixture API. The
production backend deliberately rejects browser Origin headers; web preview is
a shared UI test target and does not provide a production authentication bypass.

## Release boundary

This is the first read-only business milestone. The migration is prepared but
has not been applied to the production database, and the production mobile API
has not been enabled or deployed. No signed IPA/APK was built or submitted.
Native Keychain/Keystore, VoiceOver/TalkBack and physical-device behavior remain
unverified. Apple/Expo project ownership and signing must be configured before
native-device acceptance testing. Contract writes, payments, camera/OCR, uploads,
push notifications and offline drafts remain subsequent milestones.

See [architecture and rollout](../mobile-architecture.md) and the
[migration](../sql/2026-10-31-mobile-sessions.sql).
