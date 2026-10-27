# Contract operations corrections — 2026-10-20

This supersedes the earlier same-branch representative restriction in `2026-10-20-vehicle-entry-staff.md`. The user explicitly permits new employees entered by name and supporting staff from other stores.

## Behavior

- Telesale sources normalize to `TLS`. Staff may leave TLS generic (no person) or pick a company-wide TLS employee; that `tls_staff_id` is kept for attribution. Employee-sales reports still aggregate TLS into one department. NVKD attribution remains separate.
- Contract representatives can be selected across stores or typed freely. A typed name survives delayed/failed suggestions and vehicle-store changes. A stale deleted staff id with a typed name becomes a name-only snapshot. No HR profile is created by this workflow.
- Typing unrelated fields reuses the vehicle list instead of re-ranking all stock on every keystroke. Staff suggestions no longer disable saving or trigger a redundant reload when the store directory arrives unchanged.
- The form offers **Làm mới kho xe** without discarding entered customer/employee/source details.
- Returned rental lines do not block ready stock while their contract awaits financial settlement. This is enforced consistently by inventory availability, picker blockers and finalization conflicts.
- Renewal and payment-context reads keep authorized cross-store rental lines visible using shared inventory labels; order/line RLS and vehicle-write restrictions remain in place.
- Staff lookup, contract numbering and issue helpers now follow the actual connection mode: administrators use owner queries, while branch scopes use actor-bound helpers. An admin request previously had no scoped actor variables, causing valid staff lookups to return empty and actor-bound issue helpers to reject the request.
- Supplementary representative names take precedence in notification content.

## Incident verification

- `88D1-335.22`: the line under `261011-0004` had already been returned. The former blocker ignored its completion timestamp. The three-function migration was applied atomically; stock is available and the old contract remains `wait_payment`. No financial or vehicle records were edited.
- `VPS-32014`: its open vehicle is managed by Hà Đông while the contract belongs to Hàng Bút. Scoped reads previously lost it in the vehicles join. A real Hàng Bút scope now reads the open line and payment-context item while direct access to that vehicle remains restricted. No live renewal/date/fee was recorded.

## Validation

```powershell
node scripts/check-returned-vehicle-availability.cjs
npm.cmd run test:cross-branch-rentals -- --live-temp
npm.cmd run test:cross-branch-rentals -- --live-temp --admin-scope
npm.cmd run test:contract-branch-flows
npm.cmd run test:staff-sales
python -X utf8 scripts/check-vehicle-entry-staff-ui.py --session-cookie-file <private-session-file>
python -X utf8 scripts/check-renewal-collection-ui.py --branch-cookie-file <private-session-file>
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Availability SQL is tested twice in a rollback-only schema: returned waiting-payment lines, genuine active rental blockers, and reservation overlap/non-overlap. Draft/finalization and sales tests use isolated data. Browser checks intercept every business mutation and send no real Telegram messages. Private screenshots, session fixtures and incident evidence remain in ignored `.backups/`.
