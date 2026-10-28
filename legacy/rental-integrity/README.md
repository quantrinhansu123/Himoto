# Cảnh báo thuê xe trên app cũ, đối chiếu app mới

Phạm vi được người dùng xác nhận ngày 29/10/2026: triển khai cảnh báo xe Đang thuê thiếu hợp đồng giữ xe hoặc thiếu tên khách, đối chiếu hai app; giữ trạng thái xe trong lúc chờ kiểm kê thực tế. Không sửa kho, hợp đồng, khách hàng, phiếu tiền hoặc Telegram.

App cũ hiển thị khối **Cảnh báo xe Đang thuê · Đối chiếu hợp đồng** ngay trên trang `/vehicles`. Báo cáo kiểm tra mọi xe Đang thuê thuộc cơ sở đang chọn, không chỉ trang hiện tại. Có làm mới, tải CSV UTF-8 và tùy chọn cơ sở đã đóng cho quản trị viên. Nhân viên chỉ được xem cơ sở được gắn; quản trị viên có thể xem tất cả. Cảnh báo tách biệt:

- App mới đã có hợp đồng cùng tên khách: thông tin cần đối chiếu giữa hai app, không kết luận thiếu hợp đồng.
- Cả hai app chưa thấy hợp đồng giữ xe, hoặc app mới thiếu tên khách: cần xác minh hồ sơ và vị trí thực tế.
- App mới còn nháp/đặt cọc/bảo lưu, hoặc không có xe trong danh mục mới: rà hồ sơ riêng.
- Kết nối app mới thất bại: **Chưa đối chiếu được**, không coi là không có hợp đồng.

Các dòng xe đã trả, dòng/hợp đồng đã xóa và hợp đồng đã hoàn thành không xác nhận khách hiện đang giữ xe. Kết quả đối chiếu app mới được cache tối đa 60 giây, có mốc thời gian hiển thị. Một lần kiểm tra không tự cập nhật trạng thái nghiệp vụ.

## Triển khai

`RentalIntegrityService.php`, `VehicleRentalIntegrityController.php`, `rental_integrity.php` được cài vào thư mục PSR-4/config tương ứng của `/var/www/app.himoto.vn`. `rental-integrity.js` và CSS vào `public/js` / `public/css`. Installer `deploy.py` thêm route GET `/api/auth/vehicle/rental-integrity` với `auth.jwt` và `check.status`, đồng thời thêm hai asset có mã phiên bản vào Blade. Không thay bundle Vue đang vận hành. Add-on dùng đúng Vue runtime và Axios đã có; gắn duy nhất vào `VehicleIndex`, theo dõi đổi cơ sở và tháo khi rời trang. Không phụ thuộc phiên bản compiler hoặc build lại các chức năng cũ.

App cũ gửi danh sách biển số ứng viên đến POST `/api/internal/vehicle-rental-integrity` của app mới. Chữ ký RSA-SHA256 gồm timestamp, nonce và nguyên body, hết hạn sau 60 giây. Khóa ký riêng nằm tại `/etc/himoto/rental-integrity.key` (root:www-data, 0640); chỉ khóa xác minh công khai được lưu trong Git. Không dùng lại khóa đăng nhập hoặc mật khẩu DB. App mới chỉ trả có/không và số lượng hợp đồng, không trả tên khách, ID hợp đồng, liên hệ, cơ sở hoặc tiền qua cầu nối này. TLS luôn kiểm tra chứng chỉ; không đi theo redirect.

Installer chỉ chấp nhận các đường dẫn đã định trước, so sánh hash nguồn trước khi sửa, giữ bản gốc và manifest tại `/var/backups/himoto-rental-integrity-20261029/<release>/`. Mọi kiểm tra PHP trước/sau đều hoàn tất trước khi xác nhận cài. Nếu lỗi trong bước chép file, phục hồi các file đã chép. Không chạy SQL thay đổi dữ liệu nghiệp vụ.

Khôi phục: đối chiếu `installed.json` của release với hash hiện tại rồi phục hồi đúng các file trong `before/`; các file mới chỉ gỡ nếu hash vẫn khớp release này. Không xóa hoặc chép đè thay đổi mới hơn. Khóa riêng được giữ để có thể triển khai lại hoặc xoay khóa bằng một release có khóa công khai mới.

## Kiểm tra

- `node scripts/check-legacy-rental-integrity.cjs`: xác thực chữ ký, chống sửa body, hết hạn, giới hạn đầu vào, route thật, no-store, phản hồi không PII, không truy vấn ghi, CSV chống công thức.
- Thêm `--live-temp`: SQL PostgreSQL trên bốn bảng TEMP, rollback, không dùng sequence dữ liệu thật; xác minh thuê/nợ xấu, tên dự phòng, nháp, đã trả, hoàn thành và đã xóa.
- `check.php` chạy trong host cũ với transaction READ ONLY: nguồn Láng, lọc cơ sở đóng, mất kết nối, khách đã có HĐ app mới, quyền quản trị/nhân viên/cơ sở khác.
- `python scripts/check-legacy-rental-integrity-ui.py --inject`: bản Vue cũ thật, chặn toàn bộ API nghiệp vụ bằng fixture; Chromium/WebKit, làm mới/lỗi/CSV/cơ sở đóng/320px/vòng đời trang. Bỏ `--inject` sau khi triển khai để kiểm tra asset được tải từ Blade thật.

Dữ liệu khách, báo cáo xuất, khóa ký riêng và bằng chứng riêng nằm trong `.backups/`, không đưa vào Git. Bản xuất ban đầu xác nhận 247 xe Đang thuê app cũ, 11 cảnh báo (2 ở cơ sở đang mở, 9 ở cơ sở đã đóng); riêng 19G1-423.19 đã có HĐ 007180 trên app mới. Đây là số liệu tại thời điểm chụp, không phải hằng số của ứng dụng.
