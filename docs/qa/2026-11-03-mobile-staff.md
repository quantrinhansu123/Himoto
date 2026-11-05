# Nhân sự và đồng bộ tài khoản — 03/11/2026

Triển khai theo ưu tiên phủ chức năng/giao app trước, kiểm thử sâu sau.

## Đã nối source/API

- Danh sách/hồ sơ/tìm/lọc cơ sở,3trạng thái và chức vụ; tạo/sửa bằng shared
  validation và normalization chức vụ của web. Chấp nhận chức vụ tự nhập,
  kiêm nhiệm bằng dấu `/`; không dùng chức vụ để cấp quyền quản trị.
- Mã nhân sự tự cấp, mặc định active/Bình thường; ngày vào làm chỉ nhập lúc
  tạo như web, ghi chú/ngày cũ vẫn đọc trong hồ sơ. Không tự thêm sửa các
  trường mà web không cung cấp.
- Web và mobile gọi cùng `saveDatabaseStaff` + `syncStaffAccount` trong cùng
  giao dịch owner có kiểm scope trước/sau và kiểm tài khoản liên kết. Web
  handler giữ response shape; mobile thêm revision/UUID/receipt/replay.
- Tạo tài khoản nhân viên theo loại cơ sở; giữ role/grants/password của tài
  khoản đang có; chuyển cơ sở đồng bộ phạm vi, tài khoản all-store giữ phạm
  vi cũ. Nghỉ việc khóa/soft-delete login; tái làm theo domain web.
- Mật khẩu tự sinh chỉ trả một lần, hiển thị che mặc định trong modal và có
  chia sẻ do người dùng chọn. Chỉ giữ trong state editor đang mở; không ghi
  query cache, route params, pending ledger hoặc phiếu recovery. Mất phản hồi/
  đóng app không được tự cấp lại/mở rộng quyền xem mật khẩu; quản trị đủ
  entitlement web mới đối chiếu được qua chức năng hiện có.
- Xóa hồ sơ dùng `bulkDelete(staff)` có kiểm dữ liệu tham chiếu, kể cả lưu
  trữ. Giữ đúng web: xóa hồ sơ không thay tài khoản. App nêu rõ trước xác
  nhận và có action Đã nghỉ việc để khóa tài khoản/giữ lịch sử. Không đổi
  hành vi backend web để làm một nút xóa mang ý nghĩa khác.
- Account đối chiếu original UUID/actor/origin và mở phiếu nhân sự; update/
  delete dùng chung pending group; chỉ ack phiếu mới kết thúc key.

## Kiểm tra nhanh

- Root/mobile types và lint mobile/targeted backend đạt ở mốc source form/
  profile/result. Câu mô tả lối vào Tổng quan thay sau lint, chưa đổi domain.
- `check-mobile-staff.cjs --pglite-path ...`:4nhóm đạt trên PostgreSQL nhúng
  riêng. Actual bcrypt/cipher dùng khóa QA tổng hợp trong child process;
  không dotenv, không DB fallback hoặc mật khẩu thật/in ra log.
  Tạo/replay/role từ domain, chuyển scope/rollback sync, leave/rehire và web
  handler chung, xóa dữ liệu tham chiếu và recovery/cancel-late đã kiểm.
- Pending17/recovery6/workspace3 đạt; không gọi đây là full role/staging/RLS.
- Mobile types/lint cuối0; export web/Android/iOS cuối exit0 tại
  `.backups/mobile-staff-export-20261103-run1`, EXPO_NO_DOTENV=1 và API
  placeholder.invalid. Metro đang chạy giữ origin8091, không đổi backend.
- Fixture nhân sự kiểm riêng trong memory: tạo/replay/credential một lần,
  nghỉ việc/xóa/phiếu, không còn trong picker hợp đồng khi nghỉ việc và giữ
  mọi field QA cũ. Không thay kiểm tra domain/backend thật bằng fixture.

## Samsung/QA đang chạy

Giữ QA8131/origin8091/Metro8081, cùng checkpoint xe/cơ sở. Đã dừng server cũ
bằng handle, xác nhận terminal rồi mới restart. Upgrade chỉ thêm
`staff_workspace`, mọi field cũ giữ nguyên:3phiếu xe/0phiếu cơ sở.
Evidence `.backups/mobile-staff-qa-upgrade-20261103/results.json`.

Samsung run1 đạt smoke happy path lúc14:54:04 (+07),318file khớp: tạo nhân sự
10001 tại cơ sở23 → bàn giao tài khoản110001 che mật khẩu → ack create → sửa
điện thoại → nghỉ việc → khóa login → xóa hồ sơ → ack phiếu xóa.4UUID/phiếu
riêng trên cùng nhân sự; mọi field QA trước đó và26checkpoint giữ nguyên.
Cuối work/key rỗng,0crash/ANR/SystemUI ANR, để máy Tổng quan QA8131.
Evidence `.backups/mobile-staff-native-20261103-run1/results.json` và ảnh
cùng thư mục. Không kiểm Share thật/clipboard/iPhone/full role trong lượt.

Đã kiểm thêm hướng dữ liệu mobile → web trên PGlite: `readManagementTable`
của web đọc đúng nhân sự do API mobile vừa tạo và thấy đúng cơ sở sau chuyển,
không còn dòng trong bộ lọc cơ sở cũ. Đây là cùng DB QA tách biệt, không chứng
minh deployment/schema/backend vận hành đã sẵn sàng.

## Còn thiếu/chưa kiểm sâu

- Sơ đồ tổ chức/drilldown đủ phòng ban; toàn bộ chức vụ custom trong filter,
  bulk/Excel; copy clipboard/tải file đăng nhập tương đương web (hiện có
  chia sẻ native và chọn văn bản).
- Toàn vai trò/cơ sở/RLS/staging, nhiều phiên/mạng/race/fault, lock/cipher/
  suspended background và handoff credential đầy đủ trên native.
- Signed iOS/iPhone thật, release/vận hành. Mục tiêu toàn app vẫn active.
