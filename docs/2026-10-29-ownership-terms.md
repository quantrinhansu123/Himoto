# Bổ sung thời hạn và mức đóng hợp đồng thuê sở hữu cũ

Quản lý Thuê sở hữu và quản trị viên có quyền lập hợp đồng được sửa thông tin này trong phạm vi tài khoản, kể cả quản lý có phạm vi toàn bộ cơ sở nhưng không gắn một cơ sở cố định. Quyền sửa hồ sơ hợp đồng thông thường giữ nguyên.

Thao tác: **Hợp đồng thuê sở hữu → ⋯ → Xem chi tiết → Sửa thời hạn / mức đóng**. Chọn phân loại 6 / 9 / 12 / 18 / 24 tháng hoặc Chưa phân loại, nhập số tiền đóng mỗi ngày cho toàn bộ xe của hợp đồng. Để trống khi chưa xác định, không ghi thành 0. Hợp đồng nháp sửa theo luồng lập nháp; hợp đồng đã hủy không được cập nhật tại đây.

Đây là bổ sung mức đúng của hợp đồng cũ để theo dõi, theo xác nhận của người dùng. Mức đóng lưu riêng trong `management_composer.ownership_terms`; thời hạn dùng `management_composer.profile.ownership_term_months` để đồng bộ cột và bộ lọc hiện có. Không tính lại công nợ cũ, tổng tiền, cọc, kỳ đóng, hạn trả, dòng xe hay phiếu thu/chi. Chưa nhập giá trị thật cho bất kỳ hợp đồng nào.

API GET/PATCH `/api/auth/order/car-rental/:id/ownership-terms` kiểm tra quyền và phạm vi trên server; PATCH khóa bản ghi, kiểm tra phiên bản và chống lưu trùng khi mất phản hồi. Lịch sử giữ người sửa, thời gian và giá trị trước/sau, hiển thị trong biểu mẫu và lịch sử hợp đồng. Không phát sinh thông báo Telegram.

Kiểm tra: `node scripts/check-ownership-terms.cjs` (offline, nằm trong `npm run test:release`); thêm `--live-temp` để kiểm tra SQL thật trên bảng TEMP, rollback, không ghi dữ liệu nghiệp vụ. `python scripts/check-ownership-terms-ui.py --sessions <thư mục session QA riêng>` kiểm tra Chromium/WebKit, quyền quản lý/admin và chặn nhân viên/kế toán, lưu/tải lại, xung đột phiên bản, mất phản hồi, số tiền chưa xác định và giao diện 320px. Toàn bộ API nghiệp vụ trong bài UI được chặn bằng dữ liệu giả.
