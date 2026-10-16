# Nhập khách hàng, ảnh hồ sơ và thanh toán

- Khách mới mặc định **Bình thường**, kể cả thêm tại chỗ từ hợp đồng. Chọn **Chưa hoàn tất** nếu cần lưu hồ sơ tạm thiếu CCCD/địa chỉ trong luồng hợp đồng.
- Ngày cấp CCCD và GPLX nhập trực tiếp theo `dd/mm/yyyy`, hoặc gõ 8 số `ddmmyyyy`. Dữ liệu gửi API vẫn là `yyyy-mm-dd`; ngày không tồn tại hoặc chưa nhập đủ bị chặn.
- Form khách mới và phần Khách hàng trong hợp đồng có **Chụp CCCD** mặt trước/mặt sau. Phần Phương tiện có **Chụp biển số xe**, riêng từng xe. Có nút chụp bằng camera sau và chọn ảnh thư viện; trình duyệt quyết định giao diện camera trên thiết bị.
- Ảnh mới lưu khi lưu khách hàng, lưu nháp, hoàn tất hợp đồng hoặc lưu hồ sơ hợp đồng. Chi tiết khách hàng/hợp đồng cho xem lại và thay ảnh bằng nút **Lưu ảnh**. Nếu tải ảnh lỗi, giữ form và thử lại; lần thử tiếp dùng khách hàng/bản nháp đã lưu.
- **Hoàn tất & thanh toán** mở bước **Xác nhận thanh toán**. Kiểm tra tiền cọc, tiền thuê/phí, tài khoản và ngày thực nhận. Bỏ chọn khoản chưa nhận; thu một phần sẽ để lại số còn thiếu. Nhấn **Xác nhận lưu chính thức** để phát hành và ghi phiếu thu theo nghiệp vụ hiện có.

## Lưu trữ

Chạy migration `docs/sql/2026-10-16-record-photos.sql` trước khi triển khai. Bảng `himoto.management_record_photos` lưu ảnh tách khỏi danh sách khách/hợp đồng; mỗi ảnh tối đa 2 MB. Khóa ngoại tự dọn ảnh khi xóa hẳn hồ sơ; hợp đồng xóa mềm sẽ không cho truy cập ảnh. Trình duyệt thu nhỏ về tối đa 1800 px và chuyển JPEG trước khi tải. API xác thực phiên, kiểm tra cùng origin khi ghi, kiểm tra loại/nội dung/kích thước; ảnh không có URL công khai và không được cache. RLS bật, `anon`/`authenticated` không có quyền trực tiếp.

## Kiểm tra

```powershell
npm.cmd run test:customer-entry
node scripts/check-customer-entry.cjs --live-temp
python scripts/check-customer-entry-ui.py --session-cookie-file <cookie-file>
python scripts/check-customer-entry-ui.py --browser webkit --session-cookie-file <cookie-file>
```

Kiểm tra DB dùng bảng TEMP và rollback. Kiểm tra browser chặn toàn bộ API nghiệp vụ, dùng hồ sơ và ảnh tổng hợp; không tạo khách, hợp đồng hoặc phiếu thu thật.
