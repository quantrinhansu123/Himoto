# Cập nhật ưu tiên04:16 — source thông báo Android

Gói `mobile-web-dev-handoff-20261105-run4/himoto-backend-source.zip` bổ sung
`/api/mobile/v1/notifications`, `/notifications/groups/[kind]`, `/notifications/device`
và sender FCM dùng Vercel OIDC/Google WIF. Build offline938file PASS, source exact,
không env/credential/key trong archive. Root dependency @vercel/oidc4.0.0 được pin.

User đã tạo Firebase himoto-70f21, projectNumber1074135885293, chạy WIF setup
HIMOTO_FCM_WIF_READY và migration `docs/sql/2026-11-05-mobile-push.sql` Success.
Hậu kiểm2bảng mới RLS,0clientpolicy/grants. Không chạy lại01/02 hoặc tạo privatekey.
User đã thêm5GCP vars và HIMOTO_MOBILE_PUSH_ENABLED=true Production. Deployment
dpl_GcQ8cWCwoFKACuukyTvdiMxP9UX9 vẫn source cũ; probe notification/device404.

Giải nén source mới vào thư mục mới trên máy đã login Vercel; mở PowerShell ở đó:
```
npx.cmd --yes vercel@65.11.0 link --yes --project himoto --scope congs-projects-f25af77d
npx.cmd --yes vercel@65.11.0 deploy --prod --scope congs-projects-f25af77d
```
Chỉ deploy sau khi link đúng congs-projects-f25af77d/himoto. Biến Production được
giữ tại project Vercel; không copy/mở/gửi .env.local. CLI có thể tự tạo local OIDC
file khi link, không đưa file đó vào archive/chat. Sau Ready cần kiểm21publicgates,
auth feed/list/permission và FCM thực trên Samsung; build/deploy chưa phải nghiệm thu.

Phần dưới là lịch sử gói trước.


# Gửi dev quản lý web/Vercel — Himoto Android

**Cập nhật triển khai05/11:** user đã điều khiển máy đồng nghiệp và xác nhận
cả01-web-prerequisites/02-mobile-schema Success trên Supabase. Hậu kiểm catalog
trực tiếp `.backups/mobile-live-postmigration-20261105-run1/` xác nhận đủ14bảng
mobile hiện hành/RLS, giữ session legacy + current, resource_key160, helper
customer-source SECURITY DEFINER. Chưa kiểm BE đăng nhập/ghi nhiều vai trò thật.
Vercel Project `himoto`, Scope `congs-projects-f25af77d`; chưa deploy source mới.
Backend mới đã bao gồm7Excel còn lại, build931file/source unchanged/0env đạt.
Các mô tả thiếu bảng bên dưới là kết quả trước migration, không chạy lại SQL
vì đọc riêng đoạn lịch sử đó.

App dùng cùng Next backend, DB, tài khoản và quyền với web. Không cần DB vận hành riêng.
Source local đã pull `origin/main` tới `f74c5a0083fe4adc26f75c5273a94dc675511a6a`.
Các phần mobile còn dirty/untracked; chúng chưa có trên GitHub chỉ bằng việc pull.
Không deploy riêng HEAD vì sẽ thiếu API/source mobile.

## Nội dung có thể chuyển tiếp

> Nhờ bạn phối hợp đưa API Android vào cùng backend web Himoto. Kiểm tra chỉ đọc
> ngày05/11 cho thấy `/api/mobile/v1/session` vẫn404; DB có session mobile kiểu
> access/refresh cũ, thiếu13bảng mobile của source mới. Có gói source kèm SHA,
> manifest và thứ tự SQL; cần review/merge với main hiện tại trước khi triển khai.
> Giữ web, tài khoản, quyền, DB và dữ liệu khách hiện có. Không tạo DB vận hành
> riêng, không thay hoặc xóa bảng session cũ. Báo lại URL HTTPS và revision triển
> khai, kết quả schema/gates để kiểm Android. Chỉ thử ghi vào dữ liệu QA đã đánh
> dấu, không chọn hồ sơ khách ngẫu nhiên hoặc bật gửi tin tự động.

## Đã xác minh

- Read-only preflight dùng TLS kiểm chứng certificate; chỉ đọc catalog, không
  đọc hồ sơ khách, token hoặc khóa.0ghi nghiệp vụ/0DDL.
- DB có `management_mobile_sessions` kiểu access/refresh và
  `management_mobile_login_attempts`; thiếu `management_mobile_requests`,
  `management_mobile_login_limits` và11bảng proof tính cả bills/renewals/collections/
  returns/swaps/recoveries/transfers/media/copy/delete/GPS.
- `users.management_password_version`, các bảng ca và7helper web đã kiểm đều có.
  `ownership_may_use_headquarters_customer_source(bigint)` còn invoker; cần review
  bản vá scope helper để tránh RLS đệ quy. Sự tồn tại chưa chứng nhận RLS mọi vai trò.
- Chuyển session cũ/mới đã kiểm offline7nhóm: giữ nguyên session cũ, hai họ token
  cùng tồn tại; refresh cũ một lần, session mới/password-version/revoke/expiry,
  role/grant và từ chối schema lạ. Chưa chứng nhận APK cũ của đồng nghiệp.
- Backend source đã build trong bản sao không `.env`, network bị chặn.
  Manifest/build result trong gói xác định đúng lượt và SHA source.

## Trình tự phối hợp

1. Nhận gói source, đối chiếu manifest/SHA và base `f74c5a0`. Nếu main đã tiến
   tiếp, merge3chiều giữ thay đổi mới của web. Review thay đổi web dùng chung
   domain; không chép nguyên thư mục đè mất việc dev khác. Chưa commit/push/deploy
   từ máy phát triển mobile.
2. Backup/snapshot DB theo quy trình hiện hành của web. Chạy chỉ đọc
   `docs/sql/2026-11-02-mobile-schema-preflight.sql` và
   `docs/sql/2026-11-05-mobile-rollout-preflight.sql`. Kiểm tên/kiểu cột, constraints,
   roles và grants; xử lý schema không khớp trước khi chạy SQL thay đổi.
3. Review các prerequisite web:
   `2026-11-02-ownership-scope-helpers.sql`,
   `2026-11-02-contract-vehicle-scope.sql`,
   `2026-11-02-contract-vehicle-swaps.sql`,
   `2026-11-04-vehicle-photo-slot.sql`.
   Chỉ áp phần còn thiếu sau khi xác minh định nghĩa hiện tại; script có guard
   không được bỏ guard để chạy cho qua.
4. Với schema legacy vừa quan sát, review SQL mobile theo thứ tự dưới đây.
   Đây là danh sách triển khai cần dev web duyệt, chưa được áp DB thật.
5. Deploy toàn bộ source backend đã merge vào project Vercel hiện tại.
   Giữ secret/kết nối hiện hành ở server; bật `HIMOTO_MOBILE_ENABLED=true` sau
   khi schema sẵn sàng. `MANAGEMENT_SESSION_SECRET` phải dài tối thiểu32ký tự.
   Khóa đã gửi qua chat cần thay an toàn trước rollout; không gửi giá trị khóa
   vào chat/gói source/APK. Đồng bộ việc thay khóa giữa web/backend trước thử phiên.
6. Kiểm GET session không bearer, không header Origin: phải trả401 JSON
   `SESSION_EXPIRED`, không404/503. Native API dùng bearer, không thêm wildcard
   CORS hoặc cho browser cookie thay bearer. Kiểm web login và trang đang dùng
   vẫn hoạt động.
7. Báo URL/revision và kết quả cho người kiểm Android. Dùng tài khoản QA có vai
   trò/cơ sở rõ ràng; kiểm đăng nhập/đọc/ghi/replay/đa phiên rồi mới phát hành.
   Production đã được chủ dự án cho phép thử; vẫn cần chọn bản ghi QA mới và
   phối hợp thời điểm. Không tự thu tiền/gửi Zalo/Telegram/OCR upload vào khách.

## Thứ tự SQL mobile cần review

Tất cả file dưới nằm trong `docs/sql/`. Không chạy toàn bộ thư mục lịch sử SQL.
Không DROP/recreate session hoặc chạy script reset/backfill/import dữ liệu.

1. `2026-11-03-mobile-session-transition.sql` — trước sessions trên DB legacy.
2. `2026-10-31-mobile-sessions.sql`
3. `2026-10-31-mobile-writes.sql`
4. `2026-11-01-mobile-bills.sql`
5. `2026-11-01-mobile-renewals.sql`
6. `2026-11-01-mobile-renewal-collections.sql`
7. `2026-11-02-mobile-returns.sql`
8. `2026-11-02-mobile-swaps.sql`
9. `2026-11-02-mobile-recoveries.sql`
10. `2026-11-02-mobile-vehicle-transfers.sql`
11. `2026-11-02-mobile-record-media.sql`
12. `2026-11-03-mobile-customer-documents.sql`
13. `2026-11-03-mobile-customer-photo-copies.sql`
14. `2026-11-03-mobile-media-deletions.sql`
15. `2026-11-03-mobile-gps-mappings.sql`
16. `2026-11-03-mobile-text-receipts.sql`

Chuyển session là bổ sung hai họ credential, không chuyển nội dung token hoặc
thu hồi phiên cũ. Phục hồi khi lỗi: rollback transaction SQL chưa commit; với
source có thể về deployment web trước. Giữ các bảng/cột/receipt đã tạo và
session đang dùng; không rollback bằng cách DROP bảng hoặc xóa UUID.

## Kết quả cần trả

- HTTPS origin, commit/revision và thời điểm deploy.
- Kết quả hai preflight sau triển khai; xác nhận session mixed đúng constraints
  và credential tables owner-only, receipt actor-only/RLS.
- GET session401 đúng; web login còn hoạt động; tài khoản QA dùng chung quyền.
- Phạm vi/thời điểm cho smoke ghi QA, người theo dõi DB và phương án rollback.

App chưa đủ nghiệm thu Android: còn delta Excel mới, native tổng thể, backend
thật nhiều vai trò/phiên/mạng, Android ký/release và hướng dẫn vận hành. Gói
backend phục vụ review/tích hợp song song, chưa phải chứng nhận bàn giao app.
