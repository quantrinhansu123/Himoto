# Quản lý cơ sở trên mobile — 03/11/2026

Đợt2, đang triển khai sau hồ sơ xe. Không coi source/API là nghiệm thu đầy đủ.

## Nguồn nghiệp vụ

- Web `StoreEditDialog`, `store-management`, `StoreDetail` và quyền trong
  `access-request`. Tạo: tên/điện thoại/địa chỉ, mã tự động nếu để trống,
  physical/lease_to_own, tài khoản phụ trách đang hoạt động, trạng thái active.
- Sửa không đổi mã hoặc loại; revision là `updated_at::text` theo web.
  Receipt mobile dùng `xmin` riêng, không thay revision CAS bằng timestamp đã
  định dạng trên thiết bị.
- Xóa thật qua `deleteDatabaseStore`: khóa/quét mọi cột tham chiếu cơ sở,
  kể cả dữ liệu lưu trữ/đã xóa. Mobile thêm kiểm revision của hồ sơ vừa rà
  trước khi gọi domain. Có dữ liệu liên quan thì chọn Tạm ngừng qua biểu mẫu.
- Đọc `contracts.read`, mutation `settings.write`, giữ scope thường/RLS web;
  không dùng fleet để ghi hoặc đổi `scope_all`. Danh sách quản lý chỉ chiếu
  ID/tên tài khoản, không có thông tin đăng nhập.
- UUID/receipt/cancel/replay và đối chiếu từ Account. Phiếu xóa của chính
  actor vẫn đọc được sau khi dòng cơ sở đã xóa; không giả tạo dòng cơ sở đã mất.

## Kiểm tra và giới hạn

`scripts/check-mobile-stores.cjs` dùng PostgreSQL nhúng tách biệt và offline
guard:4nhóm đạt (tạo/replay/grants/duplicate/manager; CAS/phiếu gốc; chặn
tham chiếu đã lưu trữ ở bảng không nằm trong danh sách cố định; xóa/replay/
receipt/recovery/cancel-late). Không đọc env hoặc có DB fallback.

Root/mobile typecheck đạt; lint mobile/targeted backend0error. Root lint bỏ
qua2file shared do config không khớp; không gọi là full root lint.
Pending/recovery/workspace kiểm lại, store pending update/delete có nhóm
riêng; không chạy bộ hồi quy sâu từng module.

QA8131 đã bổ sung `store_workspace`, giữ toàn bộ field cũ và3phiếu xe.
Checkpoint upgrade có bằng chứng so sánh từng field tại
`.backups/mobile-stores-qa-upgrade-20261103/results.json`. Actor QA tổng hợp
được thêm settings.write để xem demo, scope hiện tại vẫn giữ; không là kiểm
chứng role/RLS thật. Fixture CRUD/replay/block-delete kiểm riêng trong memory,
không ghi thêm vào dataset đang chạy.

Hồ sơ cơ sở đã có liên kết tra cứu nhân sự/xe/khách với filter cơ sở ban đầu.
Drilldown hợp đồng không gồm nháp và sổ két còn thiếu; chưa thêm nút giả.

Samsung review run2 đạt lúc14:25:23 (+07),306file khớp,0crash/ANR, work/key
rỗng; mở hồ sơ cơ sở23, form sửa đang có và form tạo với mặc định web, đóng
form chưa nhập và về Tổng quan. Không có store write hoặc thay đổi field nào
trong checkpoint;26checkpoint cũ giữ SHA. Evidence:
`.backups/mobile-stores-native-review-20261103-run2/results.json` và ảnh cùng
thư mục. Đây là kiểm điều hướng/hiển thị, **chưa là CRUD native acceptance**.
Run1 giữ failed vì mapping USB rỗng ngay guard; chưa mở app/ghi nghiệp vụ.
Đã kiểm thiết bị đang kết nối và phục hồi đúng8081→8081/8091→8131 trước run2,
không đổi origin hoặc dataset. Export cuối web/Android/iOS đạt exit0 tại
`.backups/mobile-stores-export-20261103-run1`; API placeholder.invalid và
EXPO_NO_DOTENV=1, không đổi Metro đang chạy. Mobile types/lint cuối0.
Export iOS không thay signed build/iPhone thật; CRUD native chưa nghiệm thu.

Staging/RLS/toàn vai trò-cơ sở, mạng/nhiều phiên/race/native/iPhone và Excel/
sổ két trong chi tiết cơ sở vẫn phải theo backlog. Không tự deploy/migration.
