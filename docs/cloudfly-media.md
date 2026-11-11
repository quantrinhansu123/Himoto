# Kho ảnh/video CloudFly

Ảnh mới lưu trong bucket Private của CloudFly. Video giữ luồng CloudFly hiện có. Ứng dụng kiểm tra phiên và phạm vi hồ sơ trước khi cho đọc tệp. Web nhận URL có chữ ký ngắn hạn; mobile nhận byte ảnh qua API Himoto, không gửi bearer token tới storage.

## Cấu hình và triển khai

Giữ `CLOUDFLY_S3_*` phía server đang dùng cho video. `PHOTO_STORAGE_PROVIDER=cloudfly` chọn kho ảnh; nếu chưa khai báo thì ảnh dùng cùng provider với `VIDEO_STORAGE_PROVIDER`. Giữ khóa Cloudinary trong thời gian chuyển lịch sử và cho nhánh chuyển định dạng video dự phòng. CloudFly Object Storage tự lưu tệp, không tự chuyển mã HEVC/MOV sang H.264; nhánh dự phòng này vẫn cần Cloudinary khi trình duyệt không xử lý được video.

Thứ tự triển khai:

1. Chạy từng câu trong `docs/sql/2026-11-11-contract-vehicle-read-indexes.sql` và `docs/sql/2026-11-11-contract-statistics-indexes.sql` ngoài transaction. Kiểm tra `indisvalid` của cả bảy index.
   Áp dụng `docs/sql/2026-11-11-access-order-store-inline.sql` trong transaction: hai helper invoker dùng SQL body được bind từ lúc định nghĩa; wrapper được phép inline. Helper ownership có quyền cao vẫn giữ `search_path` riêng. Giữ nguyên owner, ACL và kết quả phạm vi; đối chiếu trước/sau trước khi commit.
2. `node scripts/migrate-cloudfly-media.cjs --schema` bổ sung cột/check lưu ảnh và bảng ánh xạ. Không đổi RLS hồ sơ hay dữ liệu nghiệp vụ.
3. Chạy kiểm tra, build rồi deploy web/backend từ cùng commit.
4. `node scripts/migrate-cloudfly-media.cjs` thống kê; `node scripts/migrate-cloudfly-media.cjs --apply --limit 25 --concurrency 2` kiểm tra đợt nhỏ.
5. `node scripts/migrate-cloudfly-media.cjs --apply --concurrency 16` chuyển lịch sử. Có thể chạy lại: các bản sao đã có ánh xạ xác minh được bỏ qua. Chỉ chạy một tiến trình chuyển cùng lúc.
6. Thống kê lại sau đợt chuyển để bắt các tham chiếu phát sinh đồng thời. Chỉ báo hoàn tất khi số còn lại và số lỗi đều bằng 0.

## Tính toàn vẹn

- Ảnh mới được kiểm tra định dạng/kích thước, PUT điều kiện không ghi đè, xác minh HEAD và tải lại đối chiếu SHA-256 trước khi trả biên nhận.
- Luồng mobile lưu object trước transaction; tham chiếu, hash, dung lượng và biên nhận được ghi nguyên tử dưới RLS. Lỗi giữa chừng giữ nguyên ảnh đã ghi nhận; retry dùng lại cùng mã, mất phản hồi COMMIT có thể tra cứu biên nhận.
- Bản sao lịch sử dùng khóa theo nguồn/phiên bản. Chỉ thêm ánh xạ sau khi đối chiếu đủ byte/hash. Không cập nhật hồ sơ nguồn, revision, payload hoặc hash Telegram; không xóa bất kỳ nguồn nào.
- API ảnh và bộ gửi Telegram tra bảng ánh xạ trước khi dùng Cloudinary. Snapshot cũ vẫn giữ nguyên nguồn logic; việc di chuyển không tự mở lại quyền gửi trùng.
- Các tab trình duyệt cũ vẫn có thể dùng chữ ký Cloudinary; server chuyển ảnh đó sang CloudFly trước khi gắn vào hồ sơ. Client mới tải ảnh trực tiếp qua API CloudFly của Himoto.
- Web dùng ảnh xem trước cố định tối đa 384 px/96 KiB, lưu private trên CloudFly. Nút mở ảnh giữ nguyên tệp gốc. Ảnh ngoài màn hình dùng lazy loading. Không nhận kích thước tùy ý để tạo thêm vô hạn biến thể.

## Kiểm chứng

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:release
node scripts/check-cloudfly-photo-schema.cjs .backups/mobile-sql-qa/node_modules/@electric-sql/pglite
node scripts/check-mobile-customer-documents.cjs --pglite-path .backups/mobile-sql-qa/node_modules/@electric-sql/pglite --cloudfly
node scripts/check-mobile-finance-sql.cjs --pglite-path .backups/mobile-sql-qa/node_modules/@electric-sql/pglite
node scripts/check-contract-statistics-postgres.cjs
node scripts/check-access-order-store-postgres.cjs
npm.cmd run build
```

PGlite ở đường dẫn trên là runtime QA cục bộ, không thuộc production dependencies. Test thống kê dùng PostgreSQL QA riêng tại loopback cổng 55439, kiểm tra đúng cluster và chặn mạng ngoài. Test dùng fixture; không gửi Telegram hoặc ghi giao dịch vận hành.

## Theo dõi và quay lại

Tiến độ, lỗi theo fingerprint nguồn: `.backups/cloudfly-media-migration/`. Không đưa signed URL, key hoặc ảnh thật vào log/Git. Theo dõi dung lượng và băng thông CloudFly riêng; copy và xác minh cũng sử dụng băng thông. Giữ bucket/credential sau khi chuyển vì dữ liệu mới đã dùng chúng.

Khi có lỗi release, chỉ quay về bản đã hỗ trợ đọc ảnh CloudFly (từ `57f933b`) hoặc sửa tiếp trên nền bản đó; giữ nguyên schema/index/nguồn Cloudinary. Bản trước khi có reader ảnh object không đọc đầy đủ ảnh mới đã lưu. Không tự xóa ánh xạ hoặc bản sao. Đặt `PHOTO_STORAGE_PROVIDER=cloudinary` chỉ tác động ảnh ghi mới; các reader vẫn phải giữ khả năng đọc object đã lưu. Không chạy lifecycle xóa chung `himoto/photos`, `himoto/videos`, `himoto/legacy` hoặc `himoto/previews` khi chưa đối chiếu tham chiếu và chính sách lưu trữ.
