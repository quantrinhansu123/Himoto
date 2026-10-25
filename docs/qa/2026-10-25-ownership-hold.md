# Ownership hold and uncollectible debt QA

Business rules: [ownership-hold-workflow.md](../ownership-hold-workflow.md).

Validated in an isolated checkout based on `32d2e7d`, preserving the account permissions, image selection, vehicle swap and Telegram changes already on main. No new migration is required.

## Checks passed

| Check | Cases |
| --- | ---: |
| `node scripts/check-contract-lifecycle.cjs` | 22 |
| `node scripts/check-contract-lifecycle-api.cjs` | 5 |
| `node scripts/check-contract-billing.cjs` | 12 |
| `node scripts/check-contract-payments.cjs --live-temp` | 16 |
| `node scripts/check-contract-renewals.cjs --live-temp` | 5 |
| `node scripts/check-return-corrections.cjs` | 12 |
| `node scripts/check-rental-revenue.cjs --live-temp` | 6 |
| `node scripts/check-management-table.cjs` | 10 |
| `node scripts/check-contract-list-filters.cjs` | 5 |
| `python scripts/check-contract-lifecycle-ui.py --url <local-production-server> --sessions <private-fixtures> --output <private-artifacts>` | 54 |

`npm run build`, TypeScript, ESLint and `git diff --check` passed. Browser coverage uses Chromium 1440×950 and WebKit 390×844 for administrator, ownership staff and accounting roles. No JavaScript errors or horizontal overflow were observed.

The database cases use temporary tables or a transactionally rolled back schema with private sequences and real scoped RLS. Browser mutations and Telegram/provider requests are intercepted; 74 simulated writes, zero real business writes and zero Telegram requests. One database connection reset required a retry; the repeated correction suite passed all 12 cases.

## Financial and workflow evidence

- Payment lateness is captured at hold entry, including backdated entries. Later debt repayments cannot make an originally overdue hold resumable. Later one-time fees and their receipts are excluded together from the earlier classification.
- Expiration changes the visible warning while keeping the reserved workflow. A clock-advance browser case verifies that no mutation occurs. No additional warning column is created.
- Resume shifts only unaccrued installments and the original deadline by the actual pause; it preserves amounts, earlier receipts and historical vehicle lines. Two-month and last-paid-period cases are included. Unavailable or overlapping vehicles roll back the whole operation.
- Completion records uncollected accrued fees as **Tổn thất công nợ**, cancels future periods, clears debt monitoring and archives the original schedule and totals. It preserves actual receipts, paid totals and deposit liabilities. Partial real rental revenue remains exactly equal before and after completion; no income or expense is fabricated.
- Completed holds cannot be resumed, charged through an extra receipt, reopened through historical renewal, or financially revised through the return correction flow. Existing ordinary renewal, return correction and real deposit/refund behavior remains covered.
- The completed-hold payment screen explains the loss and offers no new collection action. Staff without accounting access do not receive a cashbook shortcut.

Local authenticated read checks also passed: anonymous lifecycle 401, ownership table 200, lifecycle 200 with the new hold fields, and completion against a verified nonexistent contract 404. No real contract was changed for this verification.

The production deployment of `ed1727c` also passed the same 54 browser checks and authenticated API checks, with zero real business writes and zero Telegram requests. Visual inspection identified narrow three-column summaries on phones; the follow-up layout uses one column below 640px and normal paragraph weight. Two focused Chromium/WebKit layout checks passed locally, preserving three desktop columns and confirming no horizontal overflow.

Private JSON reports and screenshots are stored under ignored `.backups/ownership-hold-20261025/`; authentication material is removed after verification.
