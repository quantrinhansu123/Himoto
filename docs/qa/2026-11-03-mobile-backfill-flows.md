# Nhập bổ sung hợp đồng / gia hạn / thu chi —03/11/2026

Mục tiêu vẫn active, ưu tiên phủ chức năng/demo trước. Đợt này khép hai
nhánh còn thiếu trong `ContractBackfillDialog`; chưa phải nghiệm thu app.

## Đã nối source/API/UI

- Tổng quan → Thao tác nhanh → Nhập bổ sung giao dịch: ba lựa chọn giống
  web, quyền riêng `contracts.draft`, `contracts.renew`, `finance.write`;
  giữ `contracts.read` và scope actor/cơ sở hiện tại.
- Hợp đồng bị quên mở composer lịch sử ongoing/returned hiện hành. Gia hạn
  và thu/chi tìm hợp đồng đã có theo mã/biển số/tên/SĐT, cơ sở/phân trang,
  mở đúng ID. Scope `backfill` loại draft/cancelled trước phân trang; vẫn
  gồm completed/bad_debt như web. Writer quyết định cuối trường hợp được ghi.
- Gia hạn lịch sử: đọc cả dòng xe đã trả từ actual web reader, hiện ngày
  bắt đầu/trả thực tế; người dùng nhập `occurred_at` nằm trong lượt thuê,
  trước hẹn trả mới và không tương lai. Ngày thu tiền là trường riêng, mặc
  định trống. Chọn rõ đã nhận/chưa nhận, tài khoản mặc định theo web; có
  phí khác/VAT cộng tiền thuê, phí thu ngoài không cộng tổng, tên/ghi chú.
- Thu/chi lịch sử: ngày mặc định trống, xác nhận tiền đã phát sinh; tiền
  mặt/két mặc định như web, chọn nghiệp vụ và tài khoản trong context thật.
  Dùng cùng writer/UUID/CAS/receipt/recovery hiện có, không tạo backend riêng.

`buildRenewalNote` dùng chung web/native để giữ cùng mô tả phí trong lịch
sử/audit; web dialog giữ hành vi. Gia hạn dùng actual
`recordContractRenewal`/`renewContractAndCollect` và helper web
`extend_returned_contract_vehicle_line`. Completed_at và hiện trạng kho
xe giữ nguyên; trạng thái hợp đồng có thể chuyển completed→wait_payment
do phát sinh phí chưa thu đúng domain web. Không ép giữ sai trạng thái nợ.

Bill lịch sử đi hết luồng chuẩn bị/tải ảnh/UUID/CAS/rà đúng phiên bản/
quay về form, cờ `X-Renewal-Backfill: 1` chỉ cho audience renewal. Không
mở quyền finance để tạo phiên bản gia hạn tương lai. Payload/UUID replay
normal cũ giữ nguyên; chỉ mode lịch sử có cờ/date bổ sung.

## Kiểm tra nhanh

- SQL nhúng4nhóm: returned-line helper thật từ script web, phiếu thuê/
  thu ngoài/bill, ngày thực tế, thu nợ/hoàn cọc, legacy paid balance,
  đọc chéo web/mobile, replay, rollback, quyền và scope qua scopedConnect.
  Toàn dòng xe và completed_at trước/sau bằng nhau; notification0.
- Pure backfill4nhóm: quyền ba action, xác nhận tiền/ngày, giới hạn trong
  lượt thuê, phí khác/thu ngoài và note chung, scope trước paging, client
  từ chối DTO sai mode. Gia hạn cũ6, form4, bill4, write4, workspace3 đạt.
- Unit write cũ từng coi occurred_at hợp lệ là field cấm; đã đổi negative
  case sang ngày tương lai2099. Failure run1 được giữ; run2 đạt. Positive
  ngày lịch sử được chứng minh bằng SQL4nhóm, không bỏ kiểm trước connect.
- Root/mobile types, mobile/scoped/shared lint đều terminal exit0.
- Export web/Android/iOS handle64277 terminal exit0 tại
  `.backups/mobile-backfill-export-20261103-run1`, dotenv tắt/API placeholder.
  Đây là JS/Hermes; không signed APK/IPA.

```powershell
node scripts/check-mobile-backfill.cjs
node scripts/check-mobile-finance-sql.cjs --pglite-path .backups/mobile-sql-qa/node_modules/@electric-sql/pglite --backfill-only
```

PGlite cách ly, không dotenv/network/DB vận hành. Script web
`docs/sql/2026-10-24-contract-history-backfill.sql` chỉ được thực thi trong
PGlite tạm để kiểm actual helper; **không áp lên DB vận hành/staging**.
Preflight chỉ đọc đã thêm kiểm helper/grant/security definer/search path;
không tự áp schema, deploy hay nối production.

Evidence: `.backups/mobile-backfill-domain-checks-run2.log`,
`.backups/mobile-backfill-form-checks-run2.log`,
`.backups/mobile-backfill-write-regression-run2.log` và các log cùng prefix.

## QA và Samsung

QA8131 giữ checkpoint cũ, chỉ thêm `backfill_workspace` generation62→63,
backup và đối chiếu mọi field cũ bằng nhau. Hồ sơ9003/các dòng9903/10003/
finance DTO do actual SQL reader tạo, manifest SHA trong checkpoint.
Server hiện handle43534/PID19296; Metro admin6480/origin8091/dotenv tắt,
USB8081→8081/8091→8131 giữ nguyên. Không reset/replay3mã tích hợp hoặc
bất kỳ mã account/loại hợp đồng/portfolio cũ nào.

Native run1 dừng trước write khi Android placeholder bị coi là nội dung
cần xóa; lưu harness gốc/failure. Chỉ sửa cách nhập ô tìm đang trống và
điều kiện chờ header ổn định. Run2 handle25648 terminal exit0 lúc23:25:46,
tại `.backups/mobile-backfill-native-20261103-run2`:3nhóm màn hình đạt,
435file khớp,0crash/ANR mới, QA7/Tổng quan/work-ledger rỗng. Toàn checkpoint
generation63 và26checkpoint cũ giữ nguyên từng field/hash. Không login/
đổi role/reset/replay. Kết quả tổng hợp
`.backups/mobile-backfill-verification-20261103.json`.

Bài native chỉ xem3lối vào/tìm đúng9003/xe đã trả/trường ngày-phí-lý do/
xác nhận tiền/ngày trống/composer. Không ghi tiền, chọn ngày thực tế hoặc
mở màn upload bill trong bài này; không lấy group label đề cập bill path
để chứng nhận bill native. Bill/phiếu/ngày ghi được chứng minh bằng SQL4nhóm
ở trên; native financial-write acceptance vẫn thiếu.

Portfolio QA mới có sẵn hai happy write giới hạn: gia hạn lịch sử chưa thu
100000 của hồ sơ9003, sau đó thu nợ tiền mặt50000. Đúng ngày trong lượt
01–05/10/2026; thử write khác trả lỗi QA rõ ràng. Ghi bill/thu ngay/thu
ngoài/hoàn cọc được kiểm source bằng SQL, không claim native acceptance.

## Phần còn phải làm/kiểm sâu

Native ghi lịch sử/ngày picker/bill/thu tiền/hoàn tiền/mất mạng/lifecycle,
all role/cơ sở/RLS staging/nhiều phiên và signed iOS/iPhone thật/release.
Thu gia hạn batch trong dialog thu/chi web, đủ đơn vị giờ/ngày và cấu hình
đơn giá gia hạn, correction/history/in/Excel/video và mọi action chưa phủ
vẫn nằm trong backlog. Không lấy ba lối vào hoặc SQL nhúng làm parity100%.
