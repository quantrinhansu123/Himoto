# Cơ sở nguồn khách trên danh sách xe

Ngày kiểm tra: 29/10/2026.

- Cột **Cơ sở nguồn khách** hiện mặc định cạnh tên khách; **Kho quản lý** hiển thị riêng. Thẻ điện thoại ghi rõ cả hai nhãn và cho tên cơ sở xuống dòng.
- Lọc kho ở đầu trang, trạng thái và cơ sở nguồn khách kết hợp được; tổng kết quả đếm toàn bộ dữ liệu phù hợp, không chỉ trang đang xem.
- Nguồn là `orders.store_id` của dòng xe chưa trả trên hợp đồng đang thuê/quá hạn/chờ thanh toán/nợ xấu. Hợp đồng đã đóng, dòng xe đã trả/xóa, hợp đồng pin di trú và cọc tương lai không thay nguồn đang thuê. Không tự lấy kho làm nguồn khi thiếu hợp đồng.
- Hàm `vehicle_rental_sources` chỉ trả ID xe/cơ sở. Tài khoản cơ sở thấy nguồn của xe cho thuê chéo cơ sở nhưng vẫn không đọc được hợp đồng/tài chính ngoài phạm vi.
- Đã cài migration bổ sung hàm đọc; không cập nhật xe, hợp đồng, phiếu thu hay gửi Telegram.

Kiểm tra:

- `node scripts/check-vehicle-rental-sources.cjs --live-temp`: 5 nhóm; dữ liệu PostgreSQL trong schema kiểm thử, rollback.
- `node scripts/check-contract-classification-availability.cjs`: 6 nhóm; kiểm tra RLS và loại trừ xe đã trả/pin, rollback.
- `node --require ./scripts/lib/offline-tests.cjs scripts/check-management-table.cjs`: 10 nhóm.
- `npm run test:release`: 40 bộ, chặn kết nối ngoài.
- `python scripts/check-vehicle-rental-sources-ui.py --cookie-file <phiên cục bộ>`: Chromium 1440px, WebKit 390px/320px; API giả lập, không ghi nghiệp vụ.
- Typecheck, ESLint các file sửa, production build và `git diff --check`.
- Đọc dữ liệu thật với tài khoản quản trị và nhân viên cơ sở: kho Nguyễn Hoàng/nguồn Hà Đông hiển thị đúng; lọc nguồn Hà Đông có kết quả, lọc Nguyễn Hoàng không nhận nhầm nguồn theo kho. Kiểm tra thêm sắp xếp và kết hợp bộ lọc kho Giáp Bát.

Ảnh/kết quả và bản lưu schema trước triển khai nằm ở `.backups/vehicle-rental-sources/` (không đưa phiên đăng nhập vào Git).
