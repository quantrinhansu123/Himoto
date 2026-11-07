# Tối ưu danh sách hợp đồng — 07/11/2026

Danh sách trả trang hiện tại trước; thống kê được tải bằng yêu cầu riêng sau đó. Trước đây cùng yêu cầu còn chờ tính tổng tiền, công nợ và đếm trạng thái trên lịch sử khoảng 29.100 hợp đồng.

## Thay đổi

- Yêu cầu trang không gọi thống kê hay đếm toàn bộ phạm vi chưa lọc. Yêu cầu `statistics_only=1` trả số liệu, không tải chi tiết trang hoặc trả các dòng lịch sử.
- Tách đếm tổng khỏi `count(*) OVER()`. Truy vấn phân trang chỉ chọn ID; chi tiết khách, xe và số tiền được lấy cho các ID trên trang. Bản nháp vẫn tải đủ dữ liệu để mở sửa.
- Bộ nhớ đệm trang/thống kê có thời hạn 30 giây, thuộc riêng phiên provider và revision. Thay bộ lọc/cơ sở không dùng hàng của phạm vi cũ. Chuyển trang/sắp xếp giữ bảng trong lúc tải; tìm kiếm vẫn debounce 250ms và hủy yêu cầu cũ.
- Khi thống kê chưa có hoặc lỗi, các chỉ số hiện dấu “—”; danh sách vẫn dùng được. Có nút thử lại. Nếu tổng thay đổi giữa hai yêu cầu thì không ghép thống kê không còn khớp với trang.
- Tìm kiếm lấy tập ID khớp mã hợp đồng, thông tin khách và biển số trước khi áp dụng phạm vi hợp đồng. Vẫn dùng tham số bind, tìm không dấu và nguồn xe tương ứng quyền truy cập.
- API có `Server-Timing: table;dur=…` để đo thời gian xử lý danh sách.
- Hai chỉ mục partial phục vụ hợp đồng xe chưa xóa đã được tạo bằng `CREATE INDEX CONCURRENTLY`; SQL tái chạy tại `docs/sql/2026-11-07-contract-list-performance.sql`.

## Đối chiếu

Đo trên kết nối local tới DB thật, transaction READ ONLY/REPEATABLE READ; thời gian này không phải thời gian tải toàn trang qua Internet. Lần đo cuối:

| Trường hợp | Danh sách | Thống kê riêng |
| --- | ---: | ---: |
| Trang đầu, mọi cơ sở | 523ms | 3058ms |
| Trụ Sở Chính | 145ms | 48ms |
| Tìm mã 3110264 | 1921ms | 729ms |
| Trang vượt giới hạn của hợp đồng hoàn thành, tự về trang cuối | 150ms | 2560ms |

Trước thay đổi, đo truy vấn trang có window count khoảng 3,2–6,6 giây và luồng kèm thống kê khoảng 3,8–6,4 giây. Các phép đo có dao động do mạng và bộ đệm DB; thống kê lịch sử vẫn mất vài giây nhưng không chặn danh sách nữa.

Kết quả dòng, tổng, trang cuối, tổng tiền và đếm trạng thái của luồng tách khớp luồng gộp trong cùng snapshot ở bốn trường hợp trên. Bằng chứng không chứa nội dung hợp đồng: `local-backups/contract-list-performance/measurements.json`.

## Kiểm tra

```powershell
node scripts/check-management-table.cjs
node scripts/check-management-table-timeouts.cjs
node scripts/check-management-loading.cjs
node scripts/check-contract-list-performance.cjs --live-read
node scripts/check-scoped-pool.cjs
py scripts/check-management-table-ui.py --contracts-only --channel chrome --session-cookie-file .backups/qa-session.txt --output local-backups/contract-list-performance/ui
npm.cmd run typecheck
npm.cmd run build
```

Chrome kiểm tra bảng hiện khi cố tình giữ yêu cầu thống kê, phân trang/bộ nhớ đệm, thống kê lỗi/thử lại và mở form hợp đồng. Dữ liệu nghiệp vụ trong bài kiểm tra UI được chặn bằng fixture; không tạo hợp đồng, thu tiền hoặc gửi Telegram thật. Kiểm tra scoped pool xác nhận phạm vi cơ sở không rò sang kết nối khác.

Các chỉ mục đã áp dụng trên DB. Phần code cần được triển khai lên Vercel để giao diện production sử dụng luồng tách mới; phiên làm việc này chưa có cấu hình project hay thông tin xác thực Vercel CLI.
