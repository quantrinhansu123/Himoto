# Video CloudFly cho Himoto

Video mới của hợp đồng và minh chứng PGD/KTNB có thể lưu bản chính thức vào bucket Private trên CloudFly. Ảnh giữ nguyên luồng Cloudinary hoặc bytea đang có. Video cũ trên Cloudinary tiếp tục xem và gửi Telegram được, không tự chuyển hoặc xóa dữ liệu lịch sử.

## Luồng lưu

1. Trình duyệt xin chữ ký và upload trực tiếp lên Cloudinary như trước. Cloudinary chuyển MOV/HEVC/WebM sang MP4/H.264/AAC, giới hạn cạnh 1280 px. Bước này vẫn sử dụng quota xử lý của Cloudinary.
2. Khi lưu tệp vào hồ sơ, server xác minh chữ ký và người upload, kiểm tra quyền/phạm vi hồ sơ, định dạng, dung lượng và thời lượng. Tối đa 45 MB; hợp đồng 60 giây, PGD/KTNB 180 giây.
3. Server tải bản MP4 đã chuyển, kiểm tra đủ số byte và chữ ký container, gửi trực tiếp sang CloudFly với ACL Private, Content-MD5 và SHA-256 metadata. HEAD xác minh lại trước khi ghi liên kết vào DB.
4. DB chỉ ghi bucket/key/ETag. Key chứa cloud nguồn, người upload, UUID và phiên bản để thao tác thử lại tái sử dụng đúng tệp, kể cả sau khi bản chuyển tạm đã được xóa.
5. Sau COMMIT và trả kết nối DB, server mới dọn bản chuyển tạm Cloudinary. Trước khi xóa, kiểm tra không còn hồ sơ hay payload thông báo Telegram nào tham chiếu tới nguồn. Dọn thất bại chỉ ghi log chung, không biến lần lưu đã thành công thành lỗi. Tệp upload nhưng bỏ form và các lần dọn thất bại cần chính sách dọn riêng; không tự xóa hàng loạt.

Luồng này không cần worker/VPS hoặc chuyển database. Cloudinary vẫn là dịch vụ chuyển định dạng, CloudFly là kho lưu và phục vụ bản MP4 chính thức. Muốn bỏ hẳn xử lý video ở Cloudinary cần bổ sung bộ chuyển định dạng riêng.

## Xem và Telegram

API quản lý vẫn xác thực phiên và kiểm tra RLS trước khi cấp URL GET có chữ ký, hiệu lực 5 phút. Trình duyệt phát/tua trực tiếp từ CloudFly, tránh chuyển byte video qua Vercel. Không lưu URL có chữ ký vào DB. Bucket không public.

Telegram đọc object bằng credential phía server, giữ nguyên cách chia lô/giới hạn và gửi hiện tại. Kiểm thử chỉ mô phỏng Telegram. Không tự gửi tin hay bật thông báo mới.

Không cần CORS PUT cho ứng dụng vì trình duyệt vẫn upload vào Cloudinary; server sao chép sang S3. Phát video dùng thẻ video mặc định, không đặt crossorigin. Giữ nguyên CORS của portal CloudFly hiện có.

## Cấu hình và bật production

Các biến chỉ ở server, không dùng NEXT_PUBLIC và không commit giá trị thật:

```dotenv
VIDEO_STORAGE_PROVIDER=cloudfly
CLOUDFLY_S3_ENDPOINT=https://s3.cloudfly.vn
CLOUDFLY_S3_REGION=hn
CLOUDFLY_S3_BUCKET=himoto-videos
CLOUDFLY_S3_ACCESS_KEY_ID=
CLOUDFLY_S3_SECRET_ACCESS_KEY=
```

Giữ CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET hiện tại để xử lý video và ảnh. Đặt các biến CloudFly trên môi trường Production của Vercel trước khi deploy bản code mới. Không ghi token/secret vào CLI arguments, log hoặc Git.

Áp dụng migration sau các migration ảnh/KTNB cũ, trước khi deploy code:

```powershell
node scripts/migrate-cloudfly-videos.cjs --apply
```

Migration thêm ba cột vào mỗi bảng management_record_photos và management_shift_media, thay các CHECK nơi lưu để hỗ trợ ba loại DB/Cloudinary/Object Storage. Không sửa hàng nghiệp vụ, sequence, RLS, vai trò tài khoản hay cron.

Mặc định VIDEO_STORAGE_PROVIDER=cloudinary khi biến chưa được đặt. Khi đã chọn cloudfly mà S3 lỗi/thiếu credential, thao tác lưu báo lỗi và giữ tệp cho thử lại, không âm thầm báo đã lưu. Rollback bằng VIDEO_STORAGE_PROVIDER=cloudinary và deploy lại cùng code; các object đã lưu vẫn được đọc qua nhánh CloudFly. Giữ migration và credential CloudFly cho phần dữ liệu này.

## Kiểm tra

```powershell
node scripts/check-cloudfly-videos.cjs --live-temp
node scripts/check-shift-report-retries.cjs
node scripts/check-record-photo-save.cjs
npm.cmd run build
```

check-cloudfly-videos dùng S3/Cloudinary mô phỏng; --live-temp chỉ tạo bảng TEMP và rollback, không ghi dữ liệu nghiệp vụ hay thay sequence thật. Kiểm tra shift bao gồm RLS, khóa PGD/KTNB, phiên bản và replay tệp CloudFly.

Để kiểm tra nhà cung cấp thật, tạo một clip tổng hợp, không dùng video khách:

```powershell
node scripts/check-cloudfly-video-live.cjs --synthetic-file .backups/<test-folder>/synthetic-qa.mp4 --browser
```

Script chỉ nhận clip tên synthetic-qa.mp4 dưới 1 MB. Nó chuyển định dạng, kiểm tra object Private, GET ký số, byte range, chặn anonymous, retry sau khi xóa nguồn và phát/tua trên Chromium/WebKit ở viewport máy tính/điện thoại. Các file cloud được tạo trong lượt thử được xóa trong finally. URL có chữ ký đi vào browser qua stdin và không được in ra log. Không gọi Telegram hay ghi DB.

Theo dõi dung lượng lưu trữ và băng thông download riêng. Chưa có cơ sở kết luận chi phí thực tế hoặc tốc độ giữa Vercel và CloudFly từ một clip thử nhỏ.

## Xác minh cấu hình trên Vercel

Phản hồi ký upload video có trường video_storage_provider. Upload thông thường không gọi thêm S3. Quản trị viên có quyền settings.write có thể gửi verify_storage=true cùng yêu cầu ký upload video: server Vercel ghi một tệp nhỏ tại key UUID riêng trong himoto/storage-checks/, kiểm tra đọc byte range và chặn anonymous, sau đó xóa trong finally. Không nhận bucket/key do trình duyệt chỉ định và không gắn tệp vào hồ sơ.

```powershell
node scripts/check-video-storage-probe.cjs
node scripts/verify-production-video-storage.cjs
```

Script xác minh production chỉ SELECT tài khoản admin đã có quyền. Phiên ký được giữ trong bộ nhớ, hết hạn sau năm phút; không in cookie, khóa hoặc chữ ký upload. Chỉ kết luận bật thành công khi runtime Production báo cloudfly và toàn bộ phép kiểm tra đọc/ghi/riêng tư/dọn tệp đều đạt. Nếu session secret local khác production, xác minh bị từ chối và không thay đổi tài khoản.
