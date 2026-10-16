# CCCD autofill and photo-picker cancellation

Changes:

- AI fills only CCCD number, cardholder name, issue date and issuing authority. It no longer copies the card's address into current residence.
- Newly read values can replace values entered before the read, with no requirement to match the currently entered CCCD. Edits made while an AI request is running are preserved.
- Issue dates accept ISO and common Vietnamese date formats before calendar validation. The Gemini prompt explicitly locates the issue date and issuing authority and distinguishes the cardholder from the signing official.
- A different identity read in the contract form uses the existing customer search/status rules, so the previous customer's database ID and warning state cannot remain attached to it. Photo fields and handwritten current residence are retained during that lookup.
- Dialog cancellation now handles only cancellation originating from that dialog. File-picker cancellation no longer dismisses the form; explicit dialog close/Escape still works.
- Existing vehicle availability/overdue warnings and customer blacklist rules remain the source of business warnings.

Reproduction before the fix: WebKit opened the camera/library chooser from customer creation, canceled the selection and dispatched the file input's bubbling `cancel` event. The customer dialog disappeared and typed fields were lost.

Validation after the fix:

- Production build, ESLint and TypeScript passed.
- `check-photo-ocr.cjs --live-temp`: five checks, including the exact four-field schema, date normalization, edited values, concurrent upload/OCR, and TEMP PostgreSQL photo persistence.
- `check-photo-ocr-ui.py`: eight scenarios passed in both Chromium and WebKit, at 375px and 1440px. Includes camera/library cancellation for both CCCD sides, replacing existing photos, nested customer creation, concurrent CCCD/plate reads, and the existing blacklist/overdue warnings.
- `check-customer-entry-ui.py`: customer creation/photo saving and contract completion regression passed with mocked business APIs.
- Two actual Gemini calls on synthetic text images read the front-side name/number and back-side issue date/authority correctly, omitted the current address, and did not confuse the signing official with the cardholder. These were synthetic fixtures, not the user's photographed CCCD; blurry real images remain dependent on legibility.

No business records were created or updated during QA. Browser provider/business calls are intercepted, except the two explicitly recorded Gemini checks; database persistence tests use TEMP tables and roll back. Session cookies and local synthetic fixture files remain in ignored `.backups` storage.
