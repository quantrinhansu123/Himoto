# GPS, ảnh giao dịch và Telegram

## Định vị GPS

- Mở **Định vị GPS** để xem thiết bị Protrack/IOPGPS, lọc cơ sở, tìm biển số/IMEI, mở bản đồ và xem lịch sử đổi trạng thái.
- **ON**: thiết bị kết nối, xe đang di chuyển. **Dừng**: thiết bị kết nối, tốc độ bằng 0. **OFF**: nhà cung cấp báo mất kết nối; Protrack dùng heartbeat quá 5 phút. Thiết bị chưa có dữ liệu hiện **Cần kiểm tra**.
- Nếu HIMOTO không đọc được nhà cung cấp quá 10 phút, giao diện hiện **Chưa cập nhật**, giữ dữ liệu gần nhất. GPS không đổi trạng thái thuê, lưu kho hoặc số tiền hợp đồng.
- Chỉ tự ghép khi biển số chuẩn hóa khớp đúng một xe. Quản trị dùng **Ghép với xe** cho thiết bị chưa khớp; ghép thủ công hoặc bỏ ghép được giữ qua các lần đồng bộ. Nhân viên chỉ thấy GPS của xe trong phạm vi cơ sở được cấp.
- Quản trị mở **Tích hợp GPS & Telegram** để cập nhật tài khoản, mật khẩu hoặc tạm ngừng một tài khoản. Mật khẩu và phiên nhà cung cấp được mã hóa trên server, không trả về trình duyệt.

Không cần extension. Server đọc dữ liệu bằng các endpoint mà trang giám sát của nhà cung cấp đang sử dụng. Nếu nhà cung cấp đổi giao thức đăng nhập, kiểm tra lỗi ở trang cấu hình và cập nhật bộ đọc.

## Đồng bộ tự động

Nhịp mục tiêu là **5 giây/lượt**. Trạng thái/vị trí mới vẫn phụ thuộc chu kỳ truyền của thiết bị, mạng và nhà cung cấp; không phải cam kết trễ tối đa 5 giây. Nếu lượt trước chưa xong, lượt mới chờ để tránh chồng yêu cầu. Lỗi nhà cung cấp được giãn lần thử lại ít nhất 30 giây. Dữ liệu không thay đổi không bị ghi lại mỗi lượt; lịch sử điểm vị trí giữ nhịp tối đa khoảng 30 giây, còn vị trí hiện tại và các lần đổi trạng thái quan sát được cập nhật ở nhịp 5 giây.

**Lịch chính chạy trên Supabase Cron**, gọi API xử lý trên Vercel mỗi 5 giây qua `pg_net`; tiếp tục chạy khi đóng trình duyệt, tắt máy hoặc đăng xuất Windows. Khóa gọi API được lưu trong Supabase Vault. Chỉ có một yêu cầu cloud đang chờ tại một thời điểm; lỗi xác thực tự tắt lịch, lỗi mạng/nhà cung cấp giãn lần thử để tránh dồn tải. Lịch sử job của chính tích hợp này được dọn sau 1 ngày; không xóa lịch sử GPS/hợp đồng.

Quản trị xem trạng thái lịch, HTTP gần nhất và từng tài khoản tại **Tích hợp GPS & Telegram**. Người triển khai dùng các lệnh sau; không in token vào log:

```powershell
node scripts/configure-cloud-integration-sync.cjs --prepare
node scripts/configure-cloud-integration-sync.cjs --enable
node scripts/configure-cloud-integration-sync.cjs --status
node scripts/configure-cloud-integration-sync.cjs --disable
```

`--prepare` áp dụng hai migration bổ sung và chuẩn bị lịch ở trạng thái tắt; `--enable` bật lịch sau khi ứng dụng tương ứng đã triển khai. `--disable` dừng lịch cloud. Supabase và Vercel phải hoạt động bình thường; tần suất 5 giây tăng số lượt gọi API so với 30 giây.

Khi trang GPS hoặc danh sách xe đang hiển thị, trình duyệt làm mới mỗi 5 giây và có thể yêu cầu đồng bộ; server chống trùng với lượt cloud. Nút **Đồng bộ ngay** vẫn dùng được.

## Nhật ký sự kiện và đọc bù

- Luồng 5 giây lấy trạng thái hiện tại. Một worker riêng chạy bằng `after()` sau phản hồi HTTP để đọc lịch sử chuyển động và cảnh báo theo từng thiết bị; không kéo dài lượt lấy trạng thái hiện tại.
- Mỗi luồng có mốc đọc riêng, ban đầu từ một giờ trước khi bật. Mỗi lần đọc tối đa 30 phút, chồng lại hai phút để lấy bản ghi đến trễ. Chỉ tiến mốc sau khi toàn bộ dữ liệu của khoảng đó đã được kiểm tra và lưu thành công; lỗi hoặc dữ liệu thiếu trang giữ nguyên mốc để thử lại. Lượt quét lịch sử toàn bộ thiết bị hoàn thành dần, không cam kết trong 5 giây.
- Các lượt đọc lịch sử cùng tài khoản và loại dữ liệu cách nhau ít nhất 5 giây. Khi nhà cung cấp báo quá tần suất, tạm chờ lịch sử tài khoản đó 60 giây; luồng trạng thái hiện tại tiếp tục chạy độc lập.
- Protrack dùng ID thiết bị nội bộ khác IMEI. Bộ đọc lưu riêng ID này từ danh sách giám sát đã xác thực. API công khai có thể chưa được cấp quyền; bộ đọc lịch sử web chỉ dùng quyền đọc sẵn có của tài khoản, báo lỗi khi nhà cung cấp từ chối.
- IOPGPS có webhook cho bản ghi sự kiện. Endpoint HTTPS riêng từng tài khoản kiểm tra khóa 256 bit được mã hóa trên server, kiểm tra thiết bị thuộc tài khoản rồi mới ghi nhật ký. Khóa không trả về giao diện. Bản ghi thiết bị chưa đối chiếu được được giữ chờ, không tự gán xe.
- Khi cấu hình IOPGPS, tạo bảy quy tắc riêng cho Moving, Online, Offline timeout, Ignition on/off, Running và Stop Moving. Mỗi quy tắc chỉ gửi webhook, không gửi lệnh điều khiển xe, email hay thông báo ứng dụng. Tên quy tắc do HIMOTO quản lý giúp chạy cấu hình lại không tạo trùng.
- Webhook chống lặp theo mã sự kiện. Luồng dự phòng đọc lịch sử chuyển động/cảnh báo do GPS lưu và chống lặp khi đọc chồng khoảng thời gian. Khả năng khôi phục callback bị gián đoạn phụ thuộc việc nhà cung cấp có lưu bản ghi cảnh báo tương ứng. Nhật ký cũ không ghi đè vị trí, trạng thái GPS hiện tại, trạng thái thuê hay tiền hợp đồng.
- **Lịch sử đổi trạng thái gần nhất** hiển thị thời điểm gốc và nguồn: **Lấy mẫu**, **Đọc bù lịch sử**, **Sự kiện trực tiếp**. Lọc theo nguồn và từng thiết bị để xem lại tối đa 100 sự kiện gần nhất của bộ lọc. Thiết bị kết nối trở lại không đồng nghĩa xe đang di chuyển; sự kiện khóa điện được ghi riêng.
- Quản trị xem tiến độ, luồng lỗi/chậm và số sự kiện tại **Tích hợp GPS & Telegram → Nhật ký sự kiện GPS**. Chỉ có thể khôi phục dữ liệu nhà cung cấp thực sự đã lưu; dữ liệu đến trễ ngoài cửa sổ đọc chồng cần chạy đối chiếu khoảng lịch sử tương ứng, không tự suy đoán.

Triển khai migration trước ứng dụng, không dùng lệnh `configure-cloud-integration-sync --prepare` để tránh tắt lịch đang chạy:

```powershell
node scripts/configure-gps-event-sync.cjs --prepare
# Triển khai ứng dụng; chờ lượt đồng bộ mới ghi ID thiết bị nội bộ.
node scripts/configure-gps-event-sync.cjs --enable-history
node scripts/configure-gps-event-sync.cjs --configure-iop-webhooks
node scripts/configure-gps-event-sync.cjs --status
```

Endpoint IOPGPS: `POST /api/webhooks/gps/iopgps/<account_id>`; khóa đi trong Bearer header hoặc tham số `key` trong URL cấu hình riêng của nhà cung cấp. Không đưa URL có khóa vào Git, log hay ảnh chụp. GET có khóa hợp lệ hỗ trợ kiểm tra endpoint. Sai khóa trả 401; JSON sai trả 400; dữ liệu chỉ được xác nhận sau khi lưu bền vững. Cấu hình webhook chỉ đánh dấu thành công sau khi kiểm tra lại các quy tắc tại IOPGPS. Chưa có giao thức push Protrack được xác nhận nên không bật webhook Protrack.

Worker Windows cũ chỉ còn là phương án dự phòng nếu chủ động tắt lịch cloud. Để cài lại phương án dự phòng:

```powershell
node scripts/install-integration-worker.cjs
Start-Process -FilePath (Get-Command node).Source -ArgumentList 'scripts/run-integration-sync.cjs' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden
```

Trình cài dự phòng tạo `Himoto-integrations.vbs` trong thư mục Startup của người dùng Windows. Tiến trình chỉ gọi `/api/cron/integrations` bằng khóa riêng cho đồng bộ, không lưu mật khẩu GPS tại Startup. Cấu hình và kết quả gần nhất ở `.backups/integration-worker/`, được Git bỏ qua. Khóa không được in ra log.

**Chỉ phương án Windows dự phòng** cần máy bật và đăng nhập; lịch Supabase không phụ thuộc máy này. Sau khi nghiệm thu lịch cloud, dừng đúng tiến trình Windows và chuyển tệp Startup vào thư mục sao lưu để không chạy hai bộ hẹn giờ.

Gỡ tự chạy: xóa đúng tệp `Himoto-integrations.vbs` trong Startup. Dừng tiến trình Node có PID trong `.backups/integration-worker/worker.lock` sau khi đối chiếu đường dẫn tiến trình. Không dừng toàn bộ Node đang chạy.

## Ảnh thuê / giao / trả xe

- Khi xác nhận thuê/lập hợp đồng hoặc giao xe, mở phần **Ảnh xe** trong hộp xác nhận. Khi trả xe, từng xe được chọn có phần **Ảnh nhận lại** riêng.
- Có 6 góc ảnh: toàn cảnh, đầu, đuôi, trái, phải và đồng hồ/phụ kiện. Có thể chụp trực tiếp trên điện thoại hoặc chọn ảnh sẵn.
- Chọn ảnh rồi bấm **Lưu ảnh** trước khi hoàn tất giao dịch. Nút hoàn tất tạm khóa nếu còn ảnh đang xử lý hoặc chưa lưu. Ảnh là tùy chọn.
- Xem lại tại chi tiết hợp đồng → **Ảnh thuê / trả xe**. Ảnh dùng endpoint có xác thực và phân quyền theo hợp đồng.

## Telegram — cấu hình khi có bot

Cấu hình bot và nhóm được lưu trong cơ sở dữ liệu, xem trạng thái thực tế tại trang **Tích hợp GPS & Telegram**.

1. Tạo bot bằng BotFather, lấy token, thêm bot vào từng nhóm PGD và cho phép gửi tin/ảnh.
2. Đăng nhập quản trị, mở **Tích hợp GPS & Telegram**.
3. Nhập bot token, chat ID âm của nhóm tương ứng từng cơ sở, mã chủ đề nếu nhóm dùng topic; bật nhận tại cơ sở cần dùng rồi lưu. Để trống token khi muốn giữ token đã lưu.
4. Sau cấu hình, nghiệm thu với một giao dịch được chủ cơ sở chọn: đúng nhóm, đúng hợp đồng và đủ ảnh. Phân biệt kết quả gửi tin/ảnh mẫu với nghiệm thu một giao dịch thật.

Thông báo được ghi cùng transaction khi hoàn tất thuê, nhận cọc giữ xe, giao xe hoặc trả xe. Chỉ gửi sau khi transaction thành công. Cơ sở của hợp đồng quyết định nhóm nhận. Nội dung gồm mã hợp đồng, khách/SĐT, xe, tổng hợp đồng, người thực hiện, thời gian và bản chụp ảnh tại lúc hoàn tất.

Mỗi giao dịch chỉ tạo một thông báo. Chưa có bot/nhóm thì hiện **Chờ cấu hình**; các thông báo này không tự gửi lại khi bổ sung bot, tránh phát tán lịch sử ngoài ý muốn. Nếu gửi gặp lỗi mạng sau khi gọi Telegram, trạng thái **Chưa xác định / cần đối chiếu** không tự thử lại để tránh gửi trùng. **Đang gửi / cần kiểm tra** kéo dài cũng cần đối chiếu thủ công. Tiến trình nền xử lý tối đa 2 thông báo mỗi lượt; ảnh chia nhóm tối đa 10 ảnh theo Telegram.

## Triển khai và kiểm tra

- Áp dụng `docs/sql/2026-10-17-gps-contract-telegram.sql`, sau đó `2026-10-17-gps-five-second-poll.sql` và `2026-10-17-cloud-integration-scheduler.sql` trước bản ứng dụng này. Hai migration sau được áp dụng bởi lệnh `--prepare`. Migration có thể chạy lại; không sửa tiền hay trạng thái thuê.
- Cần `DATABASE_URL` và `MANAGEMENT_SESSION_SECRET` tối thiểu 32 ký tự. Không đổi khóa phiên mà chưa có kế hoạch mã hóa lại thông tin tích hợp; sau khi đổi cần nhập lại mật khẩu GPS/bot token và chạy lại trình cài worker.
- Kiểm tra: `npm run test:gps-events`, `npm run test:gps-contract-integrations`, `npm run test:cloud-integration-sync`, `npm run test:photo-ocr`, `npm run test:account-scope`, `npm run typecheck`, `npm run lint`, `npm run build`.
- Kiểm tra GPS/nhắc Telegram dùng schema QA rollback và API giả cho Telegram; không tạo hợp đồng thật hoặc chuyển tiền để thử.
