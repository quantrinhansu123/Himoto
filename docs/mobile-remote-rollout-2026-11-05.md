# Thao tác trên máy đồng nghiệp — Supabase và Vercel

Chủ dự án đã xác nhận được điều khiển cả Supabase và Vercel để hoàn tất app.
Giữ nguyên project web/DB hiện có. Hướng dẫn này dùng gói source đã kiểm build,
không cần commit/push source dirty của máy phát triển chỉ để thử backend.

**Điểm hiện tại:** user báo backup20giờ và đã chạy01/02 Success. Hậu kiểm DB
trực tiếp xác nhận14bảng/RLS/receipt/helper. Ảnh xác nhận login/Linked đúng project;
chưa deploy. Tiếp tại đặt feature gate Production rồi deploy của bước3. Phần
SQL/login/link bên dưới để lưu quy trình; không cần chạy lại. Source mới có đủ7delta Excel.

## 1. Chuẩn bị đúng project

Ảnh user cung cấp xác nhận Project `himoto`, Team/Scope
`congs-projects-f25af77d`. Giữ project này; đối chiếu Domains có
`himoto.vercel.app` trước deployment.

- Vercel: mở project chứa domain `himoto.vercel.app`, ghi tên Project/Team và
  deployment production hiện tại. Giữ URL deployment này làm mốc rollback.
- Supabase: mở đúng project DB mà web đang sử dụng; kiểm bản backup sẵn có tại
  Database → Backups cùng người quản lý. Nếu chưa có backup phù hợp, hoàn thành
  backup theo quy trình của đồng nghiệp trước khi áp SQL.
  [Hướng dẫn chính thức](https://supabase.com/docs/guides/platform/backups).
- Chép gói backend và bộ SQL đã cung cấp sang máy đồng nghiệp. Giải nén source
  vào thư mục MỚI, không ghi đè checkout đang sửa của họ. Kiểm SHA256 archive
  bằng `Get-FileHash -Algorithm SHA256` so với `SHA256SUMS.txt`.

## 2. Supabase SQL Editor

Các file đã gộp từ SQL trong repo, mỗi file là một transaction. Bộ mobile đã
kiểm offline trên cả schema legacy/current, chạy lại và lỗi cuối transaction;
giữ session và dữ liệu nghiệp vụ gốc. Chưa áp SQL này lên DB thật.

1. Chạy `03-preflight-readonly.sql`. Nó chỉ đọc catalog. Kiểm các bảng web có,
   `photo_slot_constraint_present=true`, `photo_scoped_policy_count=4` và cả3
   `scope_patch_guard_matches=true`. Đây là các giá trị đã quan sát trên DB đích.
2. Chạy `01-web-prerequisites.sql` MỘT LẦN. Đợi toàn bộ query thành công.
   File giữ guard định nghĩa/helper/policy từ SQL gốc; nếu lỗi thì cả file
   rollback, dừng và chuyển nguyên mã lỗi để kiểm, không xóa guard.
3. Chạy `02-mobile-schema.sql` MỘT LẦN. File bổ sung13bảng đang thiếu và hai
   họ credential vào session hiện có; không xóa/chuyển token hoặc hồ sơ cũ.
4. Chạy lại `03-preflight-readonly.sql`.14bảng mobile hiện hành phải hiện
   `present=true`, RLS bật; credential/GPS receipt không cấp scoped CRUD.
   Bảng legacy `management_mobile_login_attempts` vẫn giữ. Cột `resource_key`
   varchar160 phải có; helper customer-source trở thành SECURITY DEFINER.

Không chạy các file SQL lịch sử khác ngoài bộ đã chốt. Không dùng Table Editor
để sửa status/kho/tiền nhằm làm app đi qua lỗi. Nếu query trả lỗi, dừng tại bước
đó; không chạy tiếp deployment với schema chưa hoàn chỉnh.

## 3. Vercel: liên kết source vào project web hiện có

Trên PowerShell của máy đồng nghiệp, mở thư mục source vừa giải nén có
`package.json`, `next.config.js`, `src/`, `shared/`. Sau khi xác nhận tên Project
và Team, dùng lệnh với ĐÚNG hai giá trị đó:

```powershell
npx.cmd --yes vercel@latest login
npx.cmd --yes vercel@latest link --project "himoto" --scope "congs-projects-f25af77d"
```

Login bằng browser của chủ tài khoản; không gửi password/OTP/token vào chat.
Chọn project đã có, kiểm project/team hiển thị đúng trước khi tiếp tục.
Thư mục có liên kết `.vercel/project.json`; không upload file auth hay chép
`.env.local` của máy này. [Vercel link](https://vercel.com/docs/cli/link).

CLI65.11.0 thực tế tự ghi OIDC vào .env.local và thêm gitignore sau link, không
hỏi download. Giữ nguyên, không mở/in/gửi file hoặc token. Không chạy env pull.

Trong project Vercel → Settings → Environment Variables, giữ cấu hình backend
hiện hành và thêm `HIMOTO_MOBILE_ENABLED=true` cho Production. Secret DB/session/
storage/OCR chỉ nằm server, không đặt tiền tố `EXPO_PUBLIC_`. Các secret đã lộ
trong chat cần được thay an toàn, đồng bộ web và backend trước nghiệm thu.

Có thể đặt riêng feature gate qua CLI, không cần mở các secret hiện có:

```powershell
npx.cmd --yes vercel@latest env add HIMOTO_MOBILE_ENABLED production --value true --no-sensitive --force --yes --scope "congs-projects-f25af77d"
```

Lệnh này thêm hoặc cập nhật duy nhất cờ mobile trên Production.
[Vercel env](https://vercel.com/docs/cli/env). Chỉ tiếp deployment khi lệnh thành công.

Sau khi SQL và liên kết đã xác minh:

```powershell
npx.cmd --yes vercel@latest deploy --prod --scope "congs-projects-f25af77d"
```

Lệnh này cập nhật production domain của project đã liên kết.
[Vercel deploy --prod](https://vercel.com/docs/cli/deploy).
Không cần `vercel env pull` hoặc chép khóa xuống source.

Sau kiểm thử, dev web cần merge source mobile đã duyệt vào repository triển
khai chính. Nếu chỉ deploy từ thư mục ZIP mà bỏ bước này, lần auto-deploy Git
tiếp theo có thể ghi đè mất API mobile. Phối hợp với đồng nghiệp để không có
deployment Git khác trong lúc nghiệm thu; không tự đổi cài đặt Git của họ.

## 4. Kiểm sau deploy

```powershell
curl.exe -i https://himoto.vercel.app/api/mobile/v1/session
```

Không bearer/Origin phải trả401 và JSON có `SESSION_EXPIRED`.404 nghĩa source
chưa phục vụ route;503 cần kiểm feature gate/schema/runtime config. Không đăng
nhập nhiều lần để đoán password hoặc bỏ xác minh TLS khi gặp lỗi.

Đồng thời kiểm web login và một trang nghiệp vụ hiện có. Ghi deployment URL/
revision/thời điểm. Nếu source gây lỗi web, quay về deployment đã ghi ở bước1;
giữ schema bổ sung và receipt, không DROP bảng session hoặc xóa UUID.

## 5. Đóng app Android

Sau backend hoạt động: xác thực app bằng tài khoản QA cùng hệ thống; kiểm
ghi/đọc đúng cơ sở/quyền, nhiều phiên và mất mạng/recovery. Hoàn tất delta Excel
mới trên các màn còn lại, nghiệm thu Samsung, build Android release ký, kiểm
nâng cấp giữ dữ liệu rồi bàn giao hướng dẫn vận hành/khôi phục. Không coi session
401 hoặc build backend đạt là đã nghiệm thu toàn bộ app.
