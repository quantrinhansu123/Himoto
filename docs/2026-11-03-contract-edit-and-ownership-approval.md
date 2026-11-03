# Full contract editing and ownership approval

Issued contracts now use `PATCH /api/auth/order/car-rental/:id/edit`. Staff with `contracts.draft` can edit every contract form field, including deposits, rates, totals, fees, dates, type, customer details, signers and vehicle selection. The transaction updates canonical rental lines, stock and order values together; receipts remain the source for actual money received. Before/after data is retained and exposed in contract history. Editing clears the current approval so the changed contract can be reviewed again.

Ownership approval is visible on desktop and mobile for issued contracts as well as the existing draft flow. Eligibility includes ownership rental types and ownership source stores, so a daily contract belonging to `lease_to_own` is not missed. The new `GET/PATCH /api/auth/order/car-rental/:id/approval` records manager/admin approval, actor and time without changing rental status, stock or money. Stale revisions reject the approval. A repeated approval does not duplicate it.

Validation:

- Production build and TypeScript checks.
- ESLint on changed files.
- `node scripts/check-contract-edit.cjs` and `node scripts/check-contract-edit-api.cjs`.
- `node scripts/check-contract-full-edit.cjs --live-temp`: isolated PostgreSQL fixture schema, rolled back; covers staff permissions, stale versions, money/deposit/dates/drivers, reopen persistence, replacement vehicle stock, ownership-store daily contract approval, manager permissions, repeat approval and clearing approval after editing. Inventory helpers are redirected to fixture SQL. No business rows or Telegram calls are changed.

No database migration is required.
