# Telegram transfer photos and media reuse — 12/11/2026

## Production findings (read only)

- At 20:28 ICT, the preceding 24 hours contained 83 successful operator-confirmed contract sends: median 14.27 seconds, p95 36.45 seconds, maximum 47.97 seconds. Failed attempts are excluded from latency statistics. No `pending`/`sending` deliveries or topic leases remained at that observation.
- The maximum was agreement `011416`, queued at 14:43:01.237 and completed at 14:43:49.206 ICT on 12/11/2026. It contained 32 photos and one video. Dispatch started after 0.263 seconds; 47.97 seconds measured completion of all attachments and the summary, rather than waiting to start.
- Six failed vehicle-transfer destination deliveries had `PHOTO_SIZE`. Their queued photo entries lacked inline bytes and object references. The vehicle transfer producer selected the legacy inline/Cloudinary fields but omitted CloudFly bucket/key/ETag. Contract media hydration cannot repair a vehicle notification with `order_id=NULL`.
- A read-only preflight at 20:46 ICT confirmed these were three vehicle events sent to two destinations each, with zero acknowledged Telegram messages. All 12 queued attachment references still had complete object sources in the record-photo table.

## Changes

- Preserve object bucket/key/ETag when building both transfer and receipt photo payloads. Existing failed attempts can be refreshed through their normal explicit send operation; completed and uncertain deliveries retain their protections.
- Save Telegram-acknowledged media `file_id`s in an owner-only cache. Keys include bot identity, MIME and the immutable object/Cloudinary version or inline content digest. Repeated sends can use the file already held by Telegram, including the second destination of a transfer.
- Capture file IDs only after a complete valid Bot API acknowledgement. Persist message checkpoints before optional cache writes. Cache failures fall back to original sources.
- Evict a cached ID and upload verified source bytes only after Telegram explicitly rejects that file. Network timeouts and ambiguous responses never trigger an automatic replay.
- Record media request counts, reused-file counts and delivery timings in existing delivery review metadata. The cache begins empty; the change does not claim a fixed completion-time ceiling for a first send of a large dossier.
- Apply `docs/sql/2026-11-12-telegram-media-cache.sql` before deploying the application. Its table has RLS enabled and no grants to application/scoped roles.

Telegram recommends reusing file IDs; IDs belong to one bot and retain their media type: [official Bot API](https://core.telegram.org/bots/api#sending-files).

## Validation

- `scripts/check-telegram-media-cache.cjs`: five offline groups cover exact version/bot isolation, largest accepted photo, incomplete acknowledgements, selective eviction and rejection classification. A fixture containing 32 photos and one video requires 34 source preparations when cold and zero on reuse, with identical 10/10/10/2/1 batch order. This verifies eliminated source work, not production wall-clock improvement.
- `scripts/check-gps-contract-integrations.cjs --vehicle-transfer-only`: eight groups against the dedicated loopback PostgreSQL fixture, using a rollback schema and fake Telegram responses. Covers branch/ownership routing, permissions, duplicate/uncertain protection, CloudFly-only photos, cache reuse across both destinations, explicit stale-ID rejection with byte fallback, timing metadata and denied scoped access to cached file IDs. The cache migration runs twice.
- Core release checks include the new offline cache suite.
- Completed locally: 51 core release suites, the eight targeted PostgreSQL groups, TypeScript, ESLint and the Next.js production build.
- No Telegram messages are sent by these tests. Production inspection uses SELECTs; historical failed/unknown sends are not automatically requeued.
