# Album ảnh và Telegram web/app — 13/11/2026

## Phạm vi

- Gallery cho phép chọn nhiều ảnh ở hợp đồng, biển số, giấy tờ khách/xe, giao/trả/đổi xe, chuyển/nhận xe, bill gia hạn và minh chứng ca. Camera chụp thêm từng ảnh vào bộ đang soạn.
- Bộ ảnh dùng chung giữ JPEG và tiến độ trong SQLite mã hóa trên Android; Expo Web dùng IndexedDB. Chuẩn bị từng ảnh để tránh giữ cả bộ ảnh giải mã trong RAM; lỗi một nguồn được báo riêng, giữ các nguồn đã chuẩn bị.
- Mỗi ảnh có UUID và kế hoạch ghi bất biến. Thử lại bỏ qua ảnh đã xác nhận; mất phản hồi giữ mã gốc để đối chiếu. Không chạy lại nghiệp vụ tiền/kho khi lưu hoặc gửi lại ảnh.
- Ảnh xe mới và thao tác pin được chọn trước nghiệp vụ, gắn bằng mã yêu cầu gốc vào đúng ID sau khi có xác nhận. Thuê, gia hạn, thu nợ gia hạn và trả pin có bộ ảnh/lượt và nút Telegram riêng.
- Telegram pin lấy đầy đủ ảnh đúng sự kiện; ảnh bổ sung sau tin đã gửi chỉ tạo lượt bổ sung. Sửa regex gom ảnh chuyển/nhận xe bỏ sót ảnh số 10–19.
- Báo cáo ca gửi ảnh/video theo phần PGD hoặc KTNB vào nhóm đã cấu hình. Lưu tiến độ từng album; chỉ thử tiếp phần bị từ chối rõ ràng. Mất phản hồi đánh dấu chưa rõ kết quả và không tự gửi lại.
- QR hoàn cọc đọc ngân hàng/tài khoản với cùng parser web, có OCR tên người nhận, giữ chỉnh sửa tay đang diễn ra. Nhân viên kiểm tra người nhận trước khi quyết toán; đọc ảnh không ghi tiền.
- Giữ các quyền thao tác, phiên bản hồ sơ và cơ sở hiện có. Bill thu nợ dùng quyền tài chính; bổ sung ảnh không tự mở rộng quyền quản trị.

## Kiểm chứng nguồn và dữ liệu giả lập

- Typecheck root/mobile và lint các file server/web, toàn bộ mobile: đạt.
- `npm run test:mobile`: 39 bộ kiểm tra đạt.
- `check-mobile-photo-batches.cjs`: 7 nhóm; album 25 ảnh, mất phản hồi, ghi tiến độ, đổi tài khoản, lỗi một nguồn, QR và cô lập bộ ảnh theo hồ sơ/lượt/cơ sở.
- `check-transfer-photo-album.cjs`: chuyển 25/25, nhận 25/25.
- `check-mobile-bills.cjs`: 5 nhóm, gồm ảnh bổ sung 2/10/25 và kiểm tra đúng kỳ/ô ảnh.
- PGlite: `check-mobile-battery.cjs` 7 nhóm; `check-battery-telegram-workflow.cjs` 6 nhóm; `check-mobile-shift-reports.cjs` 6 nhóm; `check-report-telegram-media.cjs` 3 nhóm.
- `check-refund-qr.cjs` và `check-photo-ocr.cjs`: mỗi bộ 5 nhóm.
- UI `check-mobile-photo-batches-ui.py`: picker nhiều ảnh, giữ 25 ảnh sau tải lại/đăng nhập lại, mất phản hồi sau commit ảnh thứ 10, 25 ảnh/26 lần gọi và không trùng UUID. Thực hiện hoàn toàn với API giả lập.

Không gửi tin thử vào nhóm vận hành hoặc tạo giao dịch/ảnh giả trên hồ sơ khách thật để kiểm thử. Kiểm thử nhà cung cấp sử dụng transport giả lập; kết quả đó không phải bằng chứng gửi Telegram thật.

## Schema và phát hành

Migration `docs/sql/2026-11-13-battery-media-report-attachments.sql` chỉ thêm kho ảnh pin và ba cột tiến độ Telegram báo cáo ca. Đã áp dụng trên database cấu hình hiện có: RLS bật, policy tồn tại, đủ ba cột; không cập nhật dòng nghiệp vụ.

APK chuẩn bị: `vn.himoto.staff`, 1.0.11 / code 12, runtime 1.0.11, channel production. Phải cài APK mới để có native HimotoVideo; không đẩy toàn bộ mã này vào runtime 1.0.9. Bằng chứng deploy, APK, Samsung và OTA được ghi sau khi từng bước hoàn tất.

Artifact kiểm chứng cục bộ: `.backups/mobile-media-full-20261113/`; bản build ký: `.backups/mobile-media-1.0.11-20261113-release/`.
