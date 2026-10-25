# Xử lý video trên thiết bị và lưu CloudFly

Mediabunny 1.62.1 chạy trong Web Worker, chỉ được tải khi chọn video. Ảnh giữ luồng hiện có. Không cần VPS hay migration database.

## Luồng

1. Video H.264/AAC có cạnh dài không quá 1920 px được đóng gói lại thành MP4 fast-start, giữ hướng quay và âm thanh, không mã hóa lại. Trường hợp cần chuyển mã dùng H.264/AAC, cạnh dài tối đa 1280 px, 30 fps. Chỉ xử lý một video mỗi lần.
2. Web Worker không hỗ trợ codec, lỗi, mất track âm thanh/video hoặc chưa xong sau 45 giây sẽ được dừng; tệp gốc chuyển qua Cloudinary dự phòng. Không cắt ngắn video để vượt kiểm tra thời lượng. Giới hạn đầu vào/đầu ra vẫn là 45 MB; hợp đồng 60 giây, PGD/KTNB 180 giây.
3. Bản MP4 xử lý được tải trực tiếp từ trình duyệt vào bucket Private bằng PUT có chữ ký, hạn 15 phút, khóa cố định theo người tải + UUID. Content-Length, SHA-256 metadata, ACL Private và If-None-Match được ký. Không truyền byte video qua request Vercel.
4. Server tải lại object có điều kiện ETag, kiểm tra SHA-256, container MP4, H.264, âm thanh AAC nếu có, thời lượng và kích thước. Chỉ sau đó mới ghi xác nhận HMAC vào metadata và cấp biên nhận. Metadata do client tự khai không đủ để báo đã xác minh.
5. Khi lưu vào hợp đồng/báo cáo, API xác minh biên nhận đúng người tải, quyền/phạm vi hồ sơ và giới hạn của hồ sơ. DB giữ bucket/key/ETag như trước. Video vượt một phút không thể lấy biên nhận kiểm kê để gắn vào hợp đồng.
6. Tệp gốc vẫn giữ trong form đến khi xác nhận đã gắn vào hồ sơ. Thử lại dùng lại kết quả xử lý và object đã xác minh. Lỗi mạng/kho lưu không tự báo thành công hoặc âm thầm đổi nơi lưu.

Cloudinary vẫn là bộ chuyển mã dự phòng và nơi lưu ảnh/video lịch sử. Không xóa hay di chuyển hàng loạt hồ sơ cũ. Cấu hình fallback đã sửa: `allowed_formats=mp4`; nếu liệt kê MOV/WebM tại đây thì Cloudinary giữ định dạng đó dù yêu cầu `format=mp4`.

## CORS và vận hành

```powershell
node scripts/configure-browser-video-cors.cjs
node scripts/configure-browser-video-cors.cjs --apply
```

Chỉ thêm rule PUT cho `https://himoto.vercel.app`, giữ nguyên các rule portal khác; bản trước thay đổi nằm trong `.backups/browser-video-20261025/cors-before-*.json`. CORS không cấp quyền đọc/ghi object; vẫn cần chữ ký. Preview/local không có trong rule production.

`VIDEO_STORAGE_PROVIDER=cloudfly` sử dụng luồng mới mặc định. Đặt biến server `BROWSER_VIDEO_PROCESSING=off` và deploy lại để quay về chuyển mã Cloudinary. Video đã lưu trực tiếp tiếp tục đọc được. Không đổi khóa phiên chỉ để rollback: khóa này xác minh biên nhận tạm chưa lưu.

Tệp tải nhưng bỏ form có thể còn trong kho như luồng upload cũ. Không đặt lifecycle xóa toàn bộ `himoto/videos/`: đây cũng là nơi giữ video chính thức. Việc dọn object không có tham chiếu cần đối chiếu DB riêng.

## Kiểm tra

```powershell
node scripts/create-browser-video-fixtures.cjs --ffmpeg <duong-dan-ffmpeg>
node scripts/check-browser-videos.cjs --synthetic-file .backups/browser-video-20261025/fixtures/silent.mp4
python scripts/check-browser-videos-ui.py --session-cookie-file .backups/browser-video-20261025/session.private.txt --browser chromium
python scripts/check-browser-videos-ui.py --session-cookie-file .backups/browser-video-20261025/session.private.txt --browser webkit
node scripts/check-browser-video-live.cjs --synthetic-file .backups/browser-video-20261025/ui/chromium/avc-mov.mp4 --browser
node scripts/check-browser-video-production.cjs --synthetic-file .backups/browser-video-20261025/ui/chromium/avc-mov.mp4
```

Fixtures phải là clip tổng hợp, không dùng ảnh/video khách. Kiểm tra UI chặn toàn bộ request ghi nghiệp vụ, upload ngoài và Telegram. Kiểm tra CloudFly thật chỉ dùng object UUID của lượt chạy, xóa trong finally; không gắn vào hồ sơ. WebKit trên Windows kiểm chứng engine, không thay cho một lần dùng trên iPhone vật lý. Kết quả clip tổng hợp ngắn không phải cam kết thời gian cho mọi máy/mạng.

Mã nguồn Mediabunny không sửa đổi, giấy phép MPL-2.0 được giữ tại `/licenses/mediabunny.txt`; nguồn phiên bản: https://github.com/Vanilagy/mediabunny/tree/v1.62.1.
