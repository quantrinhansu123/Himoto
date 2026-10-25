# Legacy ownership type provenance

The previous VPS-27057 investigation treated the imported `order_type=rental` as an explicit ordinary rental. That inference was incomplete: the archived app snapshot places source order 27057 in source store 29, “Thuê và sở hữu”, and its import provenance explicitly records `ownership_installment_schedule_missing`. The old app used the generic `rental` order type for this source group. The current store kind and a three-month date span alone are insufficient to classify an agreement.

A shared SQL type expression now resolves generic/empty legacy types from source store 29 to `ownership`. Explicit new-app composer choices and specific stored types win. Ordinary rentals created directly at an ownership operation store stay ordinary rentals; monthly three-month agreements are not automatically converted. Source-store-30 battery anchors retain their existing exclusion from vehicle contracts.

The expression is shared by full/compact/index/detail queries, table statistics, type filters and the lifecycle context. Read-only verification found 179 imported records affected, including 125 in an open workflow; every affected record has source-store-29 provenance. VPS-27057 resolves to **Thuê sở hữu · Quá hạn** in both detail and lifecycle. This corrects the earlier “Thuê xe” interpretation documented in `2026-10-25-contract-pages-lifecycle.md`.

This changes classification when reading. It does not rewrite stored order types, dates, receipts, balances, lifecycle events or migration review flags, and it does not invent the missing ownership installment schedule. No business-data migration is required.

Validation:

- `node scripts/check-legacy-ownership-types.cjs`: 5 TEMP/rollback cases spanning generic imports, explicit overrides, native rentals at ownership stores, three-month ordinary rentals, filters, result counts, list/detail/statistics/lifecycle consistency and preservation of original data.
- `node scripts/check-contract-tab-counts.cjs`: 2 cases passed.
- `node scripts/check-management-table.cjs`: 10 cases passed.
- `node scripts/check-contract-lifecycle.cjs`: 15 isolated-schema cases passed.
- Production build includes lint and TypeScript checks; tested source hashes and metadata-only read verification are retained under ignored `.backups/legacy-ownership-type-20261025/`.

Only VPS-27057 was specifically identified in the user's screenshots. The other two reported contract codes were not supplied; this fixes the common provenance case without guessing their identities or using duration as a classifier.
