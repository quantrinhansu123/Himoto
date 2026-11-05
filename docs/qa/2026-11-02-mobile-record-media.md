# Media trả/đổi/chuyển/nhận xe — editor, API và phục hồi

Đã thêm preparation/metadata, image GET, JPEG writer nguyên tử, phiếu bất biến,
resolver/tombstone, client typed, ledger và Tài khoản → phiếu lưu ảnh. Editor
discovery/gallery/slot/picker/xem lớn/rà soát/upload đã mở; browser8/8 và journal8
đạt. Samsung run2 đạt8/8 tập trung; ledger3/3 riêng. Run1 failed được giữ làm
bằng chứng lỗi native đã sửa. Mục tiêu
app vẫn active, migration chưa deploy. Bằng chứng Samsung thu hồi10/10 và
ownership điều chuyển9/9 trước đó không chứng nhận phần media mới.

## Nghiệp vụ và dữ liệu

- Metadata GET `/record-media/:entity/:id/:kind/:referenceId?page=1`,25 dòng/trang;
  GET ảnh tại cùng đường dẫn thêm `/:slot?revision=...`. Discovery parent phân
  trang25 target; exact-slot GET không revision đọc ảnh hiện tại và next extra
  từ toàn nhóm, không suy vắng ảnh từ một trang gallery. Entity contracts có
  return/itemId và swap/swapId; vehicles có transfer/receive/eventId. Bind parent,
  exact reference và type, không nhận slot của lượt khác. Return chấp nhận cả
  dòng đang thuê và đã trả; swap/transfer/receive cần lượt đã được ghi thật.
- Dùng parser/slot/group/domain web hiện có: return-item ảnh/video/document,
  vehicle-swap-N ảnh, transfer/receive-event-1 và supplemental extras. Không tạo
  kho ảnh riêng. Slot đã lưu ngoài15 placeholder vẫn được phân trang đầy đủ.
- Metadata giữ video/định dạng chưa hỗ trợ với lý do rõ; chưa có native video
  player/upload. Ảnh xem qua backend theo exact revision, private/no-store,
  bearer chỉ nằm trong headers gửi về Himoto. Không gửi storage URL ra thiết bị.
  Inline/trusted Cloudinary bytes đều kiểm MIME/signature và giới hạn2 MiB;
  stream quá giới hạn bị cancel, đọc storage sau khi trả kết nối DB.
- Transactions metadata/image đều repeatable-read/read-only. Contract dùng
  contracts.read và normal order RLS; xe chỉ pin đúng1vehicle với operation
  transfer như web record-photo wrapper, không đổi scope_all. Fleet_read đơn
  thuần không thay thế RLS ảnh. Liên kết parent/item/swap/event được kiểm lại.

## Writer và phục hồi

- PUT `.../:slot` chỉ nhận JPEG chuẩn bị <=2 MiB, Idempotency-Key UUID-v4,
  X-Record-Revision, X-Reference-Revision, X-Media-Snapshot và X-Photo-Revision
  (`0` nếu chưa có). Target snapshot bind label/identity/revisions; đổi nhãn cũng
  cần rà soát lại và có referenceCurrent flag độc lập trên phiếu cũ.
  Ghi qua shared `writeRecordPhoto`, quyền photo dùng chung web; không suy
  quyền ảnh thành quyền tài chính hay sửa nghiệp vụ hợp đồng/xe.
- UUID/parent row được khóa, reference share-lock và photo lock. Recompute
  parent/reference, kiểm expected photo revision trước thay; ảnh, immutable
  metadata proof và parent ack cùng transaction. Không đổi dòng thuê, stock,
  tiền, event hoặc sequence. Có thể thêm ô ảnh bổ sung theo grammar hiện có.
- Phiếu giữ target/slot/label/actor/date/hash/bytes và exact photo revision lúc
  lưu; không giữ bản sao ảnh cũ. parentCurrent/referenceCurrent/photoCurrent
  độc lập; ảnh thay/gỡ không diễn giải lại proof. Read receipt actor-bound còn
  xem/đối chiếu được khi parent soft-delete nhưng còn visible dưới RLS; ghi mới
  và metadata mới vẫn chặn archived/deleted targets.
- `media.contract:<id>` / `media.vehicle:<id>` dùng unique actor/key và durable
  tombstone chung. Ledger giữ UUID theo parent qua scope/process restart; một
  yêu cầu ảnh chưa rõ kết quả phải đối chiếu/ack trước ý định ảnh tiếp theo trên
  cùng parent. Không lưu bytes/form/token trong pending metadata. Tài khoản mở
  `/media-receipt/:entity/:id`, không xóa key khi chỉ mở phiếu; cần explicit ack.
- Migration `docs/sql/2026-11-02-mobile-record-media.sql` chỉ thêm bảng proof
  actor-owned, SELECT/INSERT cho scoped role; không UPDATE/DELETE, không backfill
  dữ liệu nghiệp vụ. Chưa áp production hoặc môi trường dùng chung.

## Editor và lượt kiểm mới nhất

Editor mở từ chi tiết hợp đồng/xe, chọn đúng dòng trả hoặc sự kiện đã lưu;
gallery giữ trang đã tải khi mạng lỗi nhưng khóa chọn đến retry thành công.
Chọn slot hiển thị ảnh hiện tại rồi chọn ảnh mới; thêm ảnh cùng mục tính next
extra từ toàn nhóm và giữ ảnh gốc. Đổi slot khi đã chọn ảnh cần xác nhận bỏ form.
Review phải tải ảnh trước nút lưu; confirm cancel không cấp UUID. Writer đọc lại
bytes/size, chặn intent thứ hai trên cùng parent. Pending mở từ Tài khoản và
phiếu exact-revision image phải tải trước ack nếu còn current. Camera native
có kiểm quyền/settings, chưa được xác nhận hoạt động trên thiết bị.

- Browser **8/8**: actual file picker/bounded JPEG,3x zoom,4 viewport light/dark,
  original slot + extra13, replacement,2 actor/scope, lost commit/Account phục hồi,
  drop/tombstone/late409 giữ ảnh, stale conflict/review lại, đủ4 target, ledger
  rỗng/logout.0 browser errors/unexpected hosts, source khớp. Artifacts
  `.backups/mobile-media-editor-ui-20261102-run2/`. Run1 lỗi helper điều hướng
  tab khi transition; giữ toàn bộ artifacts, không xóa proof hoặc reset dữ liệu.
- Journal **8 nhóm**: reopen exact bytes/hash/original proof; actor/scope isolation,
  lost/drop/tombstone/late409,4 retries một write, append dataset giữ proof cũ,
  atomic replace failure/corrupt checkpoint fail closed và HTTP stop/start thật.
  `.backups/mobile-media-journal-20261102-run2.log` và
  `.backups/mobile-media-fixture-results.json`. Run1 lỗi kỳ vọng photoSeq của
  harness khi append seed; sửa kỳ vọng, chạy checkpoint UUID mới, giữ checkpoint cũ.
- Mobile **155 nhóm/22 module** (media API/client8), SQL **124**, release **44/44**,
  root/mobile types/lint đạt; root chỉ1 warning cũ `estimated-sales.ts`.
  `.backups/mobile-media-editor-final-*20261102.log`,
  `.backups/mobile-media-editor-mobile-lint-20261102-run3.log` và
  `.backups/mobile-media-editor-sql-20261102-run3.log`. SQL mới kiểm discovery,
  exact-slot/extra ngoài trang, label snapshot/referenceCurrent và4 loại target.
- Backend QA terminal exit0,**602 file unchanged**,0 env copied, network blocked;
  `.backups/mobile-media-editor-backend-verified-20261102.json`.
  Native export terminal exit0 `mobile/.expo/media-editor-native-qa-run2`;
  web cuối `mobile/.expo/media-editor-web-qa-run4`. Không phải native acceptance.
- Samsung media run2 **terminal exit0,8/8 tập trung** lúc20:57:55, bộ9200,
  `.backups/mobile-media-native-20261102-run2*`.180 source/QA file khớp,0 crash/
  app ANR/SystemUI ANR; không gặp error overlay. Đủ4 target, exact extra13, actual
  native picker/JPEG/receipt, scope/process/Account recovery và tombstone/late409.
 5 phiếu/1 tombstone,1 phiếu9100 giữ nguyên; ảnh mới2200×1467/81400 bytes/full
  decode. `verified-after-native.json` đối chiếu SHA codec, exact HTTP/journal
  final, old checkpoint SHA và USB thực tế. Source/QA freeze trong mỗi lượt,
  chỉ1 UIAutomator reader. Chỉ picker synthetic file có exact
  tên trong created-qa-media.json, không chọn thumbnail cá nhân. Checkpoint mới
  `.backups/mobile-media-fixture-20261102/state.json` giữ journal; không reset bộ
  đã ghi. Cổng8097/8098 hiện offline nhưng exact checkpoint khớp phiếu cuối25/10;
  preflight `.backups/mobile-media-editor-native-preflight-20261102.json`.
- Run1 **terminal failed**, completedGroups1,0 app crash/app ANR/SystemUI ANR.
  Native LogBox báo `Text strings must be rendered within a <Text>` do literal
  space giữa hai biểu thức trong `messages`; browser không lộ lỗi. Có1 ảnh extra13
  đã commit: JPEG2200×1467/80836 bytes/full pixel decode tại
  `mobile-media-native-20261102-run1/native-prepared-codec.json`. Fail cuối khi
  chờ quay về chi tiết sau ack; giữ mọi receipt/key/checkpoint. USB restore rỗng.
  Không coi run1 là native pass và không chạy lại dataset9100.
- Đã sửa raw whitespace, thêm local ESLint native text rule. Negative lint proof
  từ chối chính lớp lỗi này, fixed editor0 errors:
  `.backups/mobile-media-native-text-lint-proof-20261102.log`. Receipt thay editor
  trong stack và đồng bộ removal guard, dọn prepared image khi unmount. Mobile
  types/lint, browser hồi quy8/8 và export web/native đã terminal đạt:
  `.backups/mobile-media-native-fix-*20261102*`. Backend/SQL không đổi.
  Run2 append9200 giữ toàn bộ mapping records/targets/photos/blobs/requests/
  sessions/scopes cũ; preflight `.backups/mobile-media-fixture-9200-preflight-20261102.json`.
  Runner mới fail ngay nếu xuất hiện native error overlay; bước đầu đối chiếu
  phiếu9101 qua Tài khoản nếu còn pending, không reset hoặc xóa key bằng tay.
  GMS backport picker không xuất filename nên cần chọn thủ công đúng ảnh synthetic.
- Ledger cuối **3/3 riêng**, terminal exit0 lúc21:02:07,
  `.backups/mobile-media-native-ledger-20261102-run1/`. Tài khoản thật báo không
  có thao tác chờ;0 media writes, không resolve/ack ảnh, giữ cả5 phiếu/tombstone.
  Session restore/logout,0 crash/ANR,180 file unchanged trong lượt; product source
  trùng run2, chỉ QA runner thêm ledger-only/final ledger assertion. Verification
  trong output đối chiếu current snapshot/HTTP/journal/proofs/USB. Final journal
  generation17/5 phiếu/1 tombstone/0 active sessions. Không cộng8+3 thành full app.
  Không còn runner/reader; Metro8081 và fixture8099 giữ chạy, old ports vẫn offline.
- Role reconciliation SQL bổ sung actor không có finance grant tự resolve phiếu;
  mất contracts.read/đổi branch bị chặn, rows/proof/photo không đổi. Tổng PGlite124,
  log `.backups/mobile-media-roles-sql-20261102-run1.log`.
  PostgreSQL17.11 riêng **9 nhóm**,2 phiên/7 observed waits/285 input hashes:
  [phạm vi và giới hạn nhiều phiên](2026-11-02-mobile-postgres-races.md).

## Mốc trước — API/writer foundation

- API/client7 nhóm mới: exact target/slot/query/grants preflight, bounded shape,
  private projection, video metadata, origin/header image source, stream cap/
  cancellation, wrong MIME và PUT/receipt UUID/revision/slot/byte binding.
  `.backups/mobile-record-media-write-api-20261102-run1.log`.
- Mobile toàn bộ154 nhóm/22 module; SQL121 nhóm với actual shared domain,
  scopedConnect và real RLS/constraints chạy trong PGlite. SQL media kiểm
  paging25/33 ảnh, extras/video, foreign-stock labels, cross-parent references,
  2 actor, wrong branch/HQ, pinned transfer entitlement và unrelated stock/photo/
  contract vẫn ẩn. Read-only chặn cả UPDATE và nextval; so nguyên row/xmin/hash/
  every sequence. Writer kiểm rollback/lost commit/replay/tombstone/stale revisions,
  old proof/current flags, archived recovery và đủ return/swap/transfer/receive.
  `.backups/mobile-record-media-write-sql-20261102-run1.log`.
- SQL read run1 lỗi trùng tên biến của harness; run2 áp constraint lịch sử lên
  fixture đã có extras. Giữ cả log thất bại. Harness run3 cài old CHECK ở trạng
  thái NOT VALID rồi migration25/10 dựng và validate final CHECK thật; không xóa
  dữ liệu để qua test. Writer suite tiếp theo đạt121. Cách dựng này chỉ áp trong
  fixture vốn đã có dữ liệu của migration muộn hơn, không phải rollout guidance.
- Root/mobile types/lint đã đạt tại source cuối; root có1 warning sẵn có ở
  `src/lib/server/estimated-sales.ts` về unused import,0 lỗi. Không sửa ngoài scope.
  Logs `.backups/mobile-record-media-final-*20261102.log`.
- Backend build QA **terminal exit0**,601 file src/shared/public unchanged,
 0 env copied và external network blocked. Proof
  `.backups/mobile-record-media-foundation-backend-verified-20261102.json`;
  manifest có cả3 route record-media metadata/image/requests. Export3platform
  terminal exit0 tới `mobile/.expo/record-media-foundation-qa`, log
  `.backups/mobile-record-media-foundation-export-20261102.log`.
  Không dùng bundle/browser để chứng nhận native.

PGlite một kết nối không tự chứng minh tranh chấp nhiều phiên; bộ PostgreSQL
media9 nhóm riêng đã bổ sung phần khóa/resolver/pool. Deployed full RLS/staging
và concurrency các writer khác vẫn chưa chứng nhận; giữ UUID/ảnh/proof khi có lỗi.
Kiểm HEIC/xoay, Activity kill/picker cancel, cache/memory, video, vai trò/nhiều
phiên staging và signed iPhone/release còn thiếu. Chưa coi media hoặc app hoàn tất.
