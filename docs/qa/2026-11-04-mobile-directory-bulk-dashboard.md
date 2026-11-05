# Nhân sự/cơ sở/bulk/Tổng quan — 04/11/2026,20:30+07

Đã nối source/API/UI; chưa nghiệm thu native hoặc staging.

- Sơ đồ nhân sự dùng shared projection chung web: TLS khi lọc cơ sở chỉ
  trong các hàng đã được RLS cho đọc; kiêm nhiệm xuất hiện nhiều bộ phận
  nhưng tổng người tính một lần; tìm không dấu, tìm người đã nghỉ, bộ phận
  trụ sở/custom/chưa phân bổ/cơ sở. Native dùng SectionList, mở hồ sơ và
  sửa/xóa qua editor hiện có. Đồng bộ cache sau sửa/tạo/xóa/cơ sở đổi tên.
- Hợp đồng của cơ sở dùng actual web full reader và bộ tìm kiếm, loại nháp,
  giữ hồ sơ đã kết thúc; summary trước tìm như web, tiền thuê/cọc đúng nguồn,
  phân trang25. Có liên kết từ hồ sơ cơ sở tới từng hợp đồng.
- Xóa nhiều staff/stores/customers/vehicles dùng actual `bulkDelete` và
  `requestPermission` web, tối đa500, rà soát tên/mã/cơ sở/trạng thái,
  snapshot/xmin digest, khóa/CAS, gõ XOA rồi gửi. Một hàng bị tham chiếu thì
  rollback cả lượt. Không tự tạo bulk xóa hợp đồng khi UI web không có.
- UUID giữ count/version vì hồ sơ đã xóa; read receipt/resolve/cancel/ack,
  Account recovery. Pending actor/origin và xung đột hai chiều giữa bulk và
  ghi lẻ/import cùng danh mục. Mất phản hồi không gửi thêm. Rời sang Account
  thay màn cũ để không quay lại form xóa đã ack nhưng còn pending cục bộ.
- Staff credentials thêm chép/tải TXT theo thao tác người dùng, auto-hide
  khi background; chỉ giữ state cấp một lần như trước. Chưa test native
  clipboard/share/file trong cụm này; không ghi secret vào ledger/cache.
- Tổng quan giao dịch dùng actual `readDashboardSummary`, quyền contracts.read,
  scoped pool;7chỉ số/kỳ7preset/ngày/cơ sở/tổng theo cơ sở/CSV. Ngày tự điều
  chỉnh từ–đến như web. Extract pure validator/preset/CSV/vietnamDate dùng
  chung web/native, không đưa Next source/backend vào app hoặc mở watchFolder.

Kiểm nhanh đạt:

- Directory SQL3nhóm: actual scoped source, summary/tiền,30hợp đồng qua
  2trang, phân quyền/cơ sở/TLS/kiêm nhiệm/người nghỉ. Bulk SQL4nhóm: stale,
  duplicate/>500/RLS/quyền, archive/reference/all-or-none, rollback receipt,
  replay sau hard-delete/lost commit/actor/cancellation; login nhân sự và
  hợp đồng/phiếu gốc giữ nguyên. PGlite tổng hợp, không phải DB vận hành.
  `.backups/mobile-directory-sql-run1.log`, `.backups/mobile-bulk-sql-run3.log`.
- Dashboard SQL3nhóm: same web values, legacy renewal/refund/deposit/repair,
  Vietnam midnight, CSV/formula escape, leap/year/quarter, giữ scope/context.
  `.backups/mobile-dashboard-sql-run1.log`. Bài này mock pool và kiểm context;
  chưa chứng minh deployed RLS. Reports5/duty4/pending30/recovery6 hồi quy đạt.
- Browser directory/bulk2luồng375sáng/430tối/6ảnh: tìm người nghỉ/toggle,
  review/gõ XOA, đúng1DELETE/luồng, lost commit/Account/resolve/receipt/ack,
  hợp đồng cơ sở tìm vẫn giữ summary;0pageerror/0host lạ.
  `.backups/mobile-directory-bulk-ui-20261104-run4/results.json`.
- Browser Dashboard2luồng/4ảnh: số liệu SQL, CSV exact, kỳ trống/chặn xuất,
  preset/date-auto-adjust và không tràn ngang;0pageerror/0host lạ/0serverwrite.
  `.backups/mobile-dashboard-ui-20261104-run2/results.json`.
- Root/mobile types, mobile/targeted server/shared lint đạt. Export3nền tảng
  cuối đạt `.backups/mobile-directory-dashboard-build-20261104-run3/`, dotenv
  tắt/API origin giả. Scan bundle không thấy hai tên backend-secret đã kiểm;
  đây không phải kiểm tất cả bí mật bằng cách đọc môi trường.

Các run cũ chưa đạt được giữ lại: browser đầu phát hiện aria-checked web
thiếu và lịch sử quay về form pending, đã sửa source; một lượt khởi động
trước khi export xong chỉ thấy directory listing, đã thêm precondition
index+metadata và chạy lại sau completion. Dashboard export đầu lỗi import
Next pure helper ngoài shared, đã extract đúng pure module và export lại.

Checkpoint gen80/state SHA6BE8545C… nguyên; Metro18372/QA7944 vẫn loopback
8081/8131. Không cài/reset/login Samsung, không upload cloud/ký iOS, không
Telegram thật, không migration/production write. Còn source action khác,
full QA nhiều phiên/mạng, staging, native Samsung và iPhone ký/release.

Người dùng có iPhone12ProMax/iOS18.7.8; Apple Developer Program chưa có/chưa
rõ, chưa có staging xác nhận. [Hướng dẫn miễn phí/bản ký](../mobile-iphone-setup-2026-11-04.md).
