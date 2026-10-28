# Ghi chú tình trạng khách trên danh sách hợp đồng

- Các danh sách hợp đồng đã phát hành, gồm `/contracts` và `/contracts/overdue`, có cột **Ghi chú tình trạng khách**. Trên điện thoại, ô nhập nằm dưới thông tin hợp đồng.
- Dữ liệu dùng chung với báo cáo nợ chậm trong `management_collection_followups`; không sao chép hoặc chuyển dữ liệu cũ. Báo cáo nợ chậm được mở tại danh sách hợp đồng, không còn nằm ở GPS.
- Nhân viên có `contracts.draft` lưu/xóa ghi chú trực tiếp. Người chỉ có `contracts.read` được xem. Ghi chú không bắt buộc, tối đa 3.000 ký tự; không tự gửi Telegram.
- API `/api/auth/order/car-rental/followups`: GET đọc tối đa 200 ID mỗi lần theo phạm vi hợp đồng; PATCH dùng cùng kiểm tra revision và lịch sử với API cũ `/api/auth/gps/debts`. Ghi chú không sửa hợp đồng, kho xe hoặc tiền.
- Lỗi lưu giữ nội dung đang nhập; xung đột cần người dùng chọn nội dung cần giữ. Khi xuất CSV có cột ghi chú, dữ liệu lấy từ cùng nguồn đã lưu.

Kiểm tra: `node scripts/check-contract-followups-api.cjs`, `node scripts/check-operating-reports.cjs` (bảng TEMP, rollback), `npm run test:release`, build và `scripts/check-contract-collection-notes-ui.py` trên Chromium/WebKit với API mô phỏng. Không tạo ghi chú hoặc gửi Telegram trên dữ liệu vận hành để QA.
