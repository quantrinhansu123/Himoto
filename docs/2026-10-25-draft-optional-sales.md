# Older drafts rejected before payment

The server derived required draft fields from `createContractDraft` defaults. Adding the optional `sales_staff_name` default made older saved drafts and forms already open in a browser fail with the generic “Thông tin bản nháp không hợp lệ” error during the save immediately preceding finalization. Older payloads can omit `sales_staff_id` too.

The two optional sales fields now use their existing dedicated validation instead of the required-field loop. Explicit malformed IDs, non-string names and names over 191 characters remain rejected; required contract fields remain required. No business records are rewritten or issued by this fix.

Read-only investigation found no persisted current record numbered `005807` at the time checked. Existing stored drafts demonstrably lacked the newly introduced name field. The reported code is reproduced in isolated tests and is not issued against the business database.

Validation: `node scripts/check-draft-optional-sales.cjs` (3 cases); `node scripts/check-cross-branch-rentals.cjs --live-temp` includes saving and issuing an old `005807` payload entirely in TEMP tables with rollback and no business sequence changes. Production build includes lint and TypeScript checks.
