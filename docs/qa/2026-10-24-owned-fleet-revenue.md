# Doanh thu đội xe theo cơ sở chủ quản — 24/10/2026

## Hiển thị và cách tính

- Thêm tab **Doanh thu xe theo cơ sở** ngay cạnh **Tổng quan thuê xe**, chỉ tải khi được chọn. Có bộ lọc ngày/cơ sở dùng chung, tổng toàn đội xe và nút xem từng xe có phân trang.
- Cơ sở chủ quản lấy từ `vehicles.store_id`. Cơ sở đang quản lý lấy từ `current_store_id`; thao tác điều chuyển hiện chỉ cập nhật trường này nên xe đi cơ sở khác vẫn thuộc đội xe gốc.
- Đội xe gồm mọi xe chưa xóa có cơ sở chủ quản, kể cả xe chưa phát sinh doanh thu. Các số xe tại cơ sở gốc/đã chuyển sang cơ sở khác là danh mục hiện tại; số tiền theo kỳ báo cáo.
- **Doanh thu từ xe trực tiếp cho khách thuê**: tiền các lượt thuê có cơ sở lập hợp đồng trùng cơ sở chủ quản.
- **Doanh thu từ xe cho cơ sở khác mượn**: tiền các lượt thuê có cơ sở lập hợp đồng khác cơ sở chủ quản. Xe mượn từ nơi khác không cộng vào đội xe của cơ sở đang mượn.
- Phân loại từng lượt bằng `orders.store_id`, nên chuyển xe đi/nhận về sau đó không đổi nhóm doanh thu của lượt thuê cũ.
- Dùng chung phép tính với **Doanh thu từng xe**: lượt thuê bắt đầu trong kỳ theo ngày Việt Nam; phí thuê + gia hạn + điều chỉnh trả muộn/trả sớm. Chia hợp đồng nhiều xe đúng cả số tiền lẻ; loại cọc và phí sửa chữa. Đây là doanh thu theo lượt thuê; tổng quan thu/chi theo ngày thực thu vẫn ở tab cũ.
- Lượt thuê thiếu cơ sở lập hợp đồng được ghi riêng cùng số lượt và số tiền trong tổng để đối chiếu, không tự gán sang hai nhóm trên.
- Tổng số xe và tiền của cơ sở tính trên toàn đội xe, giữ nguyên khi chuyển trang. Chọn 10/20/50 xe mỗi trang. Tài khoản xem có thể mở chi tiết; màn hình/API mới chỉ đọc.

## Quyền riêng cho chị Thủy

Người dùng xác nhận tên đăng nhập `quanlyvanhanh`. Đối chiếu dữ liệu xác định tài khoản đang hoạt động có ID **145**; bản ghi cùng tên đăng nhập cũ đã xóa không được dùng.

- `canViewOwnedFleetRevenue` là quyền cá nhân gắn ID 145, không nằm trong tập quyền mặc định của vai trò. Quản trị viên, quản lý, kế toán và nhân viên khác không kế thừa quyền này.
- Giao diện kiểm tra ID từ phiên đăng nhập. API `GET /api/auth/staff-sales/owned-fleet-revenue` xác thực phiên qua wrapper có sẵn, rồi kiểm tra lại đúng tài khoản trước khi mở kết nối báo cáo.
- Không dùng tên hiển thị, `user_id` từ query/body hoặc việc tài khoản là admin để cho phép xem. Tài khoản bị khóa/xóa vẫn bị hệ thống phiên từ chối như trước.
- Truy vấn toàn đội xe liên cơ sở chỉ nằm trong endpoint riêng này, trong giao dịch `REPEATABLE READ READ ONLY`, timeout 20 giây. Response `Cache-Control: private, no-store`. Bộ lọc cơ sở trong báo cáo là cơ sở chủ quản.
- Chỉ xuất handler GET; POST trả 405. Tab mới không có thao tác lưu, xóa, điều chuyển hoặc ghi phiếu tiền. Quyền ở các chức năng khác vẫn theo hệ thống hiện hành.
- Không migration, không sửa tài khoản/mật khẩu, xe, hợp đồng hoặc chứng từ thật. Cấu hình tài khoản duy nhất được ghi rõ trong mã nguồn và kiểm thử để thay đổi có thể xem xét qua Git.

## Kiểm tra đã đạt

- `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run lint`: đạt. Build còn thông báo ESLint chưa nhận plugin Next.js như cấu hình có sẵn.
- `node scripts/check-owned-fleet-revenue.cjs --live-temp`: **8 nhóm**. Ví dụ 80 xe = 40 tại cơ sở gốc + 40 ở cơ sở khác; xe không doanh thu; xe mượn vào; 8 trang không trùng/mất xe; tiền lẻ nhiều xe khác chủ quản; phí gia hạn/muộn/sớm; số tiền chưa phân loại; biên ngày; dữ liệu xóa/nháp/pin; quyền cá nhân và giao dịch chỉ đọc. Dùng TEMP/rollback, không dùng sequence thật.
- `node scripts/check-rental-reports.cjs --live-temp`: **6 nhóm** đạt, kiểm tra các báo cáo sẵn có sau khi tách phần tính tiền dùng chung.
- `node scripts/check-account-scope.cjs`: **23 nhóm** đạt, gồm RLS và quyền cũ.
- `scripts/check-owned-fleet-revenue-ui.py`: **10 nhóm** đạt trên Chromium 1440 px/WebKit 390 px, ví dụ 4 triệu trực tiếp + 8 triệu cho mượn = 12 triệu; đủ 80 xe qua phân trang; số tổng không theo số dòng trang; lọc ngày/cơ sở; lỗi API/tổng không khớp và retry; tab ẩn và không gọi API với quản trị viên/quản lý/kế toán/nhân viên khác. JavaScript lỗi 0, không tràn ngang. API ghi được chặn/giả lập.
- `scripts/check-rental-reports-ui.py --browser chromium`: **4 nhóm** đạt, giữ nguyên thu/chi, báo cáo từng xe và tổng quan thuê xe.
- Đối chiếu dữ liệu thật bằng giao dịch chỉ đọc: số xe khớp danh mục đủ điều kiện, số tiền khớp tổng báo cáo từng xe trên cùng tập xe/kỳ. Truy vấn tổng hợp khoảng 333 ms trong lượt đo; không coi là cam kết tốc độ mọi mạng/dữ liệu.
- HTTP bản build local: tài khoản đích 200, đủ mọi xe của cơ sở Nguyễn Hoàng qua các trang và tiền khớp; tài khoản khác 403 kể cả admin; không đăng nhập 401; POST 405. Không ghi nghiệp vụ thật.

Ảnh giả lập và bằng chứng: `.backups/owned-fleet-20261024/` bị ignore, có cookie kiểm thử, không in/commit. Kết quả triển khai và kiểm tra production ghi tại `docs/HANDOFF-2026-10-24-owned-fleet-revenue.md` sau khi phát hành.
