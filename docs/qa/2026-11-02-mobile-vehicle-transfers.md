# Điều chuyển mobile — editor, hai actor và journal QA

## Ownership theo upstream ac4b189 — Samsung source mới 9/9 tập trung

Upstream đổi cả kho (`current_store_id`) và cơ sở sở hữu (`store_id`) khi
chuyển/nhận xe; từ chối/hủy đưa cả hai về kho đi. Xe chưa lưu kho chuyển ngay
và giữ status. DTO/preview/snapshot/phiếu mobile mới đã giữ riêng owner trước,
kể cả khác kho hiện tại, và owner sau. Snapshot bind tên owner trước, writer
lock thêm cơ sở đó rồi đọc lại; sau domain kiểm cả kho và owner.

UI ghi rõ cơ sở sở hữu hiện tại, trước/sau, tác động ngay lúc chuyển; modal
xác nhận nêu kho và cơ sở sở hữu sau ghi. Proof cũ thiếu ownership vẫn được
đọc/resolve nguyên trạng; màn phiếu báo “Phiếu cũ không lưu cơ sở sở hữu
trước/sau.” Không backfill, không áp quy tắc mới vào lịch sử. Preparation/
preview mới yêu cầu đủ projection; GET/replay phiếu cũ vẫn tương thích.

Kiểm tra source mới: mobile147 nhóm/21 module; SQL111; release44/44;
root/mobile types/lint; journal8; export iOS/Android/web đều đạt.
Backend QA595 file src/shared/public khớp trước/sau,0 env file copied,
external network blocked; `.backups/mobile-transfer-ownership-backend-verified-20261102.json`.
SQL kiểm owner khác kho, label owner đổi không sửa xe, owner-only correction,
stale review/atomic rejection và receipt schema cũ dưới RLS thật của suite.
PGlite một kết nối vẫn không chứng minh tranh chấp nhiều phiên staging.

Browser **10/10** hai actor, đủ4 action; review/receipt bind owner, owner khác
kho, fixture legacy wire projection và original stored proof không đổi.
Đã xem ảnh375/light và phiếu cũ; responsive375/430/landscape/tablet, light/dark,
không overflow, nút>=48; không page errors/unexpected hosts.
`.backups/mobile-transfer-ownership-ui-20261102-run1/summary.json`.
Các log `.backups/mobile-transfer-ownership-{unit,sql,release,...}-20261102*`.
Run SQL đầu chỉ thiếu tham số PGlite, không mở DB; run2 đạt111. Types/lint
chạy qua npm.cmd để phù hợp execution policy hiện tại của PowerShell.

Journal8097 restore exact generation50/digest
`d7442c0b3e734954e2604fa2e164bbcb4b3ba97f758d80f2139949aecb0c35c9`,
17 phiếu/1 tombstone; không backfill xe cũ. Chỉ append dataset7400 gồm12 xe,
toàn bộ state/phiếu/pending/delayed/phiên cũ giữ nguyên.
`.backups/mobile-transfer-ownership-fixture-preflight-20261102.json`.
Native source mới run1/PID4996/session68623 **terminal exit0,9/9 tập trung**,
kết thúc17:26 ngày02/11, dataset7400:
`.backups/mobile-transfer-ownership-native-20261102-run1/` và log cùng tên.
0 crash/app ANR/SystemUI ANR,165 source/QA file unchanged, đủ4 action/2 actor,
owner khác kho/before-after, lost commit/force-stop/Account, tombstone/late409,
session restore/logout. Xem verdict cuối `results.json` mode focused-transfer;
generic logger in `full` trước wrapper không phải phạm vi nghiệm thu toàn app.
Đã xem ảnh native phiếu chuyển và trường hợp owner khác kho.
Đối chiếu cuối `verified-after-native.json`, `fixture-final.json`:25 phiếu gồm
17 cũ +8 mới,2 tombstone gồm1 cũ +1 mới7405,0 phiên QA active, ledger rỗng/logout.
Recovery8098 summary và raw checkpoint SHA nguyên vẹn,8091/8093/8094 vẫn offline;
USB restore mapping trước lượt rỗng và kiểm adb thực tế. Source đã giải phóng,
không còn native QA chạy. Samsung9/9 bên dưới là lịch sử source cũ, giữ riêng.
Không reset/chạy lại dataset7400. Migration chưa deploy, iPhone/staging/release
và media còn thiếu; mục tiêu vẫn active.

Đã thêm preparation, kho đến, preview chỉ đọc, writer và phiếu gốc cho
transfer/receive/reject/cancel. Đã có editor ba bước, typed client, nút ghi có
confirmation, resolver/tombstone, pending ledger và Tài khoản → màn phiếu gốc.
Browser điều chuyển **10/10**, mobile **138 nhóm/20 module**, SQL **89**,
release **44/44**, root/mobile types/lint và Hermes iOS/Android đạt.
Samsung **9/9 tập trung** trong một lượt liên tục, source/QA **151 file khớp**,
0 crash/ANR/SystemUI ANR. Đây là nghiệm thu riêng điều chuyển với fixture,
không phải full app pass hoặc production backend. Migration chưa deploy;
mục tiêu app vẫn active.

## Editor và fixture mới

- Chi tiết xe → Điều chuyển và nhận xe: chọn một trong bốn hành động với lý
  do chặn; tìm kho literal/phân trang 25; chọn kho và ghi chú; preview readonly
  rồi xác nhận. Kho đã chọn được giữ qua trang/tìm kiếm/lỗi tải; lỗi trang
  chặn rà soát cho đến tải lại thành công. Preview không tạo UUID.
- Phân biệt ready chờ nhận và xe trạng thái khác chuyển ngay. Review hiển thị
  kho đi/đến, hiệu ứng, trạng thái sau ghi, ghi chú; Back và reset cần xác nhận.
- `reserveExclusive` serialize cả bốn operation trên cùng origin/actor/xe.
  Hai thao tác đồng thời chỉ tạo một UUID; scope thay đổi giữ action/key cũ;
  nhiều key lịch sử bị khóa để đối chiếu từng key. Storage lỗi hoặc đổi phiên
  không cho phép gửi. Lệnh chưa rõ kết quả khóa cả bốn hành động.
- Fixture riêng `scripts/mobile-transfer-fixture-server.py`, loopback 8097,
  actor7/8 có token/phiên riêng, logout thật trong fixture; không đổi USER
  toàn cục. Journal `.backups/mobile-transfer-fixture-20261102/state.json`
  lưu toàn bộ sessions, stock, audit, request body/hash/proof/tombstone và
  delayed envelope. Ghi file tạm/fsync/atomic replace trước phản hồi; lock
  độc quyền tiến trình; checkpoint hỏng hoặc khởi tạo dở không reset trắng.
- Fixture tests **8 nhóm**, có stop/start server thật, độc quyền owner,
  lost commit, actor isolation, phiên revoked, retry đồng thời, tombstone/
  delayed sau restart, lỗi replace không đổi RAM/disk. Không đọc env/DB thật.
  Dataset rerun chỉ append ID chưa có, từ chối overwrite/reset; alias qa8
  tránh Telex của Samsung nhưng vẫn dùng actor8/token riêng.
  `.backups/mobile-transfer-fixture-results.json`.
- Browser **10/10**: đủ bốn hành động/hai actor, creator không tự nhận/từ
  chối, receiver không hủy, using chuyển ngay/two linked events, phiếu gửi
  cũ không đổi sau nhận, lost/drop/reopen/Account, stale preview/writer,
  đổi scope, sold block, ledger cuối rỗng/logout. Light/dark/landscape/tablet
  xem trực tiếp; không tràn ngang, nút ghi >=48 px.
  `.backups/mobile-transfer-ui-20261102-run1/summary.json` và ảnh cùng thư mục.
  Chỉ intercepted synthetic API, không thay cho native acceptance.

Source web: `mobile/.expo/web-transfer-editor-qa`; source Hermes mới:
`mobile/.expo/native-transfer-editor-qa`. Log/hash:
`.backups/mobile-transfer-editor-{web-export,native-export,native-hashes}-20261102.*`.
Đây là export; không phải signed iOS build. Không đổi dependency/native config;
Samsung dùng APK ARM64 development mốc icon và source mới qua Metro.

Kiểm chứng source editor: `.backups/mobile-transfer-editor-all-api-20261102.log`
(138/20), `mobile-transfer-editor-sql-20261102.log` (89),
`mobile-transfer-editor-release-20261102.log` (44/44),
`mobile-transfer-editor-{root,mobile}-{types,lint}-20261102.log`.
Backend không đổi từ build QA trước; 12 file vẫn khớp SHA:
`.backups/mobile-transfer-editor-backend-recheck-20261102.json`.

## Nhật ký Samsung

Samsung SM-N960N / Android9 / ARM64 / serial282a05859f3f7ece, APK development
mốc sửa icon SHA61e9a55e72642b77a7e7b75bb29de3ee83a7270640e810eaf75dc0a2771c4da4.
Không đổi dependency/native config; JS mới qua Metro 8081, API loopback qua
USB8091 → host8097 trong lúc kiểm tra. Không phải production backend.

- Run1 terminal failed0 trước login: helper QA nhầm placeholder là nội dung
  cần xóa. Journal chưa có phiên/lệnh ghi.
- Run2 terminal failed2: Telex biến qa-receiver thành qa-rêciver. Một phiếu
  transfer7101 đã ghi/ack; giữ nguyên, không reset. Thêm alias qa8; restart
  fixture có exact digest/generation/summary match trước/sau:
  .backups/mobile-transfer-fixture-restart-20261102.json.
- Run3 terminal failed5 ở selector recovery vẫn tìm7104, còn key đúng là7204.
  Có9 receipt được giữ; app đã giữ đúng key7204 qua force-stop. 0 crash/ANR/
  SystemUI ANR trong các lượt failed đã có diagnostics; không coi là pass.
- Run4 **terminal exit 0, 9/9 tập trung**, dataset 7301..7312; source/QA 151 file
  trước/sau khớp, 0 crash/ANR/SystemUI ANR. Đủ bốn action/hai actor; using
  chuyển ngay; lost commit/force-stop/Account mở đúng UUID; unsent/force-stop/
  reopen/tombstone/late409; session restore/logout. Startup đã đối chiếu đúng
  UUID phiếu7204, xem/ack mà không ghi thêm. Một lượt mới đầy đủ, không ghép
  nhóm từ các lượt failed. Authoritative result:
  .backups/mobile-transfer-native-20261102-run4/results.json (mode focused-transfer).
  Generic logger in finish in ra mode full trước wrapper; file result cuối
  mới là verdict/phạm vi, không phải full app acceptance.

App đã logout/ledger QA rỗng; USB trả 8081→8081, 8091→8091 (host 8091 vẫn offline).
Journal 8097 giữ 17 receipt/1 tombstone vehicle.transfer:7305, generation 46;
không còn phiên QA active. Phiếu điều chuyển cũ và fixture 8093/8094 không đổi.
Snapshot .backups/mobile-transfer-native-20261102-run4/fixture-final.json;
source-provenance.json chứa SHA APK/source; runtime-diagnostics.json và crash/
ANR buffers cùng thư mục. Không có native QA còn chạy.

Telex là khoảng trống UX còn phải sửa ở ô đăng nhập: keyboard mặc định đã biến
tên tiếng Anh có ký tự lặp thành tên có dấu. Alias qa8 giúp kiểm nghiệp vụ
hai actor; không thay cho kiểm/sửa keyboardType/inputMode email rồi gõ lại
tên gốc trên Samsung. Không strip dấu trong credentials hay đổi keyboard
toàn thiết bị để làm test pass.

Các dataset cũ chỉ được giữ; endpoint append dataset từ chối ID đã tồn tại.
Hướng dẫn: docs/mobile-native-testing.md, mục Transfer acceptance.

## Nghiệp vụ và phạm vi

- GET /vehicles/:id/transfers đọc fleet như web và trả gate của cả bốn hành
  động, không cần quyền hợp đồng hoặc tài chính. Fleet entitlement dùng chung
  hiện có cho tài khoản workspace; không mở rộng role hoặc scope_all.
- GET /vehicles/:id/transfers/destinations: 25 kho/trang, tìm kiếm literal,
  bind revision xe; chỉ liệt kê kho opening và bỏ kho đang giữ xe.
- POST /vehicles/:id/transfers/preview: transaction repeatable-read/read-only,
  không UUID. Chỉ chấp nhận action/revision/note và destination hoặc chính xác
  dispatch ID/revision. Snapshot chứa xe/kho/lượt chuyển, hiệu ứng, ghi chú;
  không hash thời gian quan sát thuần túy. Từ chối Idempotency-Key.
- Xe ready → in_transit/chờ người khác nhận. Xe using/rent/repairing/bad_debt
  chuyển kho ngay, giữ status và ghi dispatch + receive liên kết cùng tx.
  Hợp đồng mở (kể cả bị RLS ẩn) không chặn điều chuyển; hợp đồng, dòng thuê,
  doanh thu/cọc và mọi khoản tiền không đổi.
- Người gửi không tự nhận/từ chối; chỉ người gửi được hủy. Từ chối/hủy trả
  về kho đi, không sửa phiếu chuyển gốc. Event cũ transfer_dispatch, đã xử lý,
  superseded hoặc sai kho đến có gate rõ ràng. Không bịa kho nguồn khi thiếu.
- Shared domain applyVehicleAction đã được kiểm chứng và sửa chặn soft-delete.
  SQL run1 tái hiện writer cũ vẫn chuyển được xe đã xóa; sau sửa SELECT chặn
  deleted_at, ca này đạt ở cả reader lẫn shared writer.

## Ghi và phiếu gốc

POST /vehicles/:id/transfers cần Idempotency-Key và review_snapshot. Cùng tx:
actor/key → khóa xe/event → khóa các kho tham chiếu theo ID → đọc lại snapshot
sau lock (kể cả kho vừa đổi lúc chờ lock) → applyVehicleAction → audit → proof
append-only → parent ack. Operation và đúng một vehicle được pin trong
dataAccess như web; không dùng fleet_read cho writer, không scope_all override.
Không gọi service gửi Telegram hay dịch vụ ngoài.

Migration docs/sql/2026-11-02-mobile-vehicle-transfers.sql thêm proof actor-bound
SELECT/INSERT, không UPDATE/DELETE, FK parent key + xe và giới hạn payload.
Chạy sau mobile-writes/global-vehicle-transfers/transfer-cancel; ownership scope
helper mới vẫn là prerequisite khi áp đầy đủ môi trường. Chưa áp production.

GET /vehicle-transfers/requests/:key giữ nguyên review và exact audit IDs/
revisions/ref/time/actor/note/names. Vietnam wall time của location events
được chuyển sang UTC thật. vehicleCurrent/eventsCurrent/transferCurrent tách
biệt dữ liệu đã sửa hoặc lượt được xử lý tiếp; nhận xe bình thường làm phiếu
gửi cũ không còn current nhưng không đổi proof. Actor vẫn xem/đối chiếu được
phiếu gốc khi xe soft-delete; preparation và lệnh ghi mới vẫn bị chặn.

vehicle.transfer/receive/reject/cancel:<id> nối vào generic resolver bằng
fleet read cho lookup, entitlement đúng loại thao tác và vehicle resource
(không nhầm với order). Tombstone dùng cùng actor/key lock như writer.
SecureStore lookup giữ UUID qua thay đổi scope; Tài khoản mở màn riêng, không
bỏ key trước khi đã xem/xác nhận exact proof hoặc server xác nhận chưa ghi.
Màn recovery đã kiểm tra browser theo phạm vi editor phía trên; native phải
có bằng chứng riêng đúng source.

## Kiểm chứng mốc backend trước editor

- Full mobile **132 nhóm/20 module**:
  .backups/mobile-transfer-all-api-20261102.log; 6 nhóm mới cho API/DTO/client/
  parser, đồng thời thêm cả bốn operation vào pending-scope regression.
- SQL PGlite **89 nhóm**, 12 nhóm mới trong
  scripts/lib/mobile_vehicle_transfer_sql.cjs:
  .backups/mobile-transfer-sql-20261102-run3.log. Chạy domain/RLS repository
  thật (gồm cancel 30/10 và ownership patch sau đó), actor7/8, foreign stock,
  scope pin, kho paginated/literal search, ready/immediate, self-receive,
  reject/cancel, hidden open hire, soft-delete, legacy/superseded/missing
  origin, immutable proof/replay/scope lookup, cả bốn tombstone, rollback
  sau proof trước ack, lost commit response, stale stock/kho/event và sửa
  event/delete xe sau commit. Không kết nối database server.
- Release **44/44**: .backups/mobile-transfer-release-20261102.log.
- Root/mobile types/lint:
  .backups/mobile-transfer-{root,mobile}-{types,lint}-20261102.log.
- Backend build đạt trong copy QA không env, DB giả và external network
  bị chặn: .backups/mobile-transfer-backend-build-20261102.log.
  Có bốn route mới; 12 file backend/shared khớp SHA source:
  .backups/mobile-transfer-backend-provenance-20261102.json.
- Hermes iOS/Android source mới xuất đạt:
  mobile/.expo/native-transfer-backend-qa,
  .backups/mobile-transfer-native-export-20261102.log. Android
  entry-ecf630e6638fe1a935c2f53850401bee.hbc; iOS
  entry-a81c68f48f7504045da9cef3243c37f4.hbc. SHA/size:
  .backups/mobile-transfer-native-hashes-20261102.json.
  Không build lại native project vì chưa đổi dependency/config; export
  không phải signed build hoặc nghiệm thu thiết bị.

Mọi kiểm tra/build/export ở mốc backend này đã terminal, không chờ lại session cũ.

SQL một kết nối chưa chứng minh tranh chấp nhiều phiên, deployed RLS hay
hiệu năng staging. Chưa ký iOS/iPhone. Không ghép với bằng chứng trả/đổi xe để
tuyên bố hoàn thiện app.

## Bước tiếp theo

1. Sửa/kiểm UX ô đăng nhập với Telex trên Samsung. Giữ journal 8097, fixture
   8093/8094 và 8091 offline, không seed lại khi rerun.
2. Media gắn hồ sơ/return/swap/dispatch và recovery nợ xấu theo domain web.
3. RLS nhiều phiên, vai trò/cơ sở staging, trợ năng/chữ lớn, iOS signing/
   iPhone và release acceptance vẫn còn.
