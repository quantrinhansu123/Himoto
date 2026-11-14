# Giới hạn thời gian tải danh sách — 08/11/2026

Ảnh báo lỗi cho thấy danh sách hợp đồng trên iPhone còn ở trạng thái tải. Chưa xác định được nguyên nhân của phiên production vì cookie kiểm thử hiện có trả 401 (hết hạn).

`requestManagementTable` nay giới hạn toàn bộ fetch và bước đọc JSON bằng một promise deadline riêng. Sau 45 giây (120 giây cho xuất toàn bộ), yêu cầu kết thúc với thông báo thử lại kể cả khi transport không phản hồi AbortController. Hủy do chuyển trang cũng kết thúc promise ngay; timer và listener được dọn khi kết thúc. Đây là biện pháp chống treo, không phải bằng chứng rằng transport là nguyên nhân trong ảnh.

Đã kiểm tra timeout, fetch bỏ qua abort, JSON không kết thúc, hủy điều hướng, signal đã hủy, và các kiểm tra danh sách/loading/performance hiện có. TypeScript và lint file thay đổi đạt.

Đối chiếu READ ONLY trên DB thật: trang đầu mọi cơ sở khoảng 524ms, thống kê riêng khoảng 3314ms; dòng và tổng khớp luồng gộp. Không ghi dữ liệu nghiệp vụ. Các phép đo không đại diện cho thời gian tải qua Vercel trên điện thoại.

Thay đổi deadline mới chưa được triển khai lên production. Cần triển khai và xác minh lại bằng phiên đăng nhập hợp lệ.
