# Production review — 28/10/2026

Target: `https://app.himoto.vn`, after the DigitalOcean migration. Current Supabase business data is retained; the old Laravel application remains archived.

## Findings addressed

- Login configuration was evaluated while building an artifact without production credentials. `/login` now renders for each request. Packaging rejects a static login page, and activation requires enabled login controls.
- Updated Next.js from 15.5.25 to 15.5.28, follow-redirects to 1.16.2, and the pinned transitive Zod dependency to 4.6.7. Production dependency audit returned zero known vulnerabilities. The security patch was deployed as `53b145a`.
- The previous origin monitor treated the new application's intentional root redirect as a failure. The monitor now checks `/api/health` against the selected release and verifies the login form. It retains marketing, firewall, service, and backup checks.
- Legacy/MySQL backups did not cover the new Supabase application. Added a separate read-only daily backup of the new `himoto` schema and private runtime configuration, with full archive decoding before publication, SHA-256 verification, and fourteen-snapshot retention. First archive: 96,083,284 bytes; checksum matched.
- Updated regression fixtures that still expected photo permissions and status tabs from before the existing 26/10 photo policy and later lifecycle changes. No business permissions were broadened by this review. Added missing staff attribution metadata to the isolated reservation database fixture.
- Deployment now gates on type checking, lint, 34 offline core suites, ten Python release/operations checks, and production dependency security audit.

## Verified coverage

| Layer | Evidence |
| --- | --- |
| Browser pages | 22 authenticated screens in desktop Chromium and 22 at 375px in WebKit; no application JavaScript errors, failing same-origin responses, visible error alerts, broken images, or horizontal document overflow |
| Login interactions | Enabled fields and submit, validation and focus, password visibility, negative credential validation, uncached reload, legacy URL redirect, authenticated redirect, and a following anonymous request |
| Core regression gate | 34 offline suites; external network is blocked even when local environment files exist |
| Financial transaction fixture | Eight isolated PGlite scenarios: rental advance, cash/bank balances, handover, stock availability, outstanding rent, retry/overcollection protection, and rollback after receipt insertion |
| Release/operations | Five release tests plus five backup/monitor tests, including exact release identity, failed activation rollback, disabled login rejection, backup atomicity, credential handling, and failure monitoring |
| Production API | Read-only role/session/customer/vehicle/contract/GPS probes; anonymous denial, branch isolation, photo/video reads, and invalid login/scheduler rejection |
| Integrations | Existing integration scheduler enabled with recent HTTP 200 and no error; canonical endpoint selected |
| Infrastructure | Valid Nginx configuration, valid public TLS, runtime environment permissions, application restart count, memory/disk availability, active timers, latest backup hash, and monitor report with no issues |

Screens covered: vehicles, transfers, customers, contracts, ownership, overdue, due, drafts, VAT, battery contracts, contract types, cashbook, staff, sales reports, duty roster, stores, accounts, shift reports, debt reminders, GPS, integrations, and counter operations.

The initial inventory included database-dependent/manual scripts. These are not counted as passed merely because they need a session, synthetic video, or a separate database. Photo-policy assertion drift was corrected using the recorded product change `f703bb9`; database cases remain separate from the offline release gate.

## Reproduce the automated gate

```text
npm ci
npm run typecheck
npm run lint
npm run test:release
python scripts/check-server-release.py
python scripts/check-production-ops.py
npm audit --omit=dev --audit-level=high
npm run build
```

The reservation SQL fixture additionally uses `scripts/check-contract-reservations.cjs --pglite-path <isolated-PGlite-package>`. Private browser screenshots, session files, and server probe outputs belong in ignored local QA storage, not this repository.

## Limits of this review

Financial mutations use mock/isolated data; no real customer payment, contract completion, refund, device command, or manual external notification was issued for testing. Public/read-only production checks complement those transaction fixtures. This is functional and operational verification at the review time, not a high-concurrency load test or a certification that all future failures are impossible. Archive decoding/checksums passed; a full restore to a disposable PostgreSQL instance was not performed.
