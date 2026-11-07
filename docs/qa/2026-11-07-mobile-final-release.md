# Android 1.0.3 — phát hành cuối 07/11/2026

Yêu cầu: đóng gói toàn bộ phần offline/payload/refresh/biometric đang local,
Gemini căn cước đã lên main, và các chức năng mới của web trong app.

## Phần cần khép kín trước bản cài

- Chấm công vào/ra ca, ảnh hiện tại, GPS, giờ máy chủ, lịch sử/đi muộn/phạm vi HR.
- Bảy mã ca dùng chung web/app; ca nghỉ không được tạo thành lịch làm việc.
- Hướng dẫn theo nghiệp vụ và FAQ: lọc, hỏi, trả lời theo quyền, ảnh minh họa.
- Migration refresh token trên DB hiện có, backend tương thích và triển khai Vercel.
- Kiểm thử hiện hành, export native, ký bằng khóa Android cũ và kiểm tra bundle.
- Kiểm tra trên Samsung nếu có thể, giữ dữ liệu và chữ ký khi nâng cấp.

## Trạng thái lúc bắt đầu

- main/HEAD: d77c382; source offline/payload/refresh/biometric chưa commit/deploy.
- Expo SDK 58; bản cấu hình 1.0.3/code 4; Samsung SM-N960N đang kết nối.
- Chưa xác nhận APK mới hoặc tính năng sinh trắc học trên binary mới.
- Không có đăng nhập EAS trên máy; repo có quy trình build/ký Android local và
  keystore đã dùng cho các bản cài trước. Không tạo khóa ký khác.

Kết quả kiểm tra và artifact sẽ được cập nhật sau khi thực hiện.

## Tiến độ source và kiểm tra

- Đã thêm route/screen native Chấm công và Hướng dẫn/FAQ, liên kết từ Tài khoản
  và khu vận hành. Đã tách handler web để web/mobile dùng đúng cùng writer,
  timestamp máy chủ, scope HR và logic FAQ/revision/ảnh hiện có.
- Chấm công giữ UUID, ảnh trên app-private storage và descriptor trong
  SecureStore; mở lại/đổi mạng đối chiếu UUID trước gửi; không tự gửi nền.
  GPS quá cũ được lấy lại khi người dùng chủ động thử lại cùng mã.
- FAQ mobile phân trang SQL 20 dòng, lọc/tìm, hỏi và trả lời có ảnh theo quyền.
- Hướng dẫn và 7 mã ca chuyển sang shared, cả hai UI dùng một nguồn.
- Đã đạt typecheck web/mobile, lint web/mobile, 35 suite mobile hiện hành,
  offline/worker/token/biometric fixtures, refresh PostgreSQL cô lập,
  payload 500 xe, 3 nhóm domain support PostgreSQL cô lập.
- Browser support: 3 nhóm, ảnh/GPS synthetic, mất phản hồi/đối chiếu một lần,
  hỏi/đáp, 4 kích thước sáng/tối, 0 pageerror/host lạ/ghi vận hành.
- Browser Gemini/documents: 8 nhóm đạt. Bằng chứng ở
  `.backups/mobile-final-20261107-ui-support/` và `...-ui-documents/`.
- DB production preflight: session/attendance/FAQ đã có; hai bảng refresh
  chưa có. Chưa áp migration hoặc deploy source của lượt này tại mốc này.

## Việc tiếp theo

1. Chốt source, kiểm lại các file cuối và export web/native mới nhất.
2. Áp migration refresh additive đã kiểm cô lập; build/deploy backend lên main
   để APK dùng đúng API, giữ nguyên dữ liệu nghiệp vụ web.
3. Build ký với script hiện có và Firebase
   `.backups/mobile-offline-20261106-run1/google-services.json`.
4. Kiểm chứng SQLCipher/biometric/location/background trong APK thật, chữ ký,
   version/source manifest, nâng cấp Samsung và smoke đọc/mở-hủy chức năng.
5. Ghi artifact cuối và các giới hạn nghiệm thu; không gọi fixture là nghiệm thu
   toàn bộ nghiệp vụ trên production hoặc sinh trắc học thật.

## Backend và vòng build đầu

- Đã áp migration refresh additive trên production; giữ nguyên dữ liệu nghiệp vụ.
- Đã push b01235e, 297cb80 và 9125846 lên main; Vercel production thành công.
  Bản 9125846 giữ thiết bị push hoạt động khi access token hết hạn nhưng refresh
  session còn hợp lệ. Bảy nhóm notification fixture đạt, không gửi FCM thật.
- Finance SQL đạt 124 trường hợp; web/mobile typecheck, mobile lint đạt.
- Build ký vòng đầu 1.0.3/code 4, cùng certificate với 1.0.2; nâng cấp Samsung
  bằng install -r, không uninstall/clear. Source 475 file giữ nguyên khi build.
- **Không bàn giao APK vòng đầu**: máy Samsung Android 9 bị lỗi WorkManager
  ngay khi khởi động. Logcat và R8 usage xác nhận constructor không tham số của
  `androidx.work.impl.WorkDatabase_Impl` bị loại bỏ.
- Thêm rule qua expo-build-properties SDK 58 để giữ chính constructor này.
  Kiểm tra APK nay đọc class_data/method definition của DEX, không chỉ tìm tên
  module. Kiểm tra mới đã phát hiện đúng APK lỗi vòng đầu.
- Theo yêu cầu tạo tài khoản test, đã tạo QA giới hạn cơ sở, không cấp quyền
  tiền/quản trị, không gắn nhân viên thật. Mật khẩu giữ DPAPI ngoài Git;
  không đưa vào log/artifact. Chỉ kiểm tra đăng nhập và đổi mật khẩu tài khoản QA.
