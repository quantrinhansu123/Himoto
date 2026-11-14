# Telegram photo delivery reliability — 13/11/2026

## Problem and resulting behaviour

Agreement `010946` queued twenty photos at 20:31 ICT. Telegram rejected the first URL album with `WEBPAGE_CURL_FAILED`; its subsequent multipart upload timed out after 120 seconds. No message IDs were acknowledged, and the UI's recovery controls appeared above a long gallery while the bottom button remained disabled.

New, uncached photos now upload directly from the server. JPEGs above 512 KiB get a Telegram rendition; general photos have a 1600 px limit at quality 80, while explicitly named document slots retain up to 1800 px at quality 84 with full colour detail. Existing small JPEGs and acknowledged Telegram file IDs avoid unnecessary preparation. Original objects, queue references and business records are unchanged.

Albums obey a 2 MiB file-data limit and Telegram's ten-photo limit. Videos retain their separate existing path. Failed source GETs can retry once before contacting Telegram. Preparation yields a ready partial album before a deliberate continuation, so slow source reads do not repeatedly discard that work.

Each acknowledged album atomically records message IDs and progress metadata before optional cache writes. Metadata includes upload/source bytes, request duration and the acknowledged offset. The summary is sent after all attachments. Only a fully acknowledged send becomes `sent`.

A confirmed Telegram 429 reserves the existing topic lease for `retry_after`, with at most three scheduled retries at the same offset. No new database migration is needed. A timeout, network loss, malformed acknowledgement or orphaned in-flight POST remains uncertain and never automatically replays.

The web panel places progress, the last update time and recovery actions after the gallery. Unknown sends explicitly say they have stopped; the disabled ordinary send button is replaced by the existing reconciliation action. Partial ambiguous recovery requires a checked reconciliation box in the web UI. Existing server permission, snapshot, destination and idempotency checks remain in place.

## Measurements using the incident's actual photo references

Read-only source preparation; no Telegram request or database mutation:

| Measure | Result |
| --- | --- |
| Original file bytes | 15,919,043 |
| Telegram upload bytes | 6,425,604 |
| Reduction | 59.6% |
| Photo count/order | All 20 retained |
| Albums | 6 / 7 / 6 / 1 |
| Album file-data bytes | 2,057,466 / 2,000,106 / 1,616,945 / 751,087 |
| Private photo URLs sent to Telegram | 0 |
| Local source fetch and preparation | 3.64 seconds |

The preparation time is a local measurement, not a production delivery-time promise. Complete dimensions/ETag/hash checks before this change found all twenty originals intact. Document resolution is checked with synthetic fixtures; original documents remain accessible through the application.

## Validation

- TypeScript, source ESLint and the Next.js production build passed.
- 53 offline release suites passed, including the new six-group photo-preparation suite.
- PostgreSQL recovery run: 13 groups; topic/continuation run: 11 groups; vehicle transfer run: 8 groups. Each runs against the dedicated loopback fixture, rolls its schema back and reports zero operational writes or real Telegram calls.
- Report-media PGlite run: three groups covering all attachments, summary ordering, partial retry, unknown protection and PGD/KTNB routing.
- Request/preview timeout and Safari AbortSignal compatibility suites passed.
- Browser recovery acceptance passed 16 cases across Chromium desktop and WebKit at an iPhone-sized viewport, including twenty-photo galleries, explicit reconciliation, partial resume, summary-only resume and stale-server errors. No JavaScript errors, real messages or operational writes occurred. Evidence is under `.backups/telegram-delay-010946-20261113/ui/`.
- The integration harness applies the current independent-worker schema to its isolated schema. Focused Telegram invocations omit the unrelated GPS history-pacing acceptance case.

## Deployment and operational boundaries

- Production marker: `telegram-photo-upload-v2-20261113` in `/deployment-check.txt`.
- Deployment uses the existing GitHub `main` → Vercel production integration. Final commit, deployment status and live marker verification are recorded in the ignored incident directory.
- Historical failed/unknown attempts are not automatically requeued. `010946` requires the operator to verify the receiving group before choosing the explicit recovery action.
- No fake documents, orders or Telegram messages are introduced into production for acceptance. Read-only inspection of subsequent real deliveries is used for operational confirmation when available.
- Telegram and network failures remain possible. This change removes the observed private-photo-URL dependency, reduces upload size and provides bounded recovery rather than claiming failure-free delivery.

References: [Telegram media upload and file reuse](https://core.telegram.org/bots/api#sending-files), [Telegram retry_after](https://core.telegram.org/bots/api#responseparameters), [Sharp JPEG output](https://sharp.pixelplumbing.com/api-output/#jpeg).
