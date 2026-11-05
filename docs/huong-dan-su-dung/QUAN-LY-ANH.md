# Quản lý ảnh của tài liệu hướng dẫn

## Bộ bàn giao

- `HUONG-DAN-SU-DUNG-HIMOTO.md`: tài liệu để đọc, chỉnh sửa hoặc đưa lên hệ thống đào tạo.
- `images/01-...jpg` đến `images/06-...jpg`: sáu ảnh chụp giao diện thực tế, biểu mẫu trống.
- `images-manifest.json`: danh mục ảnh và đường dẫn Cloudinary sau khi tải thành công.
- `scripts/upload-user-guide-images.cjs` (tính từ gốc dự án): công cụ tải ảnh và đổi liên kết Markdown sang Cloudinary.

Khi gửi tài liệu để đọc ngoại tuyến, giữ file Markdown và thư mục `images` cùng vị trí tương đối như bộ bàn giao. Có thể mở Markdown bằng trình xem có hỗ trợ ảnh hoặc nhập vào công cụ soạn tài liệu.

## Trạng thái Cloudinary

Ngày 05/11/2026: môi trường local chưa cung cấp cấu hình Cloudinary, vì vậy ảnh chưa được tải lên dịch vụ. Tài liệu hiện dùng đường dẫn ảnh cục bộ, không có liên kết Cloudinary giả.

## Kết nối Cloudinary

Người quản trị thiết lập một trong hai cách trong môi trường local của dự án:

- `CLOUDINARY_URL`; hoặc
- đủ ba biến `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

Không đưa khóa bí mật vào tài liệu, ảnh minh họa hoặc Git. Bộ công cụ chỉ đọc cấu hình sẵn có; không ghi khóa vào danh mục ảnh.

Tại thư mục gốc HIMOTO, kiểm tra cấu hình mà chưa tải ảnh:

```powershell
node scripts/upload-user-guide-images.cjs --check
```

Khi đã có cấu hình và duyệt nội dung ảnh, tải ảnh lên:

```powershell
node scripts/upload-user-guide-images.cjs --upload
```

Công cụ sẽ tải sáu ảnh, kiểm tra đường dẫn truy cập, ghi danh mục ảnh và thay các liên kết trong Markdown bằng URL HTTPS của Cloudinary. Nếu tải dở, danh mục giữ tiến độ để có thể chạy lại. Ảnh có nội dung mới được cấp tên theo dấu vân tay nội dung, tránh ghi đè bản cũ.

Ảnh hướng dẫn sử dụng chế độ truy cập công khai để nhúng được trong tài liệu. Chỉ dùng ảnh trống hoặc ảnh dữ liệu minh họa đã được duyệt. Không thay ảnh bằng căn cước, số điện thoại, bill ngân hàng hoặc hồ sơ khách thật rồi tải công khai.

## Bổ sung ảnh cho các nghiệp vụ sau phát hành

Các phần gia hạn, trả xe, sửa/gửi Telegram, duyệt và xóa/ẩn hiện được mô tả bằng chữ trong tài liệu. Khi cần thêm ảnh:

1. Chuẩn bị môi trường hoặc hồ sơ minh họa được duyệt.
2. Mở đúng nghiệp vụ và chụp giao diện trước bước xác nhận tác động thật.
3. Đặt tên ảnh tăng dần và chèn ảnh ngay dưới bước tương ứng.
4. Kiểm tra không lộ dữ liệu khách hàng hoặc khóa kết nối.
5. Cập nhật danh mục ảnh và tải lên Cloudinary nếu cần.

Công cụ hiện chọn các ảnh có tên dạng `07-ten-buoc.jpg`, nên có thể bổ sung ảnh theo cùng quy tắc. Khi tài liệu thay đổi, cập nhật ngày và kiểm tra lại ảnh với tên nút hiện hành.
