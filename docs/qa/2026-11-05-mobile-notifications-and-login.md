# Android login và thông báo —05/11/2026

## Kết quả mới nhất trên Samsung release

APK release run5 SHA256
`3d2b93676e670a4a4dc4ca5f0e8831f080a3c4c2d08fc37c5c8899755f47b258`
đã cài trên Samsung Note9 theo chấp thuận của chủ dự án. Không dùng emulator.
Login có logo giữa, bỏ marketing và không còn banner bản phát triển.

- `mobile-samsung-release-push-20261105-run1/results.json`: nhận FCM khi app mở;
  nhận thông báo mới sau khi tiến trình đóng; chạm mở trung tâm công việc đã xác
  thực. Payload chung, private; phiên QA đã đăng xuất, không ghi nghiệp vụ.
- `mobile-samsung-release-cold-start-20261105-run1/results.json`: 5 lần mở đạt,
  không có crash/ANR mới của app hoặc SystemUI. Không dùng phép đo này để công bố FPS.
- `mobile-samsung-release-export-20261105-run1/results.json`: cài đè cùng chữ ký
  giữ phiên; xuất bộ lọc rỗng qua Android SAF, mở lại XLSX hợp lệ, không xuất hàng
  nghiệp vụ. Đã đăng xuất khi hoàn tất.
- Production khôi phục tại `dpl_69Tch1swhngTe912VtveDquNwTC2`: public21checks và
  feed thông báo quản trị/cơ sở đạt. Các phiên QA server đã thu hồi. CI/merge Git
  tiếp tục được theo dõi trong PR#1 để cập nhật web không làm mất API mobile.

Các kết quả trên thay cho trạng thái chưa triển khai/chưa có bằng chứng FCM ở
nhật ký cũ bên dưới. Chưa chứng nhận mọi thao tác tài chính/kho thật trên production;
những nghiệp vụ đó được kiểm trong PostgreSQL cô lập. ANR emulator ở APK cũ còn
chưa xác định nguyên nhân; không tái hiện trong lượt Samsung release này.

## Nhật ký trước khi hoàn tất bản release mới

## Đầu ra source

- Login: logo Himoto giữa, bỏ marketing hero và đoạn theo dõi đội xe; form/CTA
  gọn, giữ password manager/paste/Next/loading/error và nút hiện/ẩn mật khẩu.
- Bell trên Tổng quan và entry Thông báo công việc. Màn danh sách có trạng thái
  lỗi/thử lại/rỗng và phân trang20; mở hồ sơ bằng route nội bộ cố định.
- Nhóm điều chuyển: actual VEHICLE_TRANSFER_JOIN_SQL, chỉ lượt còn nhận được,
  loại superseded/received/rejected/cancelled, lọc cơ sở nhận hoặc scope_all thật.
- Đến hạn đóng tiền/quá hạn: actual readManagementTable web, cùng billing/legacy
  balance, không tự đổi điều kiện nghiệp vụ. Đến hạn ở đây là kỳ đóng tiền đã đến
  hẹn chưa đóng đủ theo scope due của web; chưa bổ sung nhắc trước hạn trả xe.
- Chờ duyệt: hợp đồng sở hữu đã phát hành chưa có approval, đúng helper web và
  canApproveOwnershipContract; chưa gộp duyệt báo cáo ca hay bản nháp chưa đủ hồ sơ.
- Đăng ký FCM gắn token thiết bị với đúng session hiện tại; token/bảng kết quả gửi
  chỉ owner truy cập. Không dùng topic chung cho các cơ sở.
- Gửi sau opt-in và bởi scheduler integrations đã có. Kiểm tra session/password
  version/quyền hiện tại, lease chống worker trùng, checkpoint fingerprint trước
  gửi. Unknown giữ dấu vết, không phát lại mù. Gửi theo snapshot công việc đang
  tồn tại, tối đa5thiết bị/lượt, ít nhất5phút giữa các lần kiểm tra cùng thiết bị;
  không hứa realtime hoặc lịch nhắc theo giờ khi chưa đo worker production.
- Payload ngoài app chỉ HiMoto/nội dung chung/screen+kind; không tên/điện thoại/
  CCCD/biển số/số tiền. Chạm thông báo mở trung tâm, đọc lại quyền và dữ liệu.

## Bằng chứng

`mobile-login-samsung-20261105-run1`:3ảnh, logo giữa, bỏ copy, CTA thấy không cuộn,
validation/mật khẩu/keyboard,0credential/businesssubmit,0crash/ANR,gen81 nguyên.
Đây là binary debug tải source mới, không thay chứng nhận release.

`mobile-notifications-offline-20261105-run4/results.json`:4nhóm PASS. PostgreSQL cô
lập thực thi RLS/transfer/approval SQL/migration/registration/lease/receipt; hợp
đồng due/overdue dùng seam của actual web reader. FCM/STS/impersonation là transport
giả lập,0externalmessages/0productionwrites. Test gồm chuyển account, logout,
opt-out, UNREGISTERED, responseunknown và không blind resend. Web workspaces3nhóm
hồi quy PASS, xác nhận scope overdue lọc trước count/page; chưa deep live parity.

`mobile-notifications-ui-20261105-run4/results.json`:375sáng/430tối,8ảnh, login giữa,
4nhóm/click/paging/error503retry, không tự hiển thị push Enabled,0pageerror.
Run1–3 là lỗi harness (alt selector, web preview session chỉ ở memory, thiếu prefix
Mở ở accessibility label), không phải kết quả pass. Bell Tổng quan được thêm sau
bundle UI run2; cần bundle/release và kiểm tra bell ở lượt tiếp.

`mobile-live-push-schema-20261105-run1/schema.json`:catalog TLS read-only sau user
chạy SQL Success.2bảng push RLS true,0policy,grants chỉ postgres;17bảng mobile tổng
cộng. Không đọc nghiệp vụ,khôngápSQL từ runner. Ngoại lệ đọc DATABASE_URL chỉ trong
run-mobile-live-schema.ps1 đã được user cho trước; không nạp env khác.

## Firebase và Vercel

Cập nhật 11:29: source backend mới đã build đạt và user deploy Ready
`dpl_EVbKnVKcLqKsxJyXP8jCwiDBWUBp`; public smoke 21 mục đạt tối qua. Lượt kiểm tra
hôm nay thấy domain trỏ `dpl_ELvk3PUir3NHmomFA8kMbuyktJAG` và API mobile trả 404
HTML, trong khi web vẫn 200. Chưa biết tác giả deployment mới. User đang kiểm tra;
tạm dừng QA có tài khoản. Đây là thay đổi deployment, không phải lý do chạy lại SQL.
Live notification run2 bị chặn ngay ở login 404, không session mới/đăng ký/gửi push.
Chưa có bằng chứng FCM thực. Các mốc dưới giữ để đối chiếu lịch sử.

ProjectId himoto-70f21/projectNumber1074135885293/package vn.himoto.staff. User
bật FCM v1. E:\google-services.json publicconfig SHA256
bb8e6fa7747a7f2d1f7aae5ce5e801c93db1ac02303170b33efd5cdf61e107ff.

Tạo serviceaccount key bị Google chặn. Không thay organization policy. Thay bằng
OIDC Vercel qua WIF, SA himoto-fcm chỉ có roles/firebasecloudmessaging.admin,
principal được roles/iam.workloadIdentityUser chỉ cho Himoto Production. Google
STS kiểm token; impersonation nhận scope firebase.messaging/lifetime600s, lưu
memory. Không đọc VERCEL_OIDC_TOKEN từ .env.local. SDK gọi trong request, không ở
module/build. User đã chạy script setup thành công (HIMOTO_FCM_WIF_READY).

User thêm5GCP config và HIMOTO_MOBILE_PUSH_ENABLED=true Production, redeploy cũ
Ready dpl_GcQ8cWCwoFKACuukyTvdiMxP9UX9. Probe04:13 notification/device404, session401.
Cần deploy source mới sau build pass; không tuyên bố backend push đã live.

## Còn phải chứng minh

Backend source mới build/deploy, auth live feed/list đa vai trò, token đăng ký/
thu hồi/đổi account thật, FCM foreground/background/đã đóng trên Samsung, chạm
thông báo và network/session scope. APK ký release cuối, chuyển certificate từ
debug có kiểm soát, cold start/hồi quy native/ANR, đủ nghiệp vụ core và hướng dẫn.
