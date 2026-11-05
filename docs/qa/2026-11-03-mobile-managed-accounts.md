# Tài khoản, phân quyền và mật khẩu —03/11/2026

## Đã nối source/API

Quản lý tài khoản có danh sách20dòng/phân trang, tìm tên/login/email/mã
nhân sự, lọc cơ sở và tổng tài khoản cá nhân; hồ sơ, tên/login/vai trò/cơ
sở/phạm vi/cho phép đăng nhập và từng quyền trong6nhóm. Chọn vai trò lấy
đúng quyền/phạm vi mặc định web. Admin đủ quyền, quyền accounts.manage
không được ủy quyền sang vai trò khác. Không tự khóa/đổi vai trò hoặc xóa
tài khoản đang đăng nhập. Vai trò thuê sở hữu cần cơ sở thuê sở hữu; nhân
sự đã nghỉ không được mở quyền đăng nhập; giữ ít nhất một admin hoạt động.

Tạo/sửa/khóa-mở/xóa mềm gọi actual `saveManagedAccount` và
`deleteManagedAccount`. Reader `listManagedAccounts` chung web, cùng
users/account_access/password escrow/audit, không DB app riêng. Xóa giữ
hợp đồng/phiếu tiền/lịch sử thực hiện. Owner transaction giống route web,
chỉ sau `requireAccountScope` xác nhận admin; không chỉ nhìn mảng quyền
accounts.manage do tài khoản thường có thể mang giá trị này trong legacy.

Mật khẩu ban đầu/login để trống tự sinh đúng web, credentials chỉ trả một
lần, che mặc định và chỉ giữ trong editor đang mở. Có chọn/chia sẻ nội
dung và tải text file do người dùng yêu cầu, không tự lưu file bí mật.
Generic file saver thêm text/plain cho thao tác này, giữ CSV/XLSX cũ.
Không giữ credentials trong query cache/route params/pending ledger/
receipt/audit. Sau đóng hoặc mất phản hồi, không tự cấp lại mật khẩu.

Xem lại mật khẩu chỉ admin ID145/160 đúng entitlement web, actual cipher
server/audit `password_reveal`, UUID/replay không giải mã/gửi lại. Trả
plaintext vào state màn xem có che; tự ẩn sau60giây, rời màn/ra nền hoặc
revision đổi. Hồ sơ refresh15giây khi app active. Chức năng admin đặt lại
mật khẩu vẫn bị chặn như web; không tạo nút reset mới.

Tài khoản cá nhân có tự đổi mật khẩu cũ/mới/nhập lại, kiểm8ký tự/72byte
UTF8, actual `changeOwnPassword`, trigger tăng password_version, escrow và
audit web. Sau thành công cần xác nhận và đăng nhập lại. Mất kết quả giữ
UUID để đăng nhập lại rồi đối chiếu; không tự gửi thêm lần đổi.

Pure permissions/role/grants chuyển nguyên `shared/access-permissions.ts`,
web re-export. Pure account parser/password validation chuyển shared,
server giữ cipher/bcrypt/key; UTF8 byte count chung không dùng Buffer trong
app. Request fingerprint mật khẩu dùng HMAC khóa server, không lưu hash
plaintext có thể dò bằng ledger; không bí mật backend trong bundle.

Bearer routes `/api/mobile/v1/accounts`, options/ID/requests/ID/password và
`/session/password`. Numeric receipt dùng ledger hiện hành, không schema
mới cho module này. Update/delete/reveal cùng user giữ một pending group;
create/self-change giữ key actor/origin qua scope. Receipt gốc đọc được
khi target xóa mềm; profile hiện tại tách revision lúc ghi. Self-change
chỉ đọc receipt của actor qua scoped pool, admin actions owner giống web.

## Kiểm tra nhanh

SQL nhúng6nhóm đạt `.backups/mobile-accounts-domain-checks-run1.log`:
mobile tạo→web đọc cùng ID/login/role/store; bcrypt/cipher thật, replay chỉ
một tài khoản, không plaintext trong ledger/audit; grant delegation/CAS/
store-kind/filter; actual mobile session reader từ chối account bị khóa;
leave không mở lại, mở hợp lệ giữ password; ID145/160 độc quyền reveal/
1audit mỗi UUID và cấm reset; tự đổi dùng actual version trigger, old
session/password bị từ chối/new password đăng nhập được/replay không đổi
hai lần/UTF8 đúng; xóa mềm giữ lịch sử/receipt và cancel chặn late create.
0DB vận hành, khóa QA chỉ trong process bài kiểm, không dotenv.

Pending24nhóm đạt thêm account create/update/delete/reveal/self-change
qua restart/đổi scope/khác actor. Hồi quy nhân sự4nhóm actual web sync/
password/leave/rehire đạt `.backups/mobile-accounts-staff-regression.log`;
mobile auth/client checks đạt `.backups/mobile-accounts-auth-checks.log`.
Root types/scoped+shared lint handle99682 và mobile types/lint72371 đã
terminal exit0, không warning. Generic recovery6nhóm đạt lại trong
`.backups/mobile-accounts-recovery-checks.log`. Không lấy SQL/fixture thay
full RLS hoặc native acceptance.

## QA Samsung / chưa nghiệm thu

Chỉ thêm accounts_workspace generation37→38, backup
`.backups/mobile-accounts-qa-upgrade-20261103`, mọi field cũ giữ nguyên.
Catalogue3tài khoản từ actual SQL nhúng. Có login QA riêng qa-accounts/
fixture-password, actor145 admin, không đổi role/grants của QA7. Admin
portfolio chỉ ghi tài khoản local, module khác chỉ đọc; tự đổi mật khẩu
không thuộc portfolio ghi này. Không credentials thực hoặc provider I/O.

Run1 dừng preflight vì USB reverse mất,0write. Đã khôi phục đúng8081→8081/
8091→8131. Run2 đăng xuất QA7 rồi dừng trước loginadmin vì helper nhập
nhầm placeholder thành nội dung cần xóa;0account request, generation39.
Đã dùng helper login kiểm placeholder/focus trước nhập và nhận biết phiên
đang ở login. Run3 dừng trước write vì Laban Key biến QAAccount thành tên
có dấu khi nhập Telex. Run4 dừng trước write vì chờ nút đầu trang ngoài
viewport sau khôi phục vị trí scroll. Đã đổi tên mẫu, nhận biết tab cố
định và cuộn đúng hướng, tiếp tục admin session đang có; không reset hoặc
đổi app/domain.

Run5 đã thực hiện đầy đủ5mutation/receipt/ack: create#2001→đổi tên/khóa→
mở lại→reveal theo entitlement (luôn che)→xóa mềm. Kết thúc QA7, đọc-only
form tự đổi mật khẩu, work/ledger rỗng/Tổng quan. Harness terminal exit1
ở so sánh preservation vì expiry của hai phiên QA con được nối từ phiên
đăng nhập mới. Không có mutation nghiệp vụ sai hoặc request cần replay.

Đã giữ nguyên source harness cũ có hash khớp provenance, sửa duy nhất
comparison cho hai đường `vehicle_media.sessions.1.expiresAt` và
`vehicle_transfers.sessions.1.expiresAt`, buộc giá trị mới đúng expiry của
một parent session đang sống. Mọi field còn lại so sánh chính xác. Audit
chỉ đọc `audit-mobile-managed-accounts-native.py` handle16247 terminal
exit0 lúc22:03:02 (+07), đọc lại QA7/work/ledger, kiểm5UUID/5audit/26checkpoint
và crash/ANR, không ghi hoặc replay.414/415file nguồn khớp; duy nhất harness
comparison đổi, toàn source ứng dụng giữ nguyên. Evidence run5 giữ nguyên
failure và bổ sung audit/results, không xóa lịch sử lần dừng.

Kết quả3happy path được audit đạt;0crash/ANR/0DB vận hành/0mật khẩu in hoặc
bỏ che. QA generation52, account#2001 softdeleted/login disabled, tất cả
account nền không đổi. Ngoài accounts_workspace chỉ sessions/sessionSeq
và đúng2expiry metadata được cập nhật do đổi phiên; mọi dữ liệu nghiệp vụ
cũ/26checkpoint giữ nguyên. Không reset/replay5UUID. Server8131
handle74944/PID12188 cùng checkpoint; Metro admin6480/origin8091/dotenv tắt,
reverse đúng. Export web/Android/iOS handle79328 terminal exit0 tại
`.backups/mobile-accounts-export-20261103-run1`, dotenv tắt/APIplaceholder,
chỉ JS/Hermes chưa signed APK/IPA. Tổng hợp
`.backups/mobile-accounts-verification-20261103.json`.

Chưa nghiệm thu staging/RLS/đủ role-cơ sở, nhiều phiên/đổi quyền khi đang
ghi/mất mạng/recovery/lifecycle; native tự đổi password thật, credentials
share/text file thật và signed iOS/iPhone. SQL nhúng không thay kiểm toàn
luồng các phiên trên backend staging. App/release/vận hành chưa done.
