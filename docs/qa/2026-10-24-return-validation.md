# Lý do chặn xác nhận trả xe / hoàn cọc — 24/10/2026

## Nguyên nhân

Trường hợp 2 xe, cọc còn giữ 2.000.000đ nhưng nhập số tiền hoàn cọc 2.400.000đ: kiểm tra giới hạn khóa nút đúng, nhưng trước đây chỉ hiện “Đang tải / cần chọn hoàn cọc trước khi xác nhận” và thông báo chung chọn tài khoản/số tiền. Không chỉ rõ đang vượt cọc 400.000đ; dễ nhầm thành lỗi không cho trả xe dù đã chọn hoàn cọc.

## Sửa

- Báo số cọc tối đa và phần vượt ngay dưới ô tiền, đánh dấu ô lỗi bằng `aria-invalid`/`aria-describedby`.
- Footer cạnh nút xác nhận dùng đúng lý do chặn: số tiền vượt/không hợp lệ, thiếu tài khoản chi, số tài khoản khách không hợp lệ, đang xử lý QR hoặc lỗi tải khoản thu/hoàn.
- Sửa lại giá trị hợp lệ thì bỏ lỗi và mở nút. Chưa hoàn cọc vẫn có thể trả xe, giữ cọc và không tạo phiếu chi.
- Tài khoản chi chưa chọn/không còn phù hợp có placeholder rõ; tránh trình duyệt hiển thị lựa chọn đầu tiên khi giá trị thực chưa khớp.
- Không nới giới hạn hoàn cọc, không đổi cách tính tiền, không sửa cọc/phiếu của hợp đồng thật. Khoản hoàn tiền thuê là nghiệp vụ riêng; không gộp vượt tiền cọc trong ô hoàn cọc.

## Kiểm tra

- `npm.cmd run build`: đạt, bao gồm TypeScript. `npm.cmd run lint`: đạt. Next.js còn cảnh báo cấu hình ESLint chưa nhận plugin Next.js như trước.
- `node scripts/check-return-refunds.cjs`: 17 nhóm đạt, bảng TEMP/rollback, không ghi nghiệp vụ thật, không dùng sequence thật, không gửi Telegram.
- `node scripts/check-refund-qr.cjs`: 5 nhóm đạt.
- `scripts/check-return-validation-ui.py`: 8 nhóm đạt trên Chromium 1440 px và WebKit 390 px. Tái hiện 2,4 triệu/cọc 2 triệu bị chặn với đúng lý do; sửa số tiền, STK sai rồi xóa/sửa lại, thiếu tài khoản chi, lỗi tải và retry. Khi xác nhận hợp lệ, gửi đúng 2 xe và một khoản hoàn 2 triệu. Mọi API ghi đều giả lập.
- `scripts/check-return-compact-ui.py`: 13 nhóm Chromium đạt, giữ nguyên form gọn, ảnh/QR, phí 0đ, không tự xác nhận khi nhập liệu, hậu kiểm xe đã trả.
- `scripts/check-refund-qr-ui.py`: 14 tình huống đạt trên Chromium/WebKit, gồm QR/ảnh chữ, AI lỗi, sửa thông tin trong lúc đọc, lỗi tải ảnh, đọc lại QR và chưa hoàn cọc. Cập nhật fixture để kiểm tra nút bị disable khi QR đang xử lý thay vì cố click nút disabled. QR tùy chọn, lỗi tải ảnh không tự tạo lượt trả hoặc bắt buộc phải có QR mới hoàn được cọc. JavaScript lỗi 0, không gửi Telegram/ghi nghiệp vụ thật.

Bằng chứng và ảnh giả lập: `.backups/return-validation-20261024/` (ignore). Không lưu dữ liệu khách thật vào tài liệu QA.
