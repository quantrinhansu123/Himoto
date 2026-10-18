# Khách nước ngoài, ảnh hồ sơ và video hợp đồng

- Bật **Khách nước ngoài** trong form thêm/sửa khách hoặc phần khách hàng của hợp đồng. Nhập hộ chiếu / giấy tờ quốc tế, quốc tịch và kênh liên hệ tùy chọn. Không bắt buộc SĐT Việt Nam, địa chỉ hay người thân; cần tên và ít nhất một số điện thoại hoặc tài khoản/liên kết liên hệ. Hồ sơ tạm có thể bổ sung giấy tờ sau. Hồ sơ Việt Nam giữ kiểm tra số CCCD/CMND và điện thoại hiện có.
- Tra cứu chính xác CCCD, hộ chiếu, số quốc tế, Facebook/WhatsApp trên toàn hệ thống. Hồ sơ vẫn thuộc cơ sở quản lý cũ. Tra cứu không cấp quyền sửa hồ sơ/ảnh của cơ sở khác và không đổi cơ sở doanh thu đang chọn trong hợp đồng.
- Nút chụp/chọn ảnh GPLX ở ngay cạnh thông tin giấy phép. AI chỉ điền số giấy phép và ngày cấp; hộ chiếu lấy **Passport No**, không lấy Personal No. Có thể nhập tay khi AI không đọc rõ. Ảnh GPLX chụp trong form khách lưu vào hồ sơ khách; ảnh chụp trong hợp đồng lưu riêng vào hợp đồng để giữ phân quyền cơ sở.
- Tại **bước 5 — Ký kết & ghi chú**, mục **Ảnh hồ sơ & video tình trạng xe** nhận nhiều tệp một lần: tối đa **15 ảnh + 3 video mỗi giao dịch**. Cũng áp dụng cho thuê, giao, trả xe và từng lần gia hạn. Có thể lưu nháp với một phần tài liệu rồi bổ sung sau.
- Video MP4/MOV/WebM tối đa **45 MB, 60 giây**, khuyến nghị 10–30 giây. Trình duyệt không đọc được HEVC vẫn được tải; Cloudinary chuyển MP4/H.264, server kiểm tra thời lượng, dung lượng và phiên bản thực tế trước khi lưu tham chiếu. Ảnh/video dùng Cloudinary authenticated; database lưu mã tài nguyên, không chứa byte video. Xem/tua video qua API có phiên đăng nhập và phân quyền hợp đồng.
- Lưu ảnh/video không tự gửi Telegram. Khi hoàn tất giao dịch, tùy chọn tự gửi hiện có quyết định xếp hàng; thao tác gửi tay vẫn yêu cầu lưu hết tệp và xem trước nội dung mới nhất. Telegram gửi ảnh/video trong album tối đa 10 tệp; nhiều hơn chia album, một video dùng `sendVideo`. Không tự thử lại trạng thái gửi không rõ kết quả.

Migration: `docs/sql/2026-10-18-international-customers-contract-media.sql` (bổ sung cột, mở rộng slot/MIME, không sửa dữ liệu nghiệp vụ).

Kiểm tra trùng dùng `docs/sql/2026-10-18-customer-duplicate-lookup.sql`: hàm chỉ trả ID trùng giấy tờ/SĐT trên cùng kết nối đang giữ khóa ghi; không mượn thêm kết nối từ pool và không mở rộng quyền đọc/sửa hồ sơ cơ sở khác.

Kiểm tra: `npm.cmd run test:international-media`; `node scripts/check-customer-global-search.cjs --live-temp`; `node scripts/check-photo-ocr.cjs --live-temp`; `npm.cmd run test:gps-contract-integrations`; `npm.cmd run test:account-scope`; `npm.cmd run typecheck`; `npm.cmd run lint`; `npm.cmd run build`.

Kiểm thử UI dùng Chromium 1440px và WebKit 390px với API ghi giả: khách nước ngoài không có SĐT, hộ chiếu/GPLX, chọn 15 ảnh + 1 video, lưu tệp trước thanh toán. Video mẫu được tải và đọc riêng tư trên Cloudinary thật (HTTP 206), sau đó xóa đúng tài nguyên kiểm thử. Telegram được kiểm tra qua mock API, không gửi thử vào nhóm thật.
