# Chuẩn bị video Android — 13/11/2026

## Phạm vi bàn giao

Chỉ triển khai mã nguồn và kiểm tra. Theo yêu cầu người dùng, chưa đóng gói APK,
chưa cài lên điện thoại, chưa phát hành OTA. APK 1.0.9 và OTA production hiện có
không được thay thế trong lượt này.

## Thay đổi

- Module Expo cục bộ `mobile/modules/himoto-video` dùng Media3 Transformer 1.9.1,
  cùng phiên bản Media3 với `expo-video` của SDK 58. Không thêm thư viện React
  Native hoặc sửa trực tiếp thư mục Android được sinh tự động.
- Android chuẩn bị cả video quay mới và video chọn từ thư viện: MP4/H.264,
  cạnh dài tối đa 1280 và cạnh ngắn tối đa 720, giữ tỷ lệ và hướng quay,
  không tăng kích thước video nhỏ. Mục tiêu video 1.200.000 bit/s, khoảng
  30 fps; AAC nếu cần chuyển mã âm thanh. Đây là cấu hình yêu cầu, không phải
  kết quả đo dung lượng/thời gian trên điện thoại.
- Đọc lại metadata và kiểm tra codec, kích thước, dung lượng, thời lượng sau
  xử lý. Không nhận kết quả thiếu phần lớn thời lượng. Video hợp đồng tối đa
  60 giây/18 MiB sau nén; video ca tối đa 180 giây/45 MiB. Video nguồn được
  kiểm tra trước, tối đa 512 MiB; giới hạn upload backend giữ nguyên.
- Encoder và đọc metadata chạy trên một Looper nền. Một lượt xử lý tại một
  thời điểm; tiến trình theo UUID, timeout 4 phút cho hợp đồng/8 phút cho ca.
  Hai màn hình có tiến trình và nút hủy; video đã chọn trước vẫn được giữ nếu
  chọn video mới bị hủy hoặc thất bại.
- Mỗi lượt dùng đúng một thư mục cache riêng. Native chỉ ghi `encoded.mp4`
  trong thư mục có UUID hợp lệ dưới cache Himoto; không sửa/xóa video nguồn.
  Hủy/lỗi giải phóng encoder trước khi xóa đầu ra; JS đợi native kết thúc rồi
  dọn thư mục. Các metadata retriever luôn được release.
- Chỉ dùng tùy chọn ImagePicker của iOS trên iOS. Web giữ luồng chọn file cũ.
  Thiếu module native nhận thông báo cần cập nhật bản cài, không làm ứng dụng
  lỗi ngay khi mở màn hình khác.
- Chuẩn bị app version/runtime `1.0.10`, Android versionCode `11`, để mã mới
  không bị phát hành nhầm cho runtime `1.0.9` thiếu module. Đây chưa phải bản
  cài hoặc bản cập nhật đã phát hành.
- Đồng bộ test ảnh với 1600 px và các mức JPEG 0.78/0.65/0.52; kiểm tra vượt
  giới hạn ở cả hai chiều. Đồng bộ test mặc định bộ lọc hợp đồng với hành vi
  nháp đã được triển khai từ commit `bf70fc1`, giữ kiểm tra tham số sai và `all`.

## Kiểm chứng

Kết quả cuối: typecheck, lint, 36 suite mobile, hai suite performance/export và
suite direct upload đều qua; module Kotlin biên dịch thành công. Typecheck
lượt cuối chạy riêng với `NODE_OPTIONS=--max-old-space-size=2048` sau một lượt
bị thiếu RAM khi chạy đồng thời nhiều kiểm tra trên máy 8 GiB.

- `npm run mobile:typecheck` và `npm run mobile:lint`.
- `npm run test:mobile`: gồm test chuẩn bị ảnh và suite chuẩn bị video mới.
- `npm run test:mobile:performance`: cache và export transport bằng fixture.
- `node scripts/check-mobile-direct-video.cjs`: đường upload và cách ly bearer.
- Expo autolinking nhận đúng `vn.himoto.video.HimotoVideoModule`.
- `gradlew.bat :himoto-video:compileDebugKotlin`: biên dịch module thành công,
  không chạy tác vụ assemble/bundle APK/AAB. Log riêng tư tại
  `.backups/mobile-video-20261113/`.
- Suite video mô phỏng biên native/file system, kiểm tra nguồn lớn, output
  không hợp lệ, giới hạn hợp đồng/ca, hướng dọc, hủy trước/trong lúc xử lý,
  lỗi codec/timeout, thiếu native, hết bộ nhớ và giữ file gốc. Không gọi mạng
  ngoài hoặc ghi dữ liệu vận hành.

## Nghiệm thu còn lại sau khi được phép đóng gói

Chưa đo chất lượng hình/video, độ rõ chứng từ, dung lượng thực, tốc độ nén,
FPS, upload hoặc Telegram trên thiết bị. Không cam kết nhanh hơn web 3–5 lần
hay Telegram hoàn tất trong 2–3 giây.

Khi đóng gói sau này: giữ khóa ký Himoto cũ; kiểm tra DEX/autolinking, runtime
1.0.10 và cài đè giữ dữ liệu. Trên thiết bị kiểm tra quay/chọn video ngang/dọc,
video có âm thanh/không âm thanh, HEVC/HDR, video 60/180 giây, nén/hủy/lỗi codec,
quay lại màn hình khi đang xử lý và chất lượng chi tiết trước khi bàn giao.
