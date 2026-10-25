# Signed contract pages and lifecycle consistency

Signed contract evidence accepts multiple library photos or successive camera photos. The original first page (`rental-document-1`) and payment bill (`rental-document-2`) retain their slots; additional pages use `rental-signed-N`. Pages remain individually removable and visible in the signing/payment forms, compact uploader, gallery, and explicit whole-contract delivery. Failed saves retain pending files. Failed saved-photo reads block additions until retry, avoiding accidental replacement of an unseen first page.

Read-only investigation identified **VPS-27057, ID 56105**: stored type `rental`, workflow `renting`, no installment plan, one overdue vehicle line. Its operation store is `lease_to_own`. Lifecycle previously used that store for the displayed agreement type and replaced the derived overdue status with the stored workflow when opened. Lifecycle now uses the agreement's actual type/name, and both detail panels display the derived overdue status. Telegram routing by operation store remains separate.

Ownership hold is available only while the agreement remains within its term and has an unreturned vehicle. Overdue installments do not prevent hold before the end of the term. At/after expiration, unknown deadlines, and attempts to backdate a hold after expiration are rejected by the API. Overdue debt remains eligible for explicit bad-debt handling. The deadline comes from the installment plan, otherwise the order end, otherwise the latest unreturned vehicle end. Existing ownership-list bad-debt/hold filters and counts remain available at zero.

Rollout requires `docs/sql/2026-10-25-signed-contract-pages.sql` before application deployment. The idempotent migration extends the existing photo-slot check, preserving all prior allowances and existing photos. No order/customer/account data is rewritten.

Validation:

- `node scripts/check-signed-contract-pages.cjs`: 4 checks; includes API/permission boundaries, attachment selection, eight pages with separate bill, and migration applied twice against a TEMP table.
- `node scripts/check-contract-lifecycle.cjs`: 15 checks in an isolated schema, rolled back; covers actual type in an ownership store, overdue/expired hold boundaries, bad debt, return, settlement, and resume.
- `node scripts/check-international-media.cjs`: 6 existing media regressions passed.
- `python scripts/check-signed-contract-pages-ui.py --url <test-server> --cookie-file <private-cookie>`: Chromium desktop and WebKit phone; four-page selection, failed save/retry, append, camera, separate bill, per-page deletion, galleries, consistent type/status, hold eligibility, failed-read recovery, and ownership-list filters. Business writes and providers are intercepted.
- `python scripts/check-mobile-photos-ui.py --url <test-server> --session-cookie-file <private-cookie>`: 14 existing phone photo regressions passed.
- Production build (including lint and TypeScript) passed in an isolated tree based on `13abd8b` with the seven modified application sources overlaid. Source hashes and UI artifacts are under ignored `.backups/contract-evidence-20261025/`.

Live investigation reads only contract identity, type, workflow, and due-state metadata. QA previews use generated placeholder images and mocked uploads; no real business photo, payment, return, hold, or Telegram delivery is created by these tests.
