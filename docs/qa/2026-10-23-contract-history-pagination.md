# Lịch sử hợp đồng thuê sở hữu — 23/10/2026

## Nguyên nhân và thay đổi

DB còn hợp đồng cũ. API phân trang dùng `offset + số dòng trang hiện tại + 1 nếu còn dữ liệu` làm tổng số hợp đồng. Với cỡ trang 10, trang đầu báo 11, trang sau báo 21; `pages` chỉ tăng từng trang. Giao diện hiển thị các số này như tổng chính xác, khiến nút Trang cuối không đi đến lịch sử thật.

- Tab hợp đồng thông thường lấy `count(*) OVER()` trong truy vấn chỉ mục, sau phạm vi quyền/cơ sở/trạng thái/tìm kiếm và trước LIMIT/OFFSET. Truy vấn chi tiết chỉ nhận ID của trang hiện tại. Không tải số đếm các tab khác.
- Bộ lọc quá hạn/ngày cần trạng thái đã tính từ chi tiết: đọc hết ứng viên của truy vấn đang chọn theo lô 50, lọc rồi tính tổng và phân trang. Không dừng ở một kết quả thừa để giả làm tổng. Bộ lọc ngày trong Đang thuê vẫn giữ xe quá hạn chưa trả.
- Khi trang yêu cầu vượt quá dữ liệu hiện có, trả trang cuối thật; danh sách rỗng trở về trang 1. Thiếu tổng số hợp đồng trong kết quả SQL phải báo lỗi, không trả tổng giả.
- Giữ cách tải riêng từng tab, cache và bảo vệ form đã kiểm tra trong báo cáo `2026-10-23-contract-tabs-stability.md`.

## Đối chiếu Supabase thật

Giao dịch chỉ đọc, cùng snapshot cho từng quyền: quản trị/vận hành, nhân viên thuê sở hữu, quản lý thuê sở hữu. Cả ba quyền đọc được cùng tập hợp 239 hợp đồng thuê sở hữu, gồm **234 mã VPS cũ**.

| Tab | Tổng | Số trang, 10 dòng/trang |
| --- | ---: | ---: |
| Tất cả | 239 | 24 |
| Đang thuê | 146 | 15 |
| Nháp | 0 | 1, rỗng |
| Quá hạn | 71 | 8 |
| Hoàn thành | 91 | 10 |

Quá hạn nằm trong Đang thuê, không cộng thêm vào tổng. Hai hợp đồng còn lại có trạng thái `wait_payment`. Mã cũ `VPS-27047` xuất hiện ở trang 24 của Tất cả, trang 10 của Hoàn thành và tìm trực tiếp được bằng ô tìm kiếm. Trang đầu/cuối được so với ID trong DB, cùng thứ tự; tổng không thay đổi theo trang.

Thời gian đọc trực tiếp: trang thường khoảng 147–304 ms; quá hạn khoảng 717–873 ms. Số liệu này là tại lúc kiểm tra, không phải cam kết hiệu năng.

## Xác minh bản sửa

- `node scripts/check-contract-history.cjs`: 6 nhóm đạt, gồm duyệt đủ 239 bản ghi không trùng/thiếu, tổng từng tab, tìm bản cũ ngoài trang hiện tại, khôi phục trang vượt phạm vi và tổng bộ lọc quá hạn/ngày.
- `check-contract-tabs.cjs`: 4 nhóm đạt; `check-management-table.cjs`: 10 nhóm đạt; `check-management-table-timeouts.cjs`: đạt.
- `npm.cmd run build`, `npm.cmd run typecheck`, ESLint riêng `src/lib/server/management-table.ts`: đạt. Build còn cảnh báo có sẵn ở `StaffOrganizationChart.tsx` và cấu hình Next ESLint.
- `python -X utf8 scripts/check-contract-tabs-ui.py --output .backups/contract-history-pagination-20261023/ui`: **15 tình huống đạt**, Chromium desktop và WebKit điện thoại. Cả ba quyền bấm Trang cuối đến trang 24, tìm mã cũ từ ngoài trang hiện tại, rồi đổi Đang thuê đến trang 15. Giữ các kiểm tra tab tải riêng, phản hồi đến muộn, lỗi 503 và form đang nhập. API trình duyệt dùng dữ liệu kiểm thử, chặn mọi thao tác ghi.
- HTTP GET vào API của production build local, dùng Supabase thật: cả ba quyền trả đúng 239/24, 146/15, 91/10, trang cuối có `VPS-27047` và tìm trực tiếp được mã đó. Không có cookie nhận 401.

Kết quả, ảnh và script đọc thật nằm trong `.backups/contract-history-pagination-20261023/` đã bị Git bỏ qua. Không ghi dữ liệu nghiệp vụ, không gửi Telegram. **Chưa triển khai lên website đang dùng.**
