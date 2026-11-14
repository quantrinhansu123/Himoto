# Telegram renewal preparation — 13/11/2026

## Incident and result

Contract `VPS-29021` (active order `57520`) could not open the Telegram panel for its renewal covering 7–9 November, despite receipt `187915` being approved for VND 400,000 by personal bank transfer.

The saved rental correction contains second-resolution local times, including `2026-07-21T18:45:58`. The old preparation appended `:00+07:00` unconditionally and attempted to serialize an invalid date. Because the panel prepares every event, the unrelated rental exception also hid valid renewal periods. The latest nine periods were waiting for a manual send, with no manual delivery attempt or acknowledged Telegram message IDs; this was a preparation failure before Telegram transport.

The parser now accepts minute, second and fractional precision, existing UTC/offset values and PostgreSQL Date objects. Unzoned business times use Vietnam time independently of the server timezone. Invalid calendars and clocks produce a controlled preparation error. Stored contracts, receipts, original dates and delivery snapshots are not rewritten.

Each contract event prepares independently. A bad event is visible with a reason and refresh action, has no sendable payload, and cannot be queued by a crafted request. Other valid events remain available. Malformed historical text retains its acknowledged message IDs and retraction controls. Database failures still fail the request; they are not misrepresented as bad customer data. A malformed queued date fails as `NOTIFICATION_INVALID` before any Telegram POST.

Receipt matching compares normalized instants and the existing period identity checks. Reused version numbers, changed coverage and cancelled receipts do not attach an unrelated payment. Template parsing does not modify the hash algorithm or historical snapshots. Existing permissions, topic leases, continuation offsets, explicit reconciliation and duplicate-send guards remain enforced.

## Validation

- 55 offline release suites passed, including date preparation and payment-method amounts. The payment suite's older fixture now includes real period bounds and an additional same-version/different-period receipt; its read-only assertion also supports SELECT CTEs and the existing row lock.
- Six date/preparation unit groups cover UTC, Vietnam and New York host timezones, strict invalid dates, all twelve contract/vehicle/battery message templates, receipt matching and unchanged input snapshots/hashes.
- Dedicated loopback PostgreSQL runs passed: preparation (11 groups, six specific to this fix), contract controls (12), recovery (13), media/continuation (11), vehicle transfer (8), vehicle swap (8), retraction (11), ownership (15). These counts include shared harness checks. Each invocation rolls back its isolated schema and reports zero operational writes, sequence changes or real Telegram requests.
- The preparation integration reproduces the exact seconds bug, preserves 58 seconds, checks the approved receipt and personal-transfer amount, sends the valid renewal through a fake transport while the rental is invalid, retains historical message IDs and retraction access, blocks invalid requests, and allows database exceptions to propagate.
- Isolated PGlite battery workflow passed six groups (rental, renewal, late collections, return media supplements, routing, permissions and idempotency); report media passed three groups (ordered attachments/summary, partial retry, uncertain-send protection and routing).
- Renewal-period matching, battery message text, Safari AbortSignal compatibility and committed-send/preview-timeout suites passed separately.
- Chromium desktop and WebKit at an iPhone-sized viewport passed 20 browser cases: existing recovery states plus blocked preparation, refresh and sending a different valid period. No JavaScript errors, real Telegram requests or operational writes. Screenshots/report: `.backups/telegram-renewal-vps-29021-20261113/ui/`.
- TypeScript, source ESLint and the Next.js production build passed.

## Read-only production checks

- Full panel preparation for order `57520` returns all 13 events with no preparation errors. Period `renewal:57520:12` binds receipt `187915`, one photo, 7 November 18:45 → 9 November 18:45 ICT, VND 400,000 and personal bank transfer.
- Rendering 5,000 most recent notification snapshots from the last 30 days passed: 1,309 rentals, 1,409 renewals, 1,393 returns, 27 swaps, 474 transfers, 386 receipts and two battery returns. This audits message content; it does not assert 5,000 successful network deliveries.
- All four active contracts carrying rental correction history have readable dates after the fix. One was rejected by the old parser. No contract or financial record was changed by the checks.

Evidence: `.backups/telegram-renewal-vps-29021-20261113/after-fix-readonly.json` and `date-cohort-readonly.json`.

## Deployment and limits

Production marker: `telegram-renewal-time-v3-20261113` at `/deployment-check.txt`. GitHub `main` deploys through the existing Vercel integration; exact commit, deployment status, public marker, authentication boundary, worker health and the final read-only target preview are recorded in the ignored incident directory.

No migration, forced resend, historical bulk replay or fake Telegram message is required. The affected operator should refresh the website, open the contract, select the correct renewal period and send through the normal reviewed flow. An already sent/queued period stays subject to the existing duplicate-send guards. An ambiguous network result requires reconciliation; it is never automatically replayed.

The fix removes the reproduced preparation failure. Telegram availability, connectivity and permissions can still fail; observed code/test coverage is not a guarantee that every external request will succeed.
