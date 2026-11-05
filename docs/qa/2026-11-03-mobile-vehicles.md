# Hồ sơ xe, giấy tờ, lịch sử và điều chuyển toàn hệ thống —03/11/2026

Phạm vi triển khai đợt2, ưu tiên phủ chức năng trước kiểm thử sâu. Web hiện tại
là chuẩn nghiệp vụ; không coi nhóm này là đủ100% module xe hoặc đủ toàn app.

## Đã nối source/API

- Tạo/sửa đầy đủ trường hồ sơ xe theo `parseVehicleValues`,
  `createDatabaseVehicle`, `updateDatabaseVehicle`: tên/biển số/hãng/loại/năm/
  cơ sở hiện tại/trạng thái/màu/khung/máy/km/ghi chú. Default hãng `honda`, loại
  đầu danh mục, Lưu kho; năm và cơ sở phải nhập/chọn như web. Không thêm xóa lẻ
  khi web không có action này; bulk/reset/Excel vẫn là backlog riêng.
- Quyền `vehicles.write` cho tạo/sửa/OCR. Tra cứu fleet không thay quyền ghi
  hoặc `scope_all`; options và writer dùng scope thường, reader dùng fleet.
  Sửa yêu cầu revision, giữ cơ sở sở hữu theo domain; hợp đồng mở/chờ luân
  chuyển khóa đổi kho/trạng thái. Không đưa arbitrary columns vào DTO.
- UUID/receipt/replay/tombstone/Account recovery. Update xe dùng chung nhóm
  pending với transfer/receive/reject/cancel của cùng xe. Xác nhận create dùng
  đúng actor/origin/key và scope gốc của ledger, giữ create ở điểm đến khác.
- Giấy tờ trên xe đã lưu: đăng ký trước/sau, mua bán trang1/2, ảnh bổ sung;
  giữ target xe/refId giống nhau, snapshot/revision/photo CAS và receipt qua
  protocol media hiện có. Đọc/lưu/xóa ảnh theo record-photo/RLS web, không tự
  ép quyền editor lên quyền ảnh. Không thêm migration mới.
- OCR đăng ký: camera/gallery qua module đã có, provider chỉ ở server, rà
  trước áp dụng; merge theo web giữ nhập tay và sửa trong lúc đang đọc. Ảnh
  dùng cho OCR chưa phải ảnh hồ sơ được lưu; mở Giấy tờ xe sau lưu thông tin.
- Lịch sử xe dùng `readVehicleHistory`: nhập/thuê/trả/chuyển/đổi/sửa/note/audit,
  giữ snapshot người/cơ sở/giá trị cũ→mới, mở hợp đồng theo quyền; lọc và25dòng/
  trang. Giới hạn nguồn đúng web:500lượt thuê,500sự kiện,200lượt đổi xe.
- Điều chuyển toàn hệ thống dùng `readTransferHistory`: ngày Việt Nam, cơ sở
  liên quan/đi/đến, thao tác, tìm kiếm, tổng/phân trang25 và snapshot audit.
  Mở hồ sơ xe hoặc editor4action hiện có từ từng dòng.

UI dùng theme/component/session/API hiện tại. Tham khảo có chọn lọc bố cục
lịch sử của đồng nghiệp `c08bfb9`, không chép backend/auth/lockfile cũ.

## Kiểm tra nhanh đã chạy

- Root/mobile typecheck đạt; lint mobile và backend liên quan đạt sau sửa
  lint refs/unused import. Kiểm lại bundle/native theo source cuối riêng.
- `check-mobile-vehicles.cjs --pglite-path .backups/mobile-sql-qa/node_modules/@electric-sql/pglite`:
  5nhóm trên PostgreSQL nhúng tách biệt. Tạo/replay/options/profile; duplicate/
  grant/revision; audit/ownership/open-contract/in-transit; timeline/global
  transfer snapshot; discovery và upload/delete giấy tờ qua writer thật;
  mocked OCR/merge và cancel chặn yêu cầu đến muộn. Không provider thật/DB thật.
- Pending-scope15nhóm; media8; transfer9; write-recovery6 đạt. Không phải full
  mobile suite hoặc đủ native/role/staging/race.
- Các script kiểm tra mới không nạp env. Không chạy script cũ tự load env/DB.

## QA demo chuẩn bị

`scripts/mobile-vehicle-fixture-server.py`, port8131, checkpoint riêng
`.backups/mobile-vehicle-workspace-fixture-20261103-run1/state.json`. Giữ nguyên
8130/watch8101 và mọi dữ liệu cũ. Chỉ chuyển Samsung sau khi Account xác nhận
work/key rỗng và logout server gốc; origin8091/Metro8081 không đổi.

Dataset mới có23xe cùngID301–323 như bộ chọn hợp đồng; xe mới cũng xuất hiện
trong inventory. Reuse fixture transfer/media hiện có, cùng revision/kho/ID
với hồ sơ xe. Có1sự kiện nhận kho tổng hợp để demo danh sách. QA actor7 có thêm
grant vehicles.write riêng trong fixture; không sửa quyền DB/tài khoản thật.
Export web/Android/iOS đạt tại
`.backups/mobile-vehicles-export-20261103-run1`. Sau đó chỉ sửa câu xác nhận
lưu xe; không đổi nghiệp vụ. Mobile types/lint kiểm lại riêng.

Samsung đang dùng8131, origin8091/Metro8081 giữ nguyên. Native run1 lưu đúng
xe8001 nhưng script thiếu cuộn tới nút xác nhận. Run2 mở đúng UUID từ Account,
ack create và lưu update; script nhập nối km12→12125 thay vì thay bằng125,
assertion dừng. Run3 chỉ đọc/Account rỗng, dừng vì tìm xe chưa dùng ô tìm kiếm.
Run4 dừng vì helper cố xóa placeholder ô tìm kiếm rỗng; không ghi thêm.
Giữ toàn bộ failed evidence trong `.backups/mobile-vehicles-native-20261103-run{1,2,3,4}`;
không reset dữ liệu/ledger, không tạo lại xe. Lượt tiếp theo sửa đúng số km
bằng biểu mẫu và kiểm đọc lịch sử/giấy tờ/lọc điều chuyển.

Run5 đạt smoke tập trung lúc14:08:50 (+07):295file khớp; cùng xe8001,
1create+2update (update cuối sửa dữ liệu QA thành km125); owner/current store23
không đổi. Mở timeline và4slot giấy tờ, lịch sử nhận kho tổng hợp, lọc chuyển
xe trả rỗng đúng dataset; Account work/key rỗng, để máy ở Tổng quan.25checkpoint
cũ giữ SHA; dataset8130 chỉ kiểm các field nghiệp vụ (ngoại trừ sessions).
0app crash/ANR/SystemUI ANR theo exact startedEpoch; fullAcceptance=false.
Evidence `.backups/mobile-vehicles-native-20261103-run5/results.json` và ảnh
cùng thư mục. Sau mốc này source tiếp tục đổi cho module cơ sở; không dùng
run5 chứng nhận toàn source mới hoặc native upload/OCR/staging/iPhone.

## Còn thiếu / chưa kiểm sâu

- Ảnh/attachment atomic ngay lúc tạo xe và giữ hàng đợi trước metadata;
  camera/OCR/codec/gallery/lifecycle đầy đủ trên thiết bị, role/scope recovery.
- Thao tác đánh dấu Đang thuê/nhập khách–hồ sơ nháp từ kho, đầy đủ quản trị/
  Excel/backup/reset; các action con và thông báo theo web. Không gửi thử ngoài.
- Staging/RLS/full role/cơ sở, nhiều phiên/mạng/race/fault; hiệu năng trên dữ
  liệu lớn; signed iOS/iPhone thật; release/vận hành.

Mục tiêu toàn dự án vẫn active. Sau kiểm tra nhanh tiếp tục module còn thiếu,
không giữ nhịp phát triển ở các vòng fault/native matrix của lát này.
