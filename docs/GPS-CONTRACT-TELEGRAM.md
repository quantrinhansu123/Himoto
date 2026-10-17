# GPS, ảnh giao dịch và Telegram

## Định vị GPS

- Mở **Định vị GPS** để xem thiết bị Protrack/IOPGPS, lọc cơ sở, tìm biển số/IMEI, mở bản đồ và xem lịch sử đổi trạng thái.
- **ON**: thiết bị kết nối, xe đang di chuyển. **Dừng**: thiết bị kết nối, tốc độ bằng 0. **OFF**: nhà cung cấp báo mất kết nối; Protrack dùng heartbeat quá 5 phút. Thiết bị chưa có dữ liệu hiện **Cần kiểm tra**.
- Nếu HIMOTO không đọc được nhà cung cấp quá 10 phút, giao diện hiện **Chưa cập nhật**, giữ dữ liệu gần nhất. GPS không đổi trạng thái thuê, lưu kho hoặc số tiền hợp đồng.
- Chỉ tự ghép khi biển số chuẩn hóa khớp đúng một xe. Quản trị dùng **Ghép với xe** cho thiết bị chưa khớp; ghép thủ công hoặc bỏ ghép được giữ qua các lần đồng bộ. Nhân viên chỉ thấy GPS của xe trong phạm vi cơ sở được cấp.
- Quản trị mở **Tích hợp GPS & Telegram** để cập nhật tài khoản, mật khẩu hoặc tạm ngừng một tài khoản. Mật khẩu và phiên nhà cung cấp được mã hóa trên server, không trả về trình duyệt.

Không cần extension. Server đọc dữ liệu bằng các endpoint mà trang giám sát của nhà cung cấp đang sử dụng. Nếu nhà cung cấp đổi giao thức đăng nhập, kiểm tra lỗi ở trang cấu hình và cập nhật bộ đọc.

## Đồng bộ tự động

Khi phần mềm đang mở và tab hiển thị, trình duyệt yêu cầu đồng bộ mỗi 30 giây. Server giới hạn mỗi tài khoản một lượt bắt đầu trong 25 giây.

Để tiếp tục đồng bộ khi đóng trình duyệt trên máy Windows hiện tại:

```powershell
node scripts/install-integration-worker.cjs
Start-Process -FilePath (Get-Command node).Source -ArgumentList 'scripts/run-integration-sync.cjs' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden
```

Trình cài tạo `Himoto-integrations.vbs` trong thư mục Startup của người dùng Windows. Tiến trình chỉ gọi `/api/cron/integrations` bằng khóa riêng cho đồng bộ, không lưu mật khẩu GPS tại Startup. Cấu hình và kết quả gần nhất ở `.backups/integration-worker/`, được Git bỏ qua. Khóa không được in ra log.

**Máy phải bật và đăng nhập Windows** để tiến trình nền chạy; sẽ chạy lại khi đăng nhập Windows. Nếu chuyển sang máy khác, cài trình đồng bộ ở máy đó hoặc dùng bộ lập lịch server gọi endpoint với Bearer token tương ứng. Tránh chạy nhiều tiến trình; worker có khóa PID chống mở trùng.

Gỡ tự chạy: xóa đúng tệp `Himoto-integrations.vbs` trong Startup. Dừng tiến trình Node có PID trong `.backups/integration-worker/worker.lock` sau khi đối chiếu đường dẫn tiến trình. Không dừng toàn bộ Node đang chạy.

## Ảnh thuê / giao / trả xe

- Khi xác nhận thuê/lập hợp đồng hoặc giao xe, mở phần **Ảnh xe** trong hộp xác nhận. Khi trả xe, từng xe được chọn có phần **Ảnh nhận lại** riêng.
- Có 6 góc ảnh: toàn cảnh, đầu, đuôi, trái, phải và đồng hồ/phụ kiện. Có thể chụp trực tiếp trên điện thoại hoặc chọn ảnh sẵn.
- Chọn ảnh rồi bấm **Lưu ảnh** trước khi hoàn tất giao dịch. Nút hoàn tất tạm khóa nếu còn ảnh đang xử lý hoặc chưa lưu. Ảnh là tùy chọn.
- Xem lại tại chi tiết hợp đồng → **Ảnh thuê / trả xe**. Ảnh dùng endpoint có xác thực và phân quyền theo hợp đồng.

## Telegram — cấu hình khi có bot

Hiện chưa cấu hình bot và nhóm; không gửi thông tin hợp đồng ra Telegram.

1. Tạo bot bằng BotFather, lấy token, thêm bot vào từng nhóm PGD và cho phép gửi tin/ảnh.
2. Đăng nhập quản trị, mở **Tích hợp GPS & Telegram**.
3. Nhập bot token, chat ID âm của nhóm tương ứng từng cơ sở, mã chủ đề nếu nhóm dùng topic; bật nhận tại cơ sở cần dùng rồi lưu. Để trống token khi muốn giữ token đã lưu.
4. Sau cấu hình, nghiệm thu với một giao dịch được chủ cơ sở chọn: đúng nhóm, đúng hợp đồng và đủ ảnh. Chưa có bot nên chưa thể xác nhận giao tin Telegram thật.

Thông báo được ghi cùng transaction khi hoàn tất thuê, nhận cọc giữ xe, giao xe hoặc trả xe. Chỉ gửi sau khi transaction thành công. Cơ sở của hợp đồng quyết định nhóm nhận. Nội dung gồm mã hợp đồng, khách/SĐT, xe, tổng hợp đồng, người thực hiện, thời gian và bản chụp ảnh tại lúc hoàn tất.

Mỗi giao dịch chỉ tạo một thông báo. Chưa có bot/nhóm thì hiện **Chờ cấu hình**; các thông báo này không tự gửi lại khi bổ sung bot, tránh phát tán lịch sử ngoài ý muốn. Nếu gửi gặp lỗi mạng sau khi gọi Telegram, trạng thái **Chưa xác định / cần đối chiếu** không tự thử lại để tránh gửi trùng. **Đang gửi / cần kiểm tra** kéo dài cũng cần đối chiếu thủ công. Tiến trình nền xử lý tối đa 2 thông báo mỗi lượt; ảnh chia nhóm tối đa 10 ảnh theo Telegram.

## Triển khai và kiểm tra

- Áp dụng `docs/sql/2026-10-17-gps-contract-telegram.sql` trước bản ứng dụng này. Migration có thể chạy lại, bổ sung bảng tích hợp và cột GPS; không sửa tiền hay trạng thái thuê.
- Cần `DATABASE_URL` và `MANAGEMENT_SESSION_SECRET` tối thiểu 32 ký tự. Không đổi khóa phiên mà chưa có kế hoạch mã hóa lại thông tin tích hợp; sau khi đổi cần nhập lại mật khẩu GPS/bot token và chạy lại trình cài worker.
- Kiểm tra: `npm run test:gps-contract-integrations`, `npm run test:photo-ocr`, `npm run test:account-scope`, `npm run typecheck`, `npm run lint`, `npm run build`.
- Kiểm tra GPS/nhắc Telegram dùng schema QA rollback và API giả cho Telegram; không tạo hợp đồng thật hoặc chuyển tiền để thử.
