# Contract list query optimization

The paged endpoint hydrated ten rows using aggregates over all transactions and
vehicle lines. `CONTRACT_PAGE_SQL` now restricts all three aggregates to the
requested IDs. Authorization, scoped vehicle labels and the full-history/export
query remain in place.

The filter index no longer builds vehicle-label JSON for every contract when no
search, vehicle sort or monitoring view needs it. Date aggregates remain present
for recent-window and overdue calculations; visible rows still get full labels
from page hydration.

Validation:

- TypeScript and ESLint passed.
- Management table checks passed (5 groups).
- Management loading checks passed (12 groups).
- New query regression checks cover visible IDs, search/sort labels and scoped
  cross-branch label reads.
- Read-only live comparison on ten current contracts returned identical detail
  rows: old query 14910/640/446 ms; optimized query 98/96/98 ms in that run.
- Other runs were unstable: old detail queries exceeded 30 seconds; even a plain
  orders count exceeded 15 seconds. End-to-end list reads still exceeded the
  benchmark's 30-second statement timeout. These measurements do **not** establish
  an end-to-end production page speedup.

Run `node scripts/check-contract-list-performance.cjs` for regression checks or
add `--live-read` for a read-only DB comparison. No business data was changed.
