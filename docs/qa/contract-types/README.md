# Custom contract types and linked battery/charger contracts

- Contract form: three initial active choices (daily, monthly, ownership). Add, rename, hide/show through **Thêm / quản lý loại hợp đồng**, or `/contracts/types`.
- Admin and accounting accounts already allowed to operate contracts can manage this shared catalog. No browser-local list or additional environment variables.
- New types choose their billing behavior and optional suggested duration. Example: add “Thuê 24 tháng”, monthly billing, 24 months. Billing mode and duration cannot change after creation; create another type for different behavior.
- Existing contracts/drafts retain their saved names and billing when the catalog is renamed/hidden. Archived types remain visible only when reopening an existing selection.
- Ownership drafts use the existing **Hoàn tất & thanh toán** process. The row action **Duyệt & hoàn tất hợp đồng** opens that form.
- Battery/charger contracts retain the source vehicle contract ID, support **Pin + Sạc**, and appear under the source contract's **Pin / sạc** tab. Receipts remain separate from vehicle contract receipts.

Database migrations applied to the configured database:

- `docs/sql/2026-10-16-contract-types.sql`
- `docs/sql/2026-10-16-battery-contract-links.sql`

Validation: lint, TypeScript, production build; unit and TEMP PostgreSQL tests; mocked browser flows on Chromium and WebKit at 375px and 1440px. Screenshots and per-browser results are in this directory. API read/auth/input checks are in `api-results.json`. No business contracts or receipts were created during QA.

Reproduce:

```powershell
node scripts/check-contract-types.cjs --live-temp
node scripts/check-battery-contracts.cjs --live-temp
python scripts/check-contract-types-ui.py --url http://127.0.0.1:3102 --session-cookie-file <ignored-cookie-file> --browser chromium
python scripts/check-contract-types-ui.py --url http://127.0.0.1:3102 --session-cookie-file <ignored-cookie-file> --browser webkit
```

Existing split-payment and mobile customer-entry browser regressions also passed. Browser business APIs are intercepted; PostgreSQL business tests use TEMP tables and roll back.
