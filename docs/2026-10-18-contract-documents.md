# Hồ sơ ảnh hợp đồng

Luồng và giới hạn bên dưới đã được thay thế bởi [Gom ảnh và xác nhận gửi ở bước cuối](2026-10-18-contract-telegram-final-submit.md): không còn trần 15 ảnh; chỉ gửi khi chủ động bấm Gửi toàn bộ Telegram.

- Cuối màn hình xác nhận thanh toán có mục **Hồ sơ hợp đồng & giấy tờ khách hàng** và nút **Tải thêm loạt ảnh hồ sơ hợp đồng**. Chọn nhiều ảnh, bấm **Lưu ảnh**, rồi xác nhận lưu chính thức. Có thể tải thêm nhiều đợt; tổng tối đa 15 ảnh bổ sung mỗi giao dịch, riêng với 15 ảnh và 3 video ở phần ảnh xe.
- CCCD/hộ chiếu và GPLX đã lưu khi tạo khách được sao chép vào hợp đồng khi lưu bản nháp hoặc mở mục hồ sơ. Khi hoàn tất giao dịch, server bổ sung các ảnh còn thiếu trước khi chốt thông báo Telegram. Ảnh GPLX chụp trong trình nhập hợp đồng cũng được đính kèm.
- Bản sao giữ nguyên nội dung tại thời điểm lấy giấy tờ. Lấy lại chỉ bổ sung ô trống; chỉnh hồ sơ khách sau đó không ghi đè ảnh hợp đồng. Đổi khách của bản nháp sẽ xóa giấy tờ và ảnh hồ sơ bổ sung của khách cũ.
- Danh mục gợi ý gồm hợp đồng đã ký, biên nhận, bàn giao, VNeID, giấy tờ bản cứng/giảm giá và thông tin khác do khách cung cấp. Các mục không áp dụng có thể bỏ qua; không bắt buộc tải đủ danh mục.
- Từng giao dịch thuê/giao/trả/gia hạn giữ ảnh bổ sung riêng. Telegram gửi toàn bộ ảnh thuộc giao dịch theo album tối đa 10 tệp. Thông báo đã xếp hàng giữ nguyên ảnh; ảnh thêm sau được xem và gửi bằng thao tác gửi Telegram trong chi tiết hợp đồng.
- Ảnh/video mới lưu tại Cloudinary, database giữ tham chiếu. Sao chép giấy tờ sang hợp đồng dùng chung tham chiếu Cloudinary hiện có, không tải lại file. Ảnh cũ dạng binary vẫn được hỗ trợ.

Migration: `sql/2026-10-18-contract-document-photos.sql` mở rộng ràng buộc loại ảnh, không đổi quyền truy cập cơ sở và không cập nhật dữ liệu nghiệp vụ.

Kiểm thử: `npm run test:gps-contract-integrations` kiểm tra giới hạn, phân loại giao dịch, bản sao giấy tờ, API xác thực, album Telegram và tính bất biến của hàng đợi trong schema rollback; `npm run test:account-scope` kiểm tra bản sao khác cơ sở và đổi khách trong bản nháp dưới RLS thực. Không gửi Telegram thật trong kiểm thử.
