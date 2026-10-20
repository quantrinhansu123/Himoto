# Vehicle entry and contract staff checks — 2026-10-20

The representative/source policy below is superseded by [contract operations corrections](2026-10-20-contract-operations.md): free-text names and employees from other stores are now explicitly allowed; source TLS is generic.

- Vehicle entry/edit ignores backdrop clicks. Escape, X and Cancel ask before discarding changed fields; continuing retains values.
- Draft save waits for the branch staff directory instead of validating against its temporary empty state.
- Issuing a draft validates Bên A locally and focuses the representative field if its branch is invalid. TLS/NVKD commission selection remains separate; printing issued historical contracts keeps its existing rules.
- Issued-contract detail hydration preserves representative/vehicle-branch/commission metadata and supplementary profiles while continuing to omit the full draft blob. Previously those fields disappeared after reloading an issued contract.
- Compact sales projections carry the NVKD id/name explicitly, preserving agreement between bounded summaries and full contract reads.
- Removed an unused positional SQL parameter from the owner-pool issue conflict query, found during PostgreSQL integration checks.

Validation:

```powershell
python -X utf8 scripts/check-vehicle-entry-staff-ui.py --session-cookie-file <private-session-file>
npm.cmd run test:cross-branch-rentals -- --live-temp --tls-profile-id=<active-TLS-profile-id>
npm.cmd run test:management-table -- --live-read
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

The browser suite covers Chromium at 1440px and WebKit mobile at 390px: 8 checks, all business APIs intercepted. It verifies HQ revenue with an NH vehicle/representative and company-wide TLS through payment confirmation, a delayed staff response, and a stale representative from another branch. Screenshots and detailed results remain under ignored `.backups/`.

The PostgreSQL suite passes 8 groups, including draft save and issue with TLS attribution, reopening an issued contract after supplementary profile edits, source-account checks, stock branch preservation and open-contract blockers. All business writes use TEMP tables and are rolled back. The optional TLS id performs a read-only lookup through the real commission directory.

The management-table suite passes 6 groups, including read-only comparisons of six scopes, filters, pagination, full detail hydration and bounded source/store sales summaries against complete-history calculations.

Lint has one pre-existing warning in `StaffOrganizationChart.tsx:58`.

The original failed request was not persisted. A matching incident customer was identified using the relative number in the supplied screenshot; reconciliation evidence and the narrowly scoped attribution correction are kept in private backups.
