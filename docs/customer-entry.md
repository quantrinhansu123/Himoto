# Nhập khách hàng, ảnh hồ sơ và thanh toán

- Khách mới mặc định **Bình thường**, kể cả thêm tại chỗ từ hợp đồng. Chọn **Chưa hoàn tất** nếu cần lưu hồ sơ tạm thiếu CCCD/địa chỉ trong luồng hợp đồng.
- Ngày cấp CCCD và GPLX chia sẵn ba ô `dd / mm / yyyy`. Gõ đủ 2 số ngày tự chuyển sang tháng, đủ 2 số tháng tự chuyển sang năm; hỗ trợ Tab, dấu `/`, Backspace quay lại ô trước và dán ngày đầy đủ. Dữ liệu gửi API vẫn là `yyyy-mm-dd`; ngày không tồn tại hoặc chưa nhập đủ bị chặn.
- Form khách mới và phần Khách hàng trong hợp đồng có **Chụp CCCD** mặt trước/mặt sau. Phần Phương tiện có **Chụp biển số xe**, riêng từng xe. Có nút chụp bằng camera sau và chọn ảnh thư viện; trình duyệt quyết định giao diện camera trên thiết bị. [Gemini tự điền và tải Cloudinary song song](photo-ocr.md) đọc CCCD và hỗ trợ chọn xe theo biển số ngay sau khi chụp.
- Ảnh mới lưu khi lưu khách hàng, lưu nháp, hoàn tất hợp đồng hoặc lưu hồ sơ hợp đồng. Chi tiết khách hàng/hợp đồng cho xem lại và thay ảnh bằng nút **Lưu ảnh**. Nếu tải ảnh lỗi, giữ form và thử lại; lần thử tiếp dùng khách hàng/bản nháp đã lưu.
- **Hoàn tất & thanh toán** mở bước **Xác nhận thanh toán**. Kiểm tra tiền cọc, tiền thuê/phí, tài khoản và ngày thực nhận. Bỏ chọn khoản chưa nhận; thu một phần sẽ để lại số còn thiếu. Nhấn **Xác nhận lưu chính thức** để phát hành và ghi phiếu thu theo nghiệp vụ hiện có.
- Khi chia cọc hoặc tiền thuê thành nhiều hình thức, một khoản tự tính phần còn lại: cọc 2.000.000 đ, khoản đầu 1.800.000 đ thì khoản sau là 200.000 đ. Sửa tay khoản tự tính để ghi nhận thu một phần; phí cố định và khoản đã thu trước vẫn được giữ riêng. Khoản tự tính bằng 0 không tạo phiếu thu.

## Lưu trữ

Chạy migration `docs/sql/2026-10-16-record-photos.sql`, rồi `docs/sql/2026-10-16-cloudinary-photos.sql` trước khi triển khai. Bảng `himoto.management_record_photos` lưu liên kết Cloudinary cho ảnh mới và bytea cho ảnh cũ, tách khỏi danh sách khách/hợp đồng; ảnh trước tải tối đa 2 MB. Khóa ngoại tự dọn dữ liệu ảnh/liên kết trong DB khi xóa hẳn hồ sơ; hợp đồng xóa mềm sẽ không cho truy cập ảnh. Trình duyệt thu nhỏ về tối đa 1800 px và chuyển JPEG trước khi tải. API xác thực phiên, kiểm tra cùng origin khi ghi; ảnh được đọc qua API quản lý và không được cache. RLS bật, `anon`/`authenticated` không có quyền trực tiếp. Xem chính sách dọn file Cloudinary trong tài liệu OCR.

## Kiểm tra

```powershell
npm.cmd run test:customer-entry
node scripts/check-customer-entry.cjs --live-temp
python scripts/check-customer-entry-ui.py --session-cookie-file <cookie-file>
python scripts/check-customer-entry-ui.py --browser webkit --session-cookie-file <cookie-file>
```

Kiểm tra DB dùng bảng TEMP và rollback. Kiểm tra browser chặn toàn bộ API nghiệp vụ, dùng hồ sơ và ảnh tổng hợp; không tạo khách, hợp đồng hoặc phiếu thu thật.
