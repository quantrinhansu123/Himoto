# Himoto 1.0.3 — offline, payload và vòng đời phiên

## Phạm vi đã triển khai

- SQLite/SQLCipher lưu dữ liệu tra cứu đã tải và hàng đợi JSON trên điện thoại. Khóa DB nằm trong SecureStore; app kiểm tra `cipher_version` trước khi ghi, không âm thầm chuyển sang DB không mã hóa. Tắt Android Auto Backup cho dữ liệu thiết bị.
- Cache tách theo API origin, tài khoản, vai trò, quyền, cơ sở và phạm vi toàn hệ thống; tối đa 180 trang, mỗi trang tối đa 512 KiB và hạn 24 giờ. Không cache token, cấu hình tích hợp, mật khẩu, file xuất hoặc nội dung media. Chỉ xem được các truy vấn/trang đã tải, không tự tải trước toàn bộ dữ liệu của doanh nghiệp.
- Có thể khôi phục phiên và tiếp tục soạn khi không có mạng, tối đa 24 giờ từ lần xác thực thành công gần nhất và không vượt hạn refresh/phiên. Phiên cũ chưa có thông tin người dùng cần mở app có mạng một lần sau nâng cấp.
- Hàng đợi giữ UUID và nội dung bất biến trước khi gửi, tối đa 8 thao tác chưa xác nhận. Hỗ trợ tạo/sửa khách, tạo/sửa nháp, chốt/giao hợp đồng, thu/chi, gia hạn, thu theo kỳ, trả/đổi xe qua đúng handler hiện có. Các điều kiện phiên bản, snapshot, khóa DB và phân quyền vẫn do máy chủ kiểm tra.
- Khi lỗi mạng, app thông báo **đã lưu trên máy, chưa được máy chủ xác nhận**. Gửi lại dùng cùng UUID/body; không gọi resolver hủy trước khi retry. 409/403, phản hồi không hợp lệ, đổi quyền/cơ sở hoặc chờ quá 24 giờ dừng tự gửi, giữ nguyên bản và mã để đối chiếu. Không xóa giao dịch chờ để lấy chỗ cho giao dịch mới.
- Đồng bộ khi mở app/có mạng, thử lại có backoff; SQLite lease tránh hai worker cùng chiếm một yêu cầu. BackgroundTask được đăng ký theo SDK 58, khoảng tối thiểu 15 phút. Hệ điều hành quyết định thời điểm chạy, không bảo đảm chạy ngay và có thể ngừng khi force-stop/tiết kiệm pin.
- Banner trạng thái và màn **Dữ liệu và đồng bộ** cho biết dữ liệu cũ, thao tác chờ, lỗi đối chiếu và kết quả máy chủ. Ẩn thông báo đã đồng bộ không xóa mã phục hồi nghiệp vụ trong journal/ledger. Các bản thuộc cơ sở/quyền cũ vẫn hiển thị cho đúng tài khoản.
- Giữ journal ảnh/bản đang soạn đã có. Ảnh, video, nhập Excel, xóa, quản trị và các API chưa nằm trong danh sách cho phép không được tự gửi nền. Ảnh cần mở bản gốc, xem và xác nhận theo quy trình hiện hành để tránh ghi đè ảnh của người khác. Các bước preview nghiệp vụ chưa tải vẫn cần mạng; offline không tự suy đoán tồn xe hoặc số tiền.

## Payload

- Giữ API `/api/mobile/v1` với DTO riêng và phân trang. Kho xe lọc/đếm/cắt trang bằng một câu SQL trên nguồn `vehicle_inventory()` hiện hành, không kéo toàn bộ rental blockers/bản nháp vào application RAM.
- Fixture PostgreSQL 500 xe: 25 xe/trang, **4.829 byte JSON** trang đầu; đủ 20 trang không trùng/mất xe, đúng bộ lọc trạng thái/kho/tìm tiếng Việt/biển số.
- Danh sách xe lấy revision ảnh bằng một truy vấn theo lô. App mới không gửi thêm một request JSON metadata cho mỗi thẻ xe khi backend trả `thumbnailRevision`. Backend cũ vẫn dùng cơ chế metadata cũ.
- Endpoint thumbnail riêng qua xác thực/phân quyền/phiên bản ảnh hiện có; JPEG tối đa 228×192, giới hạn 64 KiB, không trả URL Cloudinary hoặc đưa bearer vào URL. Ảnh chi tiết giữ chất lượng gốc.
- GPS vẫn dùng logic đối chiếu nhiều thiết bị của web và tính tổng trên tập trạng thái trước khi trả trang 25 dòng. Xuất Excel vẫn là thao tác theo yêu cầu và một số endpoint còn Base64. Chưa đo hiệu năng trên mạng 4G thật; số byte nêu trên thuộc fixture 500 xe, không phải benchmark production.

## Phiên đăng nhập và sinh trắc học

- Client mới gửi `sessionVersion: 2` khi đăng nhập; backend cũ bỏ qua trường này và trả phiên cũ. Backend mới cấp access 15 phút, refresh 30 ngày trượt, hạn tuyệt đối 90 ngày cho mỗi phiên thiết bị. Phiên cũ vẫn giữ hạn 8 giờ và cần đăng nhập lại một lần để nhận cặp token mới.
- Access/refresh token được lưu trong Keychain/Keystore qua SecureStore (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`) để đồng bộ nền có thể chạy sau lần mở khóa thiết bị đầu tiên. Server chỉ lưu hash; không lưu token rõ trong DB hoặc log.
- Refresh xoay token trong transaction có khóa dòng, kiểm tra lại tài khoản/quyền/password version và thu hồi. UUID gia hạn được ghi trước khi gửi; phản hồi mất có thể lấy lại bằng cùng token/UUID. Dùng lại refresh cũ với UUID khác thu hồi cả phiên thiết bị đó. Các thiết bị khác không bị thu hồi bởi ca reuse này.
- Client gom các yêu cầu refresh đồng thời, lưu token mới trước khi dùng, thử lại 401 một lần. Compare-and-set ngăn phản hồi refresh cũ phục hồi phiên đã đăng xuất hoặc xóa nhầm phiên đăng nhập mới. Cập nhật profile không làm mất UUID refresh đang chờ.
- Tài khoản có tùy chọn bật/tắt Face ID/vân tay, xác thực trước khi đổi tùy chọn. Khi bật, khóa giao diện ở cold start và sau 1 phút rời app; che nội dung khi app không active. Khóa dùng native Modal toàn màn hình, che cả các hộp thoại nghiệp vụ và giữ màn/form bên dưới; nội dung cuộn được khi xoay ngang/phóng chữ. Có mã khóa thiết bị theo hỗ trợ của OS và lựa chọn kết thúc phiên để đăng nhập lại bằng mật khẩu. Mật khẩu vừa được xác thực trong 5 phút có thể dùng để tắt khóa khi sinh trắc học không còn khả dụng; không tạo vòng lặp bị khóa ngay sau khi đăng nhập mật khẩu.
- Sinh trắc học là cổng mở UI trên thiết bị; refresh chạy nền không mở prompt. Không đặt `requireAuthentication` cho refresh token vì như vậy worker không thể gia hạn ngầm. Dữ liệu sinh trắc học không được gửi lên máy chủ. Không coi kiểm tra source/bundle là nghiệm thu Face ID/vân tay trên máy thật.

## Kiểm tra

Đã đạt trước khi đóng gói cuối:

- Typecheck backend/mobile và lint mobile; lint các module backend thay đổi.
- Bộ `npm run test:mobile`: 35 bộ kiểm tra hiện có.
- SQLite thật: mở lại DB, TTL/giới hạn cache, scope cách ly, lease hai kết nối, backoff, bất biến UUID/body, mất phản hồi sau commit, 401/409 và cache chưa tải.
- Worker thật với SQLite và API fixture: xác thực trước gửi, retry UUID gốc, dừng chuỗi khi xung đột, giữ scope cũ, xóa quyền offline khi biết phiên bị thu hồi, không xóa nhầm phiên mới.
- Client token lifecycle với SecureStore fixture: 12 request đồng thời chỉ refresh một lần, giữ UUID qua khởi động lại, CAS/logout và lỗi Keychain.
- PostgreSQL cô lập PGlite 0.5.14: migration lặp lại/bảo toàn phiên cũ, access/refresh expiry, rotation, mất COMMIT response, reuse, thay quyền/password, khóa tài khoản và quyền DB. Bộ chuyển tiếp session cũ/current: 7 nhóm đạt.
- Payload/thumbnail: fixture 500 xe, phân trang/lọc/count, không đưa dữ liệu riêng vào summary; resize ảnh 3.000×2.000 và chặn input hỏng.
- Browser fixture: 43 ca/4 kích thước 375×812, 430×932, 812×375, 1024×768, sáng/tối, reduced motion; có màn đồng bộ mới và đường trở về Tài khoản, không lỗi JS, không host bất ngờ, không đăng nhập thật/ghi nghiệp vụ.
- SQL tài chính hiện hành: 124 ca PostgreSQL cô lập đạt, gồm chống ghi tiền trùng, rollback, RLS và mất phản hồi COMMIT. Đây không phải phép thử đồng thời nhiều máy trên DB triển khai.

Lệnh tái lập:

```powershell
npm.cmd run typecheck
npm.cmd run mobile:typecheck
npm.cmd run mobile:lint
npm.cmd run test:mobile
npm.cmd run test:mobile:offline
npm.cmd run test:mobile:refresh -- --pglite-path .backups/mobile-sql-qa/node_modules/@electric-sql/pglite
npm.cmd run test:mobile:payload -- --pglite-path .backups/mobile-sql-qa/node_modules/@electric-sql/pglite
```

## Thứ tự rollout

1. Áp `docs/sql/2026-11-06-mobile-refresh-tokens.sql` bằng database owner sau schema session hiện hành. Migration thêm bảng riêng, không chuyển đổi hoặc thu hồi các phiên đang có. Với môi trường chưa có mobile, gói `scripts/build-mobile-rollout-sql.cjs` đã bao gồm migration mới sau session transition.
2. Deploy backend có `/session/refresh`, nhánh login v2, catalogue revision ảnh, thumbnail và truy vấn kho mới. Không deploy backend login v2 trước migration.
3. Phát APK mới cùng chữ ký để nâng cấp giữ dữ liệu. Bật Face ID/vân tay trong Tài khoản nếu muốn. Đăng nhập v2 một lần sau khi phiên cũ hết hạn để dùng refresh dài hạn.
4. Nghiệm thu trên máy thật bằng dữ liệu thử/môi trường phù hợp: airplane mode, mở lại app, gửi lại một UUID, đổi cơ sở/quyền, OS biometric và worker sau khi thiết bị bị khóa. Không tạo giao dịch tiền/kho thử trên production.

Lượt này chưa áp migration lên DB thật, chưa deploy backend, chưa cài thay APK trên máy Samsung. Bằng chứng kiểm tra nằm tại `.backups/mobile-offline-20261106-run1/`; manifest/bản build cuối được ghi riêng trong gói bàn giao. Không dùng APK từ lượt build trước bản sửa cuối.

Tài liệu đã đối chiếu: [Expo SQLite SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/), [BackgroundTask SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/background-task/), [LocalAuthentication SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/local-authentication/), [SecureStore SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/), [sharp resize](https://sharp.pixelplumbing.com/api-resize/).
