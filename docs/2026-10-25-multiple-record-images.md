# Chọn nhiều ảnh cho toàn bộ hồ sơ (Đổi xe, Hợp đồng, Khách hàng, Xe)

## 1. Nhu cầu & Phạm vi

Trước đây một số vị trí tải ảnh như đổi xe (`vehicle-swap`), chuyển xe (`transfer`), nhận xe (`receive`), giấy tờ xe (`registration`, `purchase-document`) và chứng từ chuyển khoản chỉ cho chọn hoặc lưu 1 ảnh, dẫn đến việc nhân viên không tải đủ nhiều góc ảnh hoặc hóa đơn thanh toán nhiều trang.

Toàn bộ các mục liên quan đến ảnh trên hệ thống được chuyển sang hỗ trợ chọn nhiều ảnh cùng lúc, lưu trữ đồng bộ và cho phép bổ sung sau mà không ghi đè:

1. **Đổi xe (`ContractVehicleSwapDialog` & `ContractPhotoGallery`)**:
   - Sau khi đổi xe trong hợp đồng, cho phép chọn nhiều ảnh cùng lúc với nút `Chọn nhiều ảnh đổi xe` (hoặc chụp liên tiếp).
   - Ảnh được đưa vào danh sách xem trước, bấm `Lưu ảnh` để xác nhận gắn vào hồ sơ. Nếu mạng lỗi/lưu thất bại, các ảnh đã chọn vẫn được giữ trong form để thử lại.
   - Khi hợp đồng đã hoàn tất đổi xe, tab **Ảnh thuê / trả xe** trong chi tiết hợp đồng hiển thị mục **Bổ sung ảnh đổi xe · [Lượt ...]** để tải thêm ảnh bất kỳ lúc nào.
2. **Hợp đồng & Ký kết (`ContractComposer`, `ContractPaymentDialog`, `ContractDetail`)**:
   - Ảnh hợp đồng đã ký và bill chuyển khoản (`rental-document-1`, `rental-document-2`): chọn nhiều trang hợp đồng (`rental-signed-2..n`) và nhiều ảnh bill (`rental-document-2-extra-2..n`).
   - Ảnh biển số xe (`plate-[id]`): cho phép chọn nhiều ảnh biển số và lưu cùng bản nháp.
   - Ảnh xe 4 góc, toàn cảnh & video: hỗ trợ chọn hàng loạt và bổ sung.
   - Ảnh hồ sơ bổ sung (`ContractDocuments`): chọn loạt ảnh hợp đồng.
3. **Trả xe & Hoàn cọc (`RefundQrUpload`, `ReturnSettlementFields`)**:
   - Cho phép chọn nhiều ảnh QR/thông tin tài khoản nhận hoàn cọc của khách hàng, ảnh đầu tiên tự động nhận diện và trích xuất số tài khoản/ngân hàng.
4. **Khách hàng (`CustomerCreateDialog`, `CustomerDocumentBatch`, `CustomerDetail`)**:
   - Chọn bộ nhiều ảnh CCCD và GPLX cùng lúc để AI tự nhận diện và trích xuất.
   - Các ô CCCD mặt trước, mặt sau và GPLX đều cho phép chọn nhiều ảnh bổ sung.
5. **Xe & Luân chuyển (`VehicleActionDialog`, `VehicleDocumentFields`, `VehicleDetail`)**:
   - Chuyển xe & Nhận xe: cho phép chọn nhiều ảnh chuyển xe và nhận xe.
   - Đăng ký xe & giấy mua bán: mỗi mục cho phép chọn nhiều trang/ảnh chụp bổ sung.

## 2. Cơ sở dữ liệu & Phân quyền

- Migration `docs/sql/2026-10-25-multiple-record-images.sql`:
  - Hàm `himoto.photo_base_slot(value text)` chuẩn hóa slot loại bỏ hậu tố `-extra-[2-9]...`.
  - Cập nhật constraint `management_record_photos_slots` cho phép các slot đổi xe không giới hạn `^vehicle-swap-[1-9][0-9]{0,14}-[1-9][0-9]{0,14}$` và các ảnh bổ sung dạng `<base-slot>-extra-<n>`.
  - Cập nhật RLS policies trên `himoto.management_record_photos` để các ảnh bổ sung kế thừa đúng quyền đọc/ghi của slot gốc.
- Đã áp dụng trực tiếp lên cơ sở dữ liệu Supabase của hệ thống.

## 3. Kiểm tra tự động

- `node scripts/check-multiple-record-images.cjs`: Đạt 5/5 kiểm tra (40 ảnh bổ sung không ghi đè, quyền thừa kế đúng, event RLS và xác minh hợp đồng).
- `node scripts/check-global-vehicle-transfers.cjs`: Đạt 6/6 kiểm tra (nhiều ảnh chuyển/nhận xe, RLS và phân quyền).
- `node scripts/check-contract-autofill.cjs`: Đạt 13/13 kiểm tra.
- `node scripts/check-refund-qr.cjs`: Đạt 5/5 kiểm tra.
- `node scripts/check-customer-entry.cjs`: Đạt 4/4 kiểm tra.
- `npm.cmd run typecheck`: TypeScript không có lỗi.
- `npm.cmd run lint`: ESLint qua toàn bộ.
- `npm.cmd run build`: Next.js 15 production build hoàn tất thành công.
