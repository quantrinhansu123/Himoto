# Tự điền từ ảnh bằng Gemini và tải Cloudinary

## Cấu hình

Điền các biến sau ở `.env.local` khi chạy máy cá nhân, và ở Environment Variables của Vercel khi triển khai:

```dotenv
GEMINI_API_KEY=
GEMINI_OCR_MODEL=gemini-3.5-flash-lite
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Có thể dùng `CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME` thay ba biến Cloudinary. API key Gemini và API secret Cloudinary chỉ ở server, không dùng tiền tố `NEXT_PUBLIC_`. Tên cloud và API key Cloudinary được gửi cho trình duyệt cùng chữ ký tải ảnh, theo luồng signed upload của Cloudinary.

Chạy `docs/sql/2026-10-16-record-photos.sql` nếu chưa có bảng ảnh, sau đó `docs/sql/2026-10-16-cloudinary-photos.sql`. Migration sau bổ sung nơi lưu Cloudinary và giữ nguyên ảnh bytea cũ.

## Hành vi

- Thêm/sửa xe có **Chụp ảnh / Chọn ảnh đăng ký xe** cho hai mặt để tự điền biển số, số khung, số máy, màu sắc và năm sản xuất. Năm đăng ký/ngày cấp không thay thế năm sản xuất. Chỉ điền ô trống hoặc giá trị AI đã điền, giữ các giá trị nhập tay. Đổi/bỏ ảnh hủy kết quả cũ. API dùng quyền `vehicles.write`, độc lập quyền sửa khách hàng.
- Hồ sơ xe có ảnh đăng ký mặt trước/mặt sau và hai trang giấy mua bán. Chọn ảnh chưa ghi dữ liệu; khi bấm **Lưu xe / Thêm xe**, trình duyệt tải ảnh qua Cloudinary signed upload, server kiểm tra chữ ký/chủ sở hữu rồi lưu liên kết ảnh cùng thông tin xe trong một transaction. Lỗi ảnh rollback thông tin xe; form giữ ảnh và chữ để thử lại. Bỏ ảnh đã lưu chỉ có hiệu lực khi lưu xe. Trang chi tiết xe cho xem lại giấy tờ.
- Chức năng giấy tờ dùng `docs/sql/2026-10-23-vehicle-documents.sql` để mở bốn vị trí ảnh và quyền theo cơ sở hiện quản lý xe. Migration giữ nguyên các quy tắc ảnh khách/hợp đồng/chuyển xe đang có, chạy lại được. Đã áp dụng lên DB vận hành ngày 24/10/2026 trước khi push bản phát hành; số bản ghi ảnh giữ nguyên.
- Chụp hoặc chọn ảnh CCCD mặt trước/mặt sau trong form thêm khách: tự đọc số CCCD/CMND, họ tên, địa chỉ cư trú, ngày cấp và cơ quan cấp nếu xuất hiện rõ trong ảnh. Không suy đoán dữ liệu thiếu, không dùng ngày sinh hoặc ngày hết hạn làm ngày cấp. Số điện thoại và GPLX vẫn nhập từ thông tin thực tế của khách.
- Trong hợp đồng, phần Phương tiện có ô **Biển số để tự chọn xe** ngay cả khi chưa chọn xe. Biển số khớp duy nhất một xe trong kho sẽ chọn xe đó vào dòng đang trống. Biển chưa có, trùng nhiều xe hoặc ảnh không khớp xe đang chọn sẽ báo để kiểm tra thủ công; không tự thêm hoặc đổi biển số trong kho.
- Sau khi thu nhỏ ảnh, trình duyệt bắt đầu hai việc độc lập: gửi bytes trực tiếp tới `/api/auth/photo-ocr` để server gọi Gemini bằng Base64 inline; xin chữ ký rồi tải cùng ảnh thẳng lên Cloudinary. OCR không nhận URL Cloudinary và không chờ tải ảnh hoàn tất.
- Ảnh mới dùng loại `authenticated` của Cloudinary. Khi lưu hồ sơ/hợp đồng, server kiểm tra chữ ký phản hồi và chủ sở hữu, rồi lưu public ID, cloud name và version. Mở ảnh qua API quản lý đã đăng nhập; server lấy ảnh bằng URL tải riêng hết hạn sau 60 giây. Ảnh cũ trong Supabase vẫn xem được qua cùng API.
- Xóa hồ sơ sẽ xóa liên kết ảnh trong DB. File trên Cloudinary được quản lý trong thư mục `himoto/management/<user-id>/`; file đã tải khi người dùng bỏ form hoặc thay ảnh vẫn nằm trong Cloudinary, cần dọn theo chính sách lưu trữ của tài khoản.
- AI chỉ điền ô trống hoặc sửa giá trị AI đã tự điền trước đó. Giữ nguyên ô người dùng sửa trong lúc chờ, và không ghép thông tin khi số CCCD trên ảnh khác hồ sơ đang nhập. Đổi/bỏ ảnh hủy áp dụng kết quả cũ. Có **Bỏ qua AI**, **Đọc lại ảnh** và **Tải ảnh lại** riêng biệt.
- Lỗi Gemini không xóa ảnh hay dữ liệu nhập tay. Lỗi Cloudinary không ngăn Gemini đọc ảnh; ảnh được giữ trong form để tải lại. Lưu ảnh cần cấu hình Cloudinary hợp lệ.

## Kiểm tra

```powershell
npm.cmd run test:photo-ocr
node scripts/check-photo-ocr.cjs --live-temp
node scripts/check-customer-entry.cjs --live-temp
python scripts/check-photo-ocr-ui.py --session-cookie-file <cookie-file>
python scripts/check-photo-ocr-ui.py --browser webkit --session-cookie-file <cookie-file>
```

Các kiểm tra browser chặn API nghiệp vụ và nhà cung cấp, giữ upload Cloudinary chưa hoàn thành để xác nhận OCR điền form trước; gồm sửa tay, thay ảnh, lỗi/quota và chọn xe. Kiểm tra DB dùng bảng TEMP và rollback. Kết quả gọi Gemini thật ở `docs/qa/photo-ocr/live-gemini.json` chỉ dùng ảnh chữ tổng hợp, không gửi CCCD/biển số của khách thật.

Tài liệu đối chiếu: [Gemini generateContent](https://ai.google.dev/api/generate-content), [model Gemini](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [Cloudinary signed uploads](https://cloudinary.com/documentation/client_side_uploading), [ảnh authenticated và tải riêng](https://cloudinary.com/documentation/control_access_to_media).
