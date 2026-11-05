# Đổi xe mobile — editor/receipt, Samsung tập trung đạt

## Mốc mới hơn: editor và browser

Đã thêm editor ba bước và nút Đổi xe trong hợp đồng. Samsung đã đạt **6/6
nhóm tập trung**, chưa có iPhone acceptance. Bằng chứng backend phía dưới
là mốc trước editor; không coi các mốc này là full pass toàn app.

- Chọn một dòng xe qua trang 25 dòng; tìm kho với từ khóa áp dụng rõ ràng,
  phân trang 25 xe và giữ lựa chọn khi chuyển trang/lỗi tải trang.
- POST /swaps/preview chỉ đọc kiểm tra lại đúng order/line/vehicle revisions
  và trả metadata gốc trước xác nhận. Không tạo UUID, history, receipt hay tiền;
  từ chối Idempotency-Key. Writer vẫn kiểm tra lại sau lock.
- Rà soát hiển thị xe cũ/mới, ngày nhận/hạn trả và kho; xác nhận riêng, giữ
  nguyên kỳ thuê/giá/cọc/tiền. Back có xác nhận và không tạo lệnh ghi.
- Hook reserve key trước POST; gửi chưa rõ kết quả khóa form. Resolve chưa
  ghi khóa mã cũ, giữ tìm kiếm/xe đang chọn để rà soát lại. Mở lại editor
  không có form rồi cancel quay về bước chọn xe trống. Lỗi đọc ledger có nút
  thử lại và không mở ghi. Chỉ acknowledgement phiếu gốc mới bỏ key đã ghi.
- Browser cuối **10/10**, .backups/mobile-swap-browser-20261102-final/results.json:
  cả hai phân trang, tìm literal, cancel confirmation/Back, layout sáng/tối
  375/430/812/1024, kho ownership, lỗi trang, lost response → Account,
  correction flags, drop/tombstone/late409, stale vehicle trước preview,
  stale order giữa preview/writer, reopen cancellation và logout/ledger rỗng.
- Full mobile **126 nhóm/19 module**, SQL **77 nhóm**, release **44/44**.
  Logs .backups/mobile-swap-editor-{all-api-final,sql,release-final}-20261102.log.
  Root/mobile types đạt; root lint và mobile lint-final đạt. Hai lỗi lint
  ban đầu (unused import, initial synchronous effect state) đã sửa, không tắt rule.
- Web source: mobile/.expo/web-swap-final-qa, server 8096. Browser không
  dùng fixture native và không phải nghiệm thu Android/iPhone.
- Hồi quy trả xe trên cùng web source đạt **9/9**:
  .backups/mobile-return-browser-after-swap-20261102/results.json.
- Backend source mới build đạt không chứa env/DB thật, network bị chặn:
  .backups/mobile-swap-editor-backend-build-20261102.log. Output gồm cả preview.
  Chín file backend/shared khớp SHA source:
  .backups/mobile-swap-editor-backend-provenance-20261102.json.
- Hermes iOS/Android source editor xuất đạt:
  mobile/.expo/native-swap-editor-qa,
  .backups/mobile-swap-editor-native-export-20261102.log. Android
  entry-87c9d64f79c25487479ef8edbe2f7f76.hbc; iOS
  entry-d4f3f84b1fa2f5aa06c485ee7741352d.hbc. SHA:
  .backups/mobile-swap-editor-native-hashes-20261102.json.
  Đây không phải signed iOS build hoặc release acceptance.

## Samsung và giới hạn môi trường

.backups/mobile-swap-native-20261102-run2/results.json đạt **6/6**,
mode focused-swap, 0 crash/app ANR/SystemUI ANR. Script riêng
scripts/check-mobile-swap-native.py dùng fixture mới 8094, seed 6101/6104/6105.
Kiểm tra source trước/sau khớp trong source-provenance.json và kiểm tra lại
.backups/mobile-swap-source-final-check-20261102.json.

Có bàn phím tìm xe native, rà soát cũ/mới/kho, hủy confirmation giữ review,
ghi đúng một swap và xem/ack phiếu gốc. Lượt 6104 mất response rồi force-stop
phục hồi đúng UUID qua Tài khoản, không ghi thêm. Lượt 6105 chưa commit qua
force-stop/mở lại editor vẫn giữ key, cancel quay về danh sách chưa chọn,
late retry 409. Cuối lượt ledger rỗng, session restore và logout/relaunch đạt.
Không ghép với native trả xe/nền/bill thành full app pass.

APK ARM64 dev đã cài từ mốc icon; lượt này kiểm tra JS editor mới qua Metro
đã xác minh origin và source hash, không build thêm Gradle vì không đổi native
dependency/config. Chưa có signed iOS build/iPhone. Vai trò/cơ sở staging,
PostgreSQL nhiều phiên và hiệu năng vẫn chưa nghiệm thu.

**Fixture 8091 đã dừng trước lượt native này:** TCP connection refused,
PID 15412 không còn, session cũ không tồn tại. Nguyên nhân chưa xác định.
Run1 failed 0 nhóm, startedEpoch null, chưa prewarm/mở app/đổi USB route/ghi.
Không reset hay khởi động lại 8091 bằng dữ liệu trắng. Các artifact trước đó
còn, nhưng chưa đủ snapshot đầy đủ để phục hồi chính xác toàn bộ RAM.
Không coi metadata count 2 collection/2 bill/1 tombstone là bản sao trạng thái.

Run2 dùng cờ QA tường minh --allow-missing-prior-fixture, chỉ chấp nhận lỗi
connection refused đã có trước run. Mặc định script vẫn yêu cầu fixture cũ;
flag không thay đổi app hoặc bỏ kiểm tra pending. JSON ghi
priorFixtureAvailableBeforeRun=false và originalFixtureUnchanged=null.
Vì thế không tuyên bố bảo toàn hoặc nghiệm thu server 8091 trong lượt này.

Fixture trả xe 8093 vẫn chạy và before/after toàn bộ receipt/tombstone bằng
nhau (returnFixtureUnchanged=true). Fixture đổi xe 8094 giữ hai receipt
6101/6104 và tombstone 6105; không reset/replay để làm xanh test. USB đã trả
8091 → host 8091, hiện cổng cũ offline; app đã logout. Mọi build/test kể trên
đã terminal. Trước QA tiếp theo kiểm tra cổng/process/key thật, dùng fixture
riêng và lưu đầy đủ intent/proof; không hồi sinh 8091 chỉ bằng các số đếm.

## Mốc backend trước editor

Đã có preparation, candidates, writer atomic và receipt/recovery. Chưa có
editor chọn/đổi xe, fixture UI riêng, browser hay native acceptance cho đổi xe.
Chưa áp migration production. Mục tiêu app vẫn active, chưa hoàn thành.

## API và giao dịch

- GET /contracts/:id/swaps: 25 dòng/trang, trạng thái/dòng đã trả/đối soát,
  revision và phân loại thuê sở hữu; không chiếu thông tin khách/raw composer.
- GET /contracts/:id/swaps/candidates: ràng buộc revision hợp đồng/dòng xe,
  tìm kiếm literal, 25 xe/trang. Chỉ xe ready, chưa xóa, available toàn hệ
  thống và kho thật phù hợp. Không dùng fleet_read hoặc scope_all để ghi.
- POST /contracts/:id/swaps: đúng năm trường revision/item_id/item_revision/
  vehicle_id/vehicle_revision và Idempotency-Key. Cần contracts.read,
  contracts.return và entitlement xem xe dùng chung của web.
- Cùng transaction: parent actor/key, khóa hợp đồng/dòng/xe mới, kiểm tra
  lại kho/global occupancy, gọi replaceContractVehicle, đồng bộ draft/print,
  swap history và append-only proof. Giữ nguyên kỳ thuê, giá, tổng, cọc,
  các khoản thu/hoàn; không tạo phiếu tiền.
- GET /swaps/requests/:key trả proof gốc gồm xe cũ/mới, kho khi đổi,
  thời gian, swap ID và các revision đã rà soát/sau ghi. Các cờ itemCurrent,
  historyCurrent, vehicleCurrent, contractCurrent phản ánh chỉnh sửa về sau.
  Replay không viết đè lịch sử hay dữ liệu đã sửa.
- return.swap:<id> đã nối resolver/tombstone, SecureStore pending ledger và
  Tài khoản → màn phiếu gốc /swap/:id. Chỉ bỏ key sau xác nhận chưa ghi/khóa
  mã cũ, hoặc sau khi người dùng xem và xác nhận receipt. Chưa mở nút đổi xe.

## Lỗi dùng chung đã tái hiện bằng SQL

1. Chính sách stores gọi các hàm đọc stores theo quyền invoker, lặp RLS khi
   đọc nguồn trụ sở chính của thuê sở hữu. Test nhận PostgreSQL 54001 ở
   max_stack_depth thấp; migration đổi đúng ba predicate metadata sang
   SECURITY DEFINER với search_path cố định, giữ nguyên biểu thức policy.
2. contract_vehicle_labels và hai physical-return helper chỉ dùng
   access_store, nên thiếu nhãn/từ chối nhận xe ở hợp đồng HQ đã được
   access_order_store cho phép. Migration có guard sửa duy nhất predicate,
   từ chối định nghĩa ngoài dự kiến và chạy lại an toàn.
3. replaceContractVehicle chưa dùng effective rental type cho legacy source
   29, chưa loại xe đã xóa và kiểm tra global cũ thiếu bad_debt. Đã dùng
   classifier chung, kiểm tra inventory sau lock và giữ chặn kho theo domain.
4. Nhả xe cũ ở kho cơ sở khác có thể update 0 dòng dưới RLS. Helper mới chỉ
   nhả trạng thái theo swap đã lưu, actor và hợp đồng trong scope; khóa xe
   cũ, kiểm tra toàn bộ hợp đồng mở kể cả hidden bad_debt. Không chuyển kho
   vật lý; không đổi trạng thái xe đã xóa hoặc trạng thái ngoài using/rent.

Migration cần review/áp theo thứ tự khi tới bước môi trường:

1. docs/sql/2026-11-02-ownership-scope-helpers.sql, sau ownership HQ 01/11.
2. docs/sql/2026-11-02-contract-vehicle-scope.sql, sau label/return helpers cũ.
3. docs/sql/2026-11-02-contract-vehicle-swaps.sql, sau swap history cũ.
4. docs/sql/2026-11-02-mobile-swaps.sql, sau mobile-writes và các bước trên.

Đây là thay đổi function/table, chưa chạy lên môi trường thật. Không coi
việc SQL fixture đạt là bằng chứng deployed RLS đã đúng.

## Kiểm chứng

- Full mobile: **125 nhóm/19 module**, gồm 5 nhóm swap API/DTO/client/
  preflight và pending swap qua thay đổi scope.
  .backups/mobile-swap-all-api-20261102.log.
- PGlite **76 nhóm**, 12 nhóm mới chạy domain và SQL/RLS thật cho đổi xe:
  .backups/mobile-swap-sql-final-20261102.log. Có legacy-29/HQ, kind/name
  fallback, explicit rental override, foreign/deleted/returned/battery,
  hidden bad_debt, money/dates/price invariants, draft snapshot, actor/scope,
  append-only proof, stale revisions, tombstone, rollback sau proof trước
  parent ack, mất phản hồi sau commit và sửa dữ liệu về sau.
- Root/mobile types/lint đạt:
  .backups/mobile-swap-{root,mobile}-{types,lint}-20261102.log.
- Backend build đạt từ bản sao QA không chứa env, cấu hình DB giả và chặn
  external network: .backups/mobile-swap-backend-build-20261102.log.
  Output có cả preparation/write, candidates và receipt routes. Tám file
  backend/shared liên quan khớp SHA với source hiện tại:
  .backups/mobile-swap-backend-provenance-20261102.json.
  Bản sao dùng cpus=1 trên host 8 GB, không sửa cấu hình sản phẩm.
- Hermes iOS/Android source hiện tại xuất đạt với origin QA HTTPS giả:
  mobile/.expo/native-swap-https-qa,
  .backups/mobile-swap-native-https-export-20261102.log.
  Android entry-a89d0f90d347e0529b73da0a85d7bafd.hbc; iOS
  entry-30993cd07721264d0567306cb95a90d3.hbc. SHA/size:
  .backups/mobile-swap-native-https-hashes-20261102.json.
  Lượt .expo/native-swap-qa trước đó giữ origin HTTP của Metro dev nên chỉ
  dùng làm log compile, không dùng cấu hình đó làm bản phân phối.
  Export mới không phải signed/native build hay nghiệm thu thiết bị.
- Release **44/44** đạt: .backups/mobile-swap-release-final-20261102.log.
  Lượt đầu failed do mock ownership-stock còn trả order_type thay vì alias
  rental_type mới; đã cập nhật fixture, không nới gate domain.
- check-cross-branch-rentals mặc định đạt 1 nhóm thuần thời gian/ngày;
  không chạy --live-temp và không dùng làm bằng chứng PostgreSQL đổi xe.
- Lượt SQL run2 bị dừng đúng process sau khi chạy lâu ở recursive RLS; run3
  hạ stack depth đã tái hiện 54001. Giữ logs thất bại, không ghép thành pass.

SQL một kết nối chưa chứng minh row-lock races/nhiều phiên, hiệu năng và
RLS đã deploy. Màn recovery mới hiện chỉ qua types/lint; chưa browser/native.
Bằng chứng native trả xe/icon là mốc trước source đổi xe mới.
Giữ nguyên fixture 8091/8093, pending keys và USB route; chưa tạo fixture đổi xe.
