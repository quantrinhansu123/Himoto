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
- `check-mobile-photo-batches.cjs`: 8 nhóm; album 25 ảnh, mất phản hồi, ghi tiến độ, đổi tài khoản, lỗi một nguồn, QR và cô lập bộ ảnh theo hồ sơ/lượt/cơ sở. PGD/KTNB kiểm tra mọi mục minh chứng đang giữ trước khi chốt, gồm cả picker đã đóng; không để chốt rồi khóa mất phần ảnh chưa gửi.
- `check-transfer-photo-album.cjs`: chuyển 25/25, nhận 25/25.
- `check-mobile-bills.cjs`: 5 nhóm, gồm ảnh bổ sung 2/10/25 và kiểm tra đúng kỳ/ô ảnh.
- PGlite: `check-mobile-battery.cjs` 7 nhóm; `check-battery-telegram-workflow.cjs` 6 nhóm; `check-mobile-shift-reports.cjs` 6 nhóm; `check-report-telegram-media.cjs` 3 nhóm.
- `check-refund-qr.cjs` và `check-photo-ocr.cjs`: mỗi bộ 5 nhóm.
- UI `check-mobile-photo-batches-ui.py`: 3 nhóm. Picker nhiều ảnh, giữ 25 ảnh sau tải lại/đăng nhập lại, mất phản hồi sau commit ảnh thứ 10, 25 ảnh/26 lần gọi và không trùng UUID; trả pin chọn 25 ảnh và chỉ mở nút Telegram sau khi lưu đủ bộ. Thực hiện hoàn toàn với API giả lập.

Không gửi tin thử vào nhóm vận hành hoặc tạo giao dịch/ảnh giả trên hồ sơ khách thật để kiểm thử. Kiểm thử nhà cung cấp sử dụng transport giả lập; kết quả đó không phải bằng chứng gửi Telegram thật.

## Schema và phát hành

Migration `docs/sql/2026-11-13-battery-media-report-attachments.sql` chỉ thêm kho ảnh pin và ba cột tiến độ Telegram báo cáo ca. Đã áp dụng trên database cấu hình hiện có: RLS bật, policy tồn tại, đủ ba cột; không cập nhật dòng nghiệp vụ.

APK chuẩn bị: `vn.himoto.staff`, 1.0.11 / code 12, runtime 1.0.11, channel production. Phải cài APK mới để có native HimotoVideo; không đẩy toàn bộ mã này vào runtime 1.0.9. Bằng chứng deploy, APK, Samsung và OTA được ghi sau khi từng bước hoàn tất.

Artifact kiểm chứng cục bộ: `.backups/mobile-media-full-20261113/`; bản build ký: `.backups/mobile-media-1.0.11-20261113-release/`.

## Kiểm tra trên Samsung và lỗi native tìm thêm

- Cài đè 1.0.11/code12 bằng khóa ký cũ, UID 10216 và phiên đăng nhập được giữ.
- Picker Android chọn đủ 25 ảnh từ album QA riêng trong một lần; kho SQLCipher mở được, xem ảnh được. Force-stop rồi mở lại vẫn giữ đủ 25/25. Đã bỏ toàn bộ ảnh QA chưa gửi bằng giao diện, không tạo xe hoặc gắn ảnh giả vào hồ sơ vận hành.
- Khi thử video tổng hợp 3 giây trên Samsung Android 9, bản thử đầu bị crash `NoClassDefFoundError: android.media.metrics.LogSessionId` trong Media3 Transformer sau R8. Đây là lỗi native thực tế, không được xem là nghiệm thu đạt. Bản đầu không được phát hành OTA hoặc đưa lên link APK bàn giao.
- Sửa bằng consumer rules giới hạn ở ba lớp factory/listener Media3 qua ranh giới API31; thêm xử lý LinkageError để báo lỗi thay vì thoát app. Theo [issue Media3 #2535](https://github.com/androidx/media/issues/2535), R8 gộp lớp có thể làm tham chiếu LogSessionId bị resolve trên Android trước 12. Kết quả chạy lại video được ghi sau khi bản sửa qua thiết bị.
- Bộ kiểm APK đọc mapping R8 của đúng build để kiểm tra constructor module đã đổi tên, đồng thời xác nhận ba lớp bảo vệ API vẫn còn trong DEX. Không chỉ tìm chuỗi tên module rồi kết luận hoạt động.
- Bản sửa R8 trên Samsung xử lý lại đúng video tổng hợp 3 giây đã gây crash thành MP4 0,8 MB, phát được trong app. Không lưu hoặc gắn video QA vào hợp đồng thật. Các nút lưu/gửi album đặt trước danh sách ảnh để bộ nhiều ảnh không phải cuộn xuống cuối mới lưu được.

Production commit `ee53664`: Vercel `dpl_5f1MovmzFUCwLzqkPHib1rsxVXrA`, trạng thái thành công. Smoke công khai 23 kiểm tra và 5 kiểm tra API mới/quyền đọc qua production đều đạt. Không tải ảnh thử lên hoặc tạo/gửi tin Telegram vận hành.
