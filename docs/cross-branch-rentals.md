# Hợp đồng theo nguồn khách, xe theo kho

- `customers.store_id` là cơ sở nguồn của hồ sơ khách. Tra SĐT/CCCD toàn hệ thống, không cần chọn cơ sở trước; hiển thị nguồn hồ sơ và cơ sở của hợp đồng thuê đầu tiên. Chọn hồ sơ tự gợi ý cơ sở nguồn/doanh thu cho hợp đồng.
- `orders.store_id` là cơ sở nguồn/doanh thu của hợp đồng. Bộ lọc và tổng tiền hợp đồng, phiếu thu, tài khoản nhận tiền dùng cơ sở này. Có thể chọn lại nguồn của hợp đồng khi nhập hộ; thao tác này không chuyển hồ sơ khách hay kho xe. “Liên kết nguồn khách” và “Cơ sở nguồn khách / doanh thu” cùng cập nhật lựa chọn này.
- `vehicles.store_id` giữ cơ sở gốc; `vehicles.current_store_id` giữ cơ sở đang quản lý xe. Chọn xe toàn hệ thống hoặc lọc riêng **Cơ sở giữ xe / kho xe**. Lưu/phát hành/trả hợp đồng không đổi hai trường này. Server xác nhận kho xe và lưu vào snapshot `stock_store_id/name`; không tin tên kho gửi từ client.

Ví dụ nguồn Láng, xe Nguyễn Hoàng: lập hợp đồng có nguồn/doanh thu Láng, chọn xe kho Nguyễn Hoàng. Nguyễn Hoàng vẫn thấy xe trong kho của mình với trạng thái Đang thuê; doanh thu và phiếu thu của hợp đồng về Láng. Không cần chuyển xe sang Láng.

Nếu Nguyễn Hoàng khớp kho trước lúc Láng nhập hợp đồng, có thể sửa xe sang Đang thuê khi xe chưa có hợp đồng mở. Láng sau đó chọn đúng xe này và phát hành trực tiếp. Server khóa xe và kiểm tra hợp đồng mở: chỉ chấp nhận Lưu kho hoặc Đang thuê chưa gắn hợp đồng; xe sửa chữa, bán, tạm ngừng hoặc đang thuộc hợp đồng khác bị chặn. Xe đã có hợp đồng mở không cho sửa trạng thái/chuyển kho thủ công. Trả xe trên hợp đồng giải phóng xe tại kho hiện tại.

## Ngày giờ và thanh toán

- Hợp đồng mới mặc định thuê hôm nay theo giờ Việt Nam, hẹn trả sau 1 ngày. Chọn giờ 00–23 và phút 00–59, ví dụ **15:30**, độc lập thiết lập AM/PM của trình duyệt.
- Nhập số ngày nguyên dương để tự tính hẹn trả, giữ cùng giờ và xử lý đổi tháng/năm/năm nhuận. Sửa hẹn trả trực tiếp được; khi đó đổi giờ/ngày thuê không ghi đè hẹn trả đã nhập. Nhập lại số ngày bật tính tự động. Nháp cũ giữ ngày giờ đã lưu.
- Hình thức cọc/thanh toán chọn nhiều mục, bấm ngoài hoặc chuyển focus ra ngoài sẽ đóng; Escape đóng danh sách và giữ form. Các mục đã chọn vẫn giữ nguyên.
- Sửa lỗi thiếu dấu ngoặc trong SQL ghi nhận trả xe, được phát hiện khi kiểm thử đầy đủ luồng.

## Kiểm tra

- `node scripts/check-cross-branch-rentals.cjs --live-temp`: 6 nhóm, gồm ngày giờ, khớp kho trước hợp đồng, lưu/phát hành, nguồn phiếu thu/tổng tiền theo bộ lọc, chặn trùng thuê/đổi kho, đổi xe và trả xe. Chỉ bảng PostgreSQL TEMP, rollback và sequence riêng; không ghi dữ liệu vận hành.
- `python scripts/check-cross-branch-rentals-ui.py --session-cookie-file <file phiên cục bộ>`: 7 nhóm, tra trước khi chọn cơ sở, gợi ý nguồn Láng, xe Nguyễn Hoàng, 24h dưới locale AM/PM, số ngày, dropdown, lưu request, khóa/mở sửa trạng thái xe và desktop/mobile. API nghiệp vụ được giả lập hoàn toàn. Ảnh/kết quả trong `docs/qa/cross-branch-rentals/`.
- Các bộ tra cứu khách toàn cơ sở, nháp, autofill, tổng hợp hợp đồng, phát hành và nhập Excel cùng typecheck/lint/build được chạy lại.
- Kiểm tra mẫu in/bố cục qua 7 nhóm, gồm lưu nháp rồi mở lại, PDF 1/2 xe và form mobile. `git diff --check` qua.

Không chuyển doanh thu hay cơ sở của hợp đồng cũ. Luồng lập/trả hợp đồng không cần migration mới. Chức năng **đổi xe** có sẵn dùng migration `docs/sql/2026-10-09-contract-vehicle-swaps.sql`; bảng lịch sử đổi xe đã được tạo để triển khai, chưa có giao dịch hay hợp đồng vận hành nào được đổi trong bước cài schema. Bộ TEMP tạo bảng kiểm thử độc lập.
