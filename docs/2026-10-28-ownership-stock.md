# Xe phải được nhận vào kho Thuê sở hữu trước khi lập hợp đồng

Hợp đồng `ownership` và `ownership_cd` chỉ được chọn xe có kho hiện tại (`current_store_id`, dự phòng `store_id`) thuộc cơ sở `kind='lease_to_own'`. Xe đang chờ luân chuyển chưa được coi là đã nhận, dù cơ sở đích là Thuê sở hữu.

Giao diện khóa xe khác kho khi tìm biển số, kể cả tìm qua kho chung. Bản nháp cũ có xe khác kho không thể lưu hoặc duyệt tiếp. API kiểm tra kho thật trong cơ sở dữ liệu khi lưu nháp, phát hành, giao xe, đổi xe và tiếp tục thuê sau bảo lưu; không tin `stock_store_id` hoặc tên kho do trình duyệt gửi. Khóa xe khi phát hành/giao/đổi/tiếp tục thuê để việc kiểm tra và ghi nhận dùng cùng trạng thái kho.

Luồng đúng: chuyển xe → cơ sở Thuê sở hữu xác nhận nhận xe → nhân viên lập nháp → quản lý duyệt. Quyền xem xe trụ sở và thao tác điều chuyển vẫn được giữ. Thuê thường tiếp tục cho thuê xe khác cơ sở. Nhập bổ sung lượt thuê đã trả xe vẫn giữ kho hiện tại và kiểm tra trùng lịch sử như trước.

Kho quản lý xe và cơ sở nguồn/doanh thu hợp đồng là hai trường riêng. Ràng buộc kiểm tra **kho thật của xe**, không ép đổi cơ sở doanh thu hoặc chuyển phiếu thu giữa các cơ sở.

Theo yêu cầu người dùng, hai xe 89AC-134.47 (HĐ 2810262) và 20AC-034.27 (HĐ 2810261) đã được đối chiếu kho hiện tại từ Trụ sở chính sang Thuê sở hữu. Xe giữ trạng thái Đang thuê, cơ sở gốc, hợp đồng, dòng xe và toàn bộ phiếu thu. Lịch sử xe có sự kiện kỹ thuật chỉ rõ lý do, kho trước/sau và hợp đồng liên quan; không giả danh nhân viên hoặc tạo lần thuê/phiếu tiền mới. Bản trước sửa và bằng chứng riêng nằm trong thư mục Git bỏ qua.

Kiểm tra: `check-ownership-stock.cjs` chạy trong bộ kiểm tra phát hành; kiểm thử PostgreSQL TEMP của phát hành và thuê khác cơ sở; kiểm thử bảo lưu bằng schema riêng và rollback; typecheck, lint, build. Kiểm thử giao diện Chromium/WebKit dùng API giả lập, gồm xe trụ sở, xe chờ nhận, xe đã nhận và bản nháp cũ sai kho. Không gửi Telegram thật khi kiểm thử.
