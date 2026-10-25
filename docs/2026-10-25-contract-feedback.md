# Staff-facing contract warnings

Draft validation now identifies the affected field and explains how to correct it. The draft API returns safe field errors alongside its message; the repository keeps them for the form. Client and server errors appear in a focusable summary at the top of the form, listing every current problem. Each item opens the matching tab and input. Existing inline errors remain, and unsuccessful saves keep the current form data. Required-field validation and old-draft compatibility are preserved.

Imported ownership contracts expose only their original source-store ID and an inferred-type flag. Contract detail and the composer show a “Hồ sơ cần đối chiếu” notice when appropriate:

- The ownership type was inferred from the old system's contract group; compare the paper agreement. A three-month duration alone does not determine contract type.
- An active imported ownership contract has no valid installment schedule; check due dates, period amounts and actual receipt evidence with the responsible staff member before processing its debt.

Ordinary rentals do not receive ownership warnings. A valid schedule suppresses the missing-schedule note; closed history does not get an active-schedule warning. No import blob, private customer notes or submitted field values are included in error messages. Notices do not rewrite financial data, change permissions, or add an approval step.

Validation:

- `node scripts/check-contract-feedback.cjs`: server field validation, repository propagation, authenticated error response/rollback and contextual notice conditions.
- `node scripts/check-legacy-ownership-types.cjs`: source flags survive full/compact/index/page hydration, with consistent type filters and result counts.
- Existing optional-sales, draft and contract-tab-count regressions passed.
- `python scripts/check-contract-feedback-ui.py --url <test-server> --cookie-file <private-cookie>`: Chromium desktop and WebKit phone, summary focus, all client errors, correct tab/input links, structured server errors, retained form data, successful retry and legacy/native notice conditions. All business requests are intercepted.
- Production build includes lint and TypeScript validation. Source hashes and screenshots are retained privately under `.backups/contract-feedback-20261025/`.
