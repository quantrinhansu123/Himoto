# Hợp đồng theo nguồn khách, xe theo kho

**Riêng thuê sở hữu:** từ 28/10/2026, xe phải được kho Thuê sở hữu nhận trước khi chọn và duyệt; xem [ràng buộc kho thuê sở hữu](2026-10-28-ownership-stock.md). Quy tắc thuê khác cơ sở bên dưới tiếp tục áp dụng cho thuê thường.

- `customers.store_id` là cơ sở nguồn của hồ sơ khách. Tra SĐT/CCCD toàn hệ thống, không cần chọn cơ sở trước; hiển thị nguồn hồ sơ và cơ sở của hợp đồng thuê đầu tiên. Chọn hồ sơ tự gợi ý cơ sở nguồn/doanh thu cho hợp đồng.
- `orders.store_id` là cơ sở nguồn/doanh thu của hợp đồng. Phiếu thu, tài khoản nhận tiền và báo cáo doanh thu dùng cơ sở này. Có thể chọn lại nguồn của hợp đồng khi nhập hộ; thao tác này không chuyển hồ sơ khách hay kho xe. “Liên kết nguồn khách” và “Cơ sở nguồn khách / doanh thu” cùng cập nhật lựa chọn này.
- `vehicles.store_id` giữ cơ sở gốc; `vehicles.current_store_id` giữ cơ sở đang quản lý xe. Dropdown **Cửa hàng xe** lấy toàn bộ cơ sở qua `store_directory()` (không khóa theo RLS cửa hàng của tài khoản). Chọn cửa hàng xe để lọc xe từ kho chung (`vehicle_inventory`). **Người phụ trách / Đại diện Bên A đi theo cửa hàng xe** (tự gợi ý tài khoản phụ trách cơ sở nếu có hồ sơ nhân sự khớp); NVKD ghi nhận doanh số theo cơ sở nguồn/doanh thu. Lựa chọn cửa hàng xe lưu riêng trong JSON hợp đồng (`vehicle_store_id`); chọn xe đầu tiên đồng bộ theo kho hiện tại của xe. Tra cứu khách hoặc đổi cơ sở doanh thu không đổi nhân viên/cửa hàng xe. Lưu/phát hành/trả hợp đồng không đổi hai trường cơ sở của xe. Server xác nhận kho xe và lưu vào snapshot `stock_store_id/name`; không tin tên kho gửi từ client. Migration `docs/sql/2026-10-20-cross-branch-contract-vehicles.sql` khóa/đánh dấu xe khi phát hành qua SECURITY DEFINER. Cọc giữ xe cho phép chen HĐ trả trước ngày nhận; chồng lịch cảnh báo + xác nhận (`docs/sql/2026-10-20-reservation-window-conflicts.sql`).

Ví dụ nguồn Láng, xe Nguyễn Hoàng: lập hợp đồng có nguồn/doanh thu Láng, chọn xe kho Nguyễn Hoàng. Nguyễn Hoàng vẫn thấy xe trong kho của mình với trạng thái Đang thuê; doanh thu và phiếu thu của hợp đồng về Láng. Không cần chuyển xe sang Láng.

Từ 29/10/2026, **Danh sách hợp đồng** và các danh sách hợp đồng đã phát hành dùng cơ sở đang xem để lọc **kho xe hiện tại**, qua tham số `store_basis=warehouse`. Mỗi dòng/thẻ ghi rõ **Kho xe** và **Nguồn khách**; bộ lọc **Tất cả nguồn khách** lọc độc lập theo `orders.store_id`. Hai hợp đồng VPS-28521 (98E1-438.66) và VPS-28404 (29B2-153.34) thuộc kho Nguyễn Hoàng, nguồn khách Láng, nên có khi chọn kho Nguyễn Hoàng. Bộ đếm, phân trang, tổng tiền của danh sách và xuất CSV áp dụng cùng điều kiện kho. Xe đã đổi/trả không thay kho của xe đang thuê; hợp đồng đã trả hết dùng các dòng xe lịch sử, nháp có kho dự kiến dùng lựa chọn đã lưu. Không lấy nguồn khách làm kho khi thiếu thông tin.

API không gửi `store_basis=warehouse` vẫn lọc theo nguồn để giữ các báo cáo và tích hợp hiện có. Trang Hợp đồng nháp riêng tiếp tục theo nguồn vì có thể chưa chọn xe. Giới hạn đọc hợp đồng/tài chính theo tài khoản vẫn áp dụng; đọc vị trí kho từ kho chung không mở quyền đọc hợp đồng cơ sở khác.

Danh sách xe hiển thị mặc định **Cơ sở nguồn khách** cạnh tên khách và **Kho quản lý** riêng; điện thoại cũng ghi rõ hai nhãn. Chọn kho ở đầu trang, trạng thái Đang thuê và bộ lọc cơ sở nguồn khách để đếm xe đang phục vụ khách từng cơ sở. Nguồn lấy từ `orders.store_id` của hợp đồng đang thuê có dòng xe chưa trả, không lấy kho xe hay hồ sơ khách cũ. Không có hợp đồng phù hợp thì để trống/Chưa xác định; cọc đặt trước không thay nguồn của khách đang thuê. Migration `docs/sql/2026-10-29-vehicle-rental-sources.sql` bổ sung hàm chỉ đọc ID xe/cơ sở, giúp tài khoản cơ sở thấy nguồn khách ngoài cơ sở mà vẫn giữ giới hạn đọc hợp đồng và tài chính.

Nếu Nguyễn Hoàng khớp kho trước lúc Láng nhập hợp đồng, có thể sửa xe sang Đang thuê khi xe chưa có hợp đồng mở. Láng sau đó chọn đúng xe này và phát hành trực tiếp. Server khóa xe và kiểm tra hợp đồng mở: chỉ chấp nhận Lưu kho hoặc Đang thuê chưa gắn hợp đồng; xe sửa chữa, bán, tạm ngừng hoặc đang thuộc hợp đồng khác bị chặn. Xe đã có hợp đồng mở không cho sửa trạng thái/chuyển kho thủ công. Trả xe trên hợp đồng giải phóng xe tại kho hiện tại.

## Ngày giờ và thanh toán

- Hợp đồng mới mặc định thuê hôm nay theo giờ Việt Nam, hẹn trả sau 1 ngày. Chọn giờ 00–23 và phút 00–59, ví dụ **15:30**, độc lập thiết lập AM/PM của trình duyệt.
- Nhập số ngày nguyên dương để tự tính hẹn trả, giữ cùng giờ và xử lý đổi tháng/năm/năm nhuận. Sửa hẹn trả trực tiếp được; khi đó đổi giờ/ngày thuê không ghi đè hẹn trả đã nhập. Nhập lại số ngày bật tính tự động. Nháp cũ giữ ngày giờ đã lưu.
- Hình thức cọc/thanh toán chọn nhiều mục, bấm ngoài hoặc chuyển focus ra ngoài sẽ đóng; Escape đóng danh sách và giữ form. Các mục đã chọn vẫn giữ nguyên.
- Khách trả trước để giữ xe ngày mai: **Hợp đồng → Nhận cọc giữ xe**. Khoản này trừ vào tiền thuê, có phiếu Thu ngay và đơn chờ giao xe; xem [hướng dẫn nhận cọc giữ xe](contract-reservations.md).
- Sửa lỗi thiếu dấu ngoặc trong SQL ghi nhận trả xe, được phát hiện khi kiểm thử đầy đủ luồng.

## Kiểm tra

- `node scripts/check-cross-branch-rentals.cjs --live-temp`: 6 nhóm, gồm ngày giờ, khớp kho trước hợp đồng, lưu/phát hành, nguồn phiếu thu/tổng tiền theo bộ lọc, chặn trùng thuê/đổi kho, đổi xe và trả xe. Chỉ bảng PostgreSQL TEMP, rollback và sequence riêng; không ghi dữ liệu vận hành.
- `python scripts/check-cross-branch-rentals-ui.py --session-cookie-file <file phiên cục bộ>`: 7 nhóm, tra trước khi chọn cơ sở, gợi ý nguồn Láng, xe Nguyễn Hoàng, 24h dưới locale AM/PM, số ngày, dropdown, lưu request, khóa/mở sửa trạng thái xe và desktop/mobile. API nghiệp vụ được giả lập hoàn toàn. Ảnh/kết quả trong `docs/qa/cross-branch-rentals/`.
- Các bộ tra cứu khách toàn cơ sở, nháp, autofill, tổng hợp hợp đồng, phát hành và nhập Excel cùng typecheck/lint/build được chạy lại.
- Kiểm tra mẫu in/bố cục qua 7 nhóm, gồm lưu nháp rồi mở lại, PDF 1/2 xe và form mobile. `git diff --check` qua.

Không chuyển doanh thu hay cơ sở của hợp đồng cũ. Luồng lập/trả hợp đồng không cần migration mới. Chức năng **đổi xe** có sẵn dùng migration `docs/sql/2026-10-09-contract-vehicle-swaps.sql`; bảng lịch sử đổi xe đã được tạo để triển khai, chưa có giao dịch hay hợp đồng vận hành nào được đổi trong bước cài schema. Bộ TEMP tạo bảng kiểm thử độc lập.
