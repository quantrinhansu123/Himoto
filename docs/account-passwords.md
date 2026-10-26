# Cơ sở tài khoản và quản lý mật khẩu

Trang Tài khoản dùng cơ sở đang xem trong cả request API và bảng. Chọn Hà Đông chỉ trả các tài khoản gắn Hà Đông, không gộp tài khoản toàn hệ thống. Quản lý cơ sở không được yêu cầu dữ liệu cơ sở khác bằng URL.

Mọi tài khoản đang đăng nhập có menu **Đổi mật khẩu của tôi**. Phải xác minh mật khẩu hiện tại và nhập lại mật khẩu mới. API lấy ID từ phiên đã xác thực, không nhận ID đích. Mỗi lần tự đổi tăng phiên bản mật khẩu bằng trigger DB; cookie cũ không được dùng ở yêu cầu tiếp theo. Trình duyệt thực hiện tự đổi được cấp cookie mới, các phiên khác phải đăng nhập lại.

Hai tài khoản quản trị `quanlyvanhanh` (ID **145**) và `quantri` (ID **160**) được xem bản lưu mật khẩu theo yêu cầu ngày 25/10/2026; các quản trị khác không kế thừa quyền này. Đã bỏ chức năng chỉnh/reset mật khẩu của người khác. Endpoint cũ từ chối action reset trước khi mở kết nối DB; PATCH tài khoản từ chối mật khẩu mới cho mọi tài khoản đang có, kể cả khi người thao tác là ID 145 hoặc 160. Tạo tài khoản mới vẫn cấp thông tin ban đầu. Nhân sự quay lại được mở quyền với mật khẩu cũ, không tự sinh mật khẩu thay thế; phiên cũ trước khi nghỉ bị thu hồi bằng phiên bản mới.

## Bản lưu khôi phục theo yêu cầu vận hành

Đăng nhập vẫn dùng bcrypt, không dùng bản giải mã để xác thực. Bản có thể xem lại là quyết định riêng cho yêu cầu vận hành này, tăng phạm vi thiệt hại nếu nick khôi phục bị chiếm. [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) ưu tiên lưu băm; không coi việc có bản giải mã là mặc định cho hệ thống đăng nhập khác.

`management_account_passwords` lưu AES-256-GCM với IV ngẫu nhiên, AAD gắn ID người dùng, khóa tách miền từ `MANAGEMENT_SESSION_SECRET`. Không cấp quyền đọc bảng này cho PUBLIC, anon, authenticated, service_role hoặc himoto_scoped; bật RLS và chỉ truy cập bằng backend owner. Không lưu mật khẩu rõ vào log/audit. Bản sao chứa fingerprint của hash xác thực; thay mật khẩu ngoài đường ứng dụng làm bản sao cũ không còn được xem. Thay khóa phiên cũng cần kế hoạch chuyển mã các bản lưu này.

GET danh sách không trả mật khẩu, hash, ciphertext hoặc fingerprint; `id` được chuẩn hóa thành số để nút **Hiện** gửi đúng kiểu. Nick 145/160 bấm **Hiện** để gọi POST riêng có audit, `private, no-store`; API chấp nhận `id` số hoặc chuỗi chữ số. UI che mặc định, tự ẩn sau một phút/rời cửa sổ. Khi phiên bản dòng thay đổi, mật khẩu cũ lập tức bị che. Bảng đọc lại metadata mỗi 15 giây và khi quay lại cửa sổ. Không ghi mật khẩu vào localStorage. Người tự đổi được thông báo quyền xem của nick khôi phục ngay trong form.

Không thể khôi phục mật khẩu cũ chỉ có bcrypt. Không cần migration mới để bỏ reset; các bản lưu và lịch sử reset trước đó được giữ. Không thu thập mật khẩu lúc đăng nhập, không sửa mật khẩu thật để thử nghiệm. Bản lưu xuất hiện từ lần cấp hoặc nhân viên tự đổi mật khẩu.

## Kiểm tra và triển khai

`node scripts/check-account-passwords.cjs` dùng schema riêng, rollback và sequence riêng; chạy tuần tự với `check-staff-accounts.cjs` vì cùng dùng khóa advisory quản lý tài khoản. `check-account-password-api.cjs`, `check-account-management-api.cjs` và `check-management-login.cjs` kiểm tra wrapper/auth/cookie. `check-account-password-ui.py` kiểm tra Chromium/WebKit với API giả lập, không đổi mật khẩu thật.

Áp dụng `node scripts/migrate-account-passwords.cjs --apply` trước deploy. Script xác minh ID 145 đang là `quanlyvanhanh`, thêm cột/trigger/bảng và kiểm tra bảng riêng không bị cấp cho role scoped. Mọi mật khẩu đang dùng giữ nguyên; cookie cũ vẫn hợp lệ khi phiên bản là 0. Sau khi đã có đổi mật khẩu, rollback code phải giữ kiểm tra phiên bản để không phục hồi cookie đã bị thu hồi.
