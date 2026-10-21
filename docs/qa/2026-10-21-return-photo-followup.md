# Bổ sung ảnh sau trả xe và kiểm tra số 005734

## Dữ liệu đối chiếu

- `VPS-32017` (#57586), xe `17B5-141.53`, thuộc hợp đồng Hà Đông; xe vẫn ở kho Giáp Bát. API production với tài khoản Hà Đông vẫn tìm thấy hợp đồng và 7 ảnh/video, không có bản ghi bị xóa.
- Hệ thống đã ghi nhận trả xe và hoàn tất hợp đồng lúc 11:06 ngày 21/10/2026, actor #154. Giờ trả thực tế nhập là 16:05 ngày 20/10/2026. Phiếu chi #172338 được duyệt, hoàn cọc 500.000đ. Người dùng xác nhận đã nhận xe và hoàn đủ cọc thực tế. Giữ nguyên trạng thái và toàn bộ phiếu tiền.
- Metadata ảnh không trùng thời điểm trả xe. Chưa có bằng chứng xác định thao tác lưu ảnh gây ra lần trả này. Giao diện cũ có thể nhận submit ngầm từ bàn phím; bản sửa loại bỏ đường xác nhận đó.
- `005734` nằm trong nháp #57746 của Hàng Bút, đã xóa lúc 08:56 ngày 21/10/2026. Migration ở bản trước đã đổi reference thành `DELETED-57746` và giữ số cũ trong audit. Kiểm tra hiện tại: số `005734` khả dụng. Không nhầm với `VPS-5734`, hợp đồng lịch sử riêng đã hoàn tất.

## Thay đổi

- Form trả xe bỏ submit ngầm. Chỉ nút **Xác nhận trả … xe** gọi API trả xe; giữ kiểm tra hợp lệ của trình duyệt và điều kiện ảnh, khoản thu/hoàn đang có.
- Chi tiết hợp đồng hoàn tất thêm nút **Bổ sung ảnh trả xe**, yêu cầu quyền `contracts.return`. Hộp thoại tải đúng ảnh/video/hồ sơ của dòng xe đã trả, không có nút ghi trả lần nữa khi tất cả xe đã trả.
- Dùng API ảnh và kiểm tra quyền/cơ sở hiện có. Lưu ảnh không gọi trả xe, không tạo phiếu tiền và không gửi Telegram.
- Nhãn tệp chưa lưu dùng nội dung chung, phù hợp cả bổ sung hồ sơ sau trả xe.

## Kiểm tra

- `node scripts/check-return-refunds.cjs`: 11 nhóm đạt, TEMP rollback; không ghi dữ liệu kinh doanh hoặc thay đổi sequence production.
- `python scripts/check-return-photo-separation-ui.py --session-cookie-file <temporary-session>`: 6 kiểm thử Chrome desktop và WebKit iPhone đạt. Enter, submit ngầm và lưu ảnh giữ hợp đồng đang thuê; xác nhận rõ ràng ghi đúng một lần; hợp đồng hoàn tất nhận thêm ảnh mà không phát sinh trả xe hoặc phiếu tiền. Mọi API/Cloudinary ghi được chặn và mô phỏng.
- `python scripts/check-return-refunds-ui.py --branch-cookie-file <temporary-session>`: 22 trường hợp Chrome/WebKit đạt, không lỗi JavaScript. Có hoàn bằng thông tin nhập/QR, hoãn hoàn, dữ liệu nhận tiền không hợp lệ và lỗi tải khoản thu/hoàn. Toàn bộ lần trả và hoàn cọc được mô phỏng.
- Kiểm tra production chỉ đọc: tài khoản Hà Đông tra được hợp đồng hoàn tất, giờ trả và ảnh; phiếu hoàn cọc vẫn được duyệt; số 005734 khả dụng. Báo cáo trong `.backups/return-followup-20261021.json` (Git ignored).
- Typecheck, lint và production build đạt. Ba cảnh báo lint cũ ở `ManagementPage.tsx` và `StaffOrganizationChart.tsx`; ba component sửa trong đợt này không có cảnh báo.

## Thao tác

Mở `/contracts?contract_id=57586` tại cơ sở Hà Đông, chọn tab **Tất cả**, sau đó **⋯ → Xem chi tiết → Bổ sung ảnh trả xe → Lưu ảnh / video**.
