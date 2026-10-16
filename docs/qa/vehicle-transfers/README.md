# Chuyển xe và log thay đổi — 16/10/2026

## Hành vi

- Nút **Chuyển xe** chỉ nhận xe Lưu kho, không có hợp đồng mở. Khi lưu, cùng một giao dịch đổi `current_store_id` sang cơ sở đích, đổi trạng thái `ready` → `in_transit` (**Chờ luân chuyển**) và thêm bản ghi lịch sử. Cơ sở gốc `store_id` giữ nguyên.
- Cơ sở/trạng thái trên danh sách xe được tải lại sau thao tác. Khi nhận xe, dùng **Đổi trạng thái → Lưu kho**; thao tác nhận cũng có log riêng.
- Tab **Xe → Xem chi tiết → Lịch sử** hiển thị ngày giờ Việt Nam, người thao tác, ghi chú và từng trường đổi từ giá trị cũ → mới. Có bảng trên desktop và thẻ trên điện thoại.
- Chuyển xe, đổi trạng thái và lưu chỉnh sửa thông tin xe đều ghi log. Sửa tên, biển số, hãng, loại, năm, màu, số khung, số máy, số km, cơ sở hoặc trạng thái được ghi theo dữ liệu thực tế đã khóa ở server, không lấy giá trị cũ do trình duyệt gửi lên.
- Người thao tác lấy từ phiên đăng nhập; ngày giờ lấy từ cơ sở dữ liệu. Tên người, tên cơ sở, tên xe và biển số được chụp lại trong log để việc đổi tên về sau không làm thay đổi nội dung lịch sử.
- Xe đang có hợp đồng mở hoặc đang Chờ luân chuyển không thể tiếp tục chuyển. Form mới gửi phiên bản xe; server từ chối phiên bản cũ với HTTP 409. Phiên bản là tùy chọn để tương thích với trình duyệt cũ đang mở khi triển khai.
- Log và thay đổi xe dùng chung transaction. Nếu ghi log thất bại, cơ sở/trạng thái/thông tin xe được rollback. Đổi trạng thái Đang thuê vẫn giữ luồng tạo hoặc dùng khách hàng có sẵn và tạo hợp đồng nháp; nếu log thất bại thì các phần này cũng rollback.

## Cơ sở dữ liệu

Đã áp dụng `docs/sql/2026-10-16-vehicle-audit.sql`: chỉ thêm cột JSONB nullable `audit_snapshot` vào `himoto.vehicle_location_events`. Không sửa trạng thái hoặc chuyển bất kỳ xe thật nào để kiểm thử. Lịch sử có 66 dòng trước/sau migration, giữ nguyên; nội dung cũ tiếp tục hiển thị, không dựng lại giá trị trước đây chưa được ghi nhận.

`audit_snapshot` phiên bản 1 lưu người thao tác, tên xe/biển số/tên cơ sở tại thời điểm thao tác và danh sách trường thay đổi. Mỗi trường có nhãn, giá trị hiển thị trước/sau và giá trị gốc trước/sau.

Migration chạy lại được, có giới hạn chờ khóa 5 giây. Code cũ vẫn đọc/ghi bình thường vì cột mới cho phép NULL. Không cần thêm biến môi trường.

Nếu cần quay lại code cũ, triển khai commit `59c51b1` và **giữ cột audit_snapshot** để bảo toàn log đã phát sinh; không drop cột.

## Kiểm tra

- Build, lint, typecheck qua.
- `node scripts/check-vehicle-transfers.cjs`: **9 kiểm tra qua**, dùng bảng/sequence TEMP riêng, rollback toàn bộ. Không đổi bản ghi hoặc sequence nghiệp vụ thật. Có kiểm tra migration lặp lại, chuyển đúng cơ sở/trạng thái, chặn chuyển lặp/xe có hợp đồng, rollback khi log lỗi, nhận xe, sửa từng trường, chống form cũ, giữ tên lịch sử và rollback khách hàng/hợp đồng nháp nếu log lỗi.
- Chrome và WebKit: **5 kiểm tra qua mỗi trình duyệt**, toàn bộ API nghiệp vụ được giả lập. Kiểm tra lỗi giữ form để thử lại, chuyển xe, chặn chuyển tiếp, ngày giờ/người thao tác/giá trị cũ mới, nhận xe, sửa thông tin, tải lại lịch sử và lọc hành động. Màn hình 320 px mở rộng thẻ không tràn ngang.
- Kiểm tra danh sách quản lý: 3 trường hợp qua; nhập Excel xe: 6 trường hợp qua.

Ảnh và kết quả trình duyệt trong `chromium/`, `webkit/` chỉ dùng dữ liệu QA giả. `migration-result.json` ghi kết quả bổ sung schema, không chứa khóa API hoặc hồ sơ khách hàng.

```powershell
npm.cmd run test:vehicle-transfers
python scripts/check-vehicle-transfers-ui.py --session-cookie-file <private-cookie-file> --browser chromium
python scripts/check-vehicle-transfers-ui.py --session-cookie-file <private-cookie-file> --browser webkit
```
