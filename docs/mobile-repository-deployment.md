# Web và Android dùng chung repository

Backend Android nằm tại `src/app/api/mobile/v1`, cùng domain và database với web.
Domain dùng trong APK là `https://himoto.vercel.app`. Module nghiệp vụ dùng chung
nằm tại `shared`; source ứng dụng nằm tại `mobile`.

Vercel project `congs-projects-f25af77d/himoto` đã nối GitHub repository này và
deploy từ `main`. Sau khi phần mobile được merge vào `main`, cập nhật web phải
giữ các thư mục trên. Không dùng một ZIP source cũ để thay bản web mới hơn.

Quy trình cập nhật là tạo nhánh từ `main` mới nhất, ghép thay đổi, chạy typecheck,
lint và kiểm tra liên quan rồi merge. Workflow `Mobile checks` kiểm source; workflow
`Mobile production smoke` kiểm 21 route/gate công khai sau deployment Production
thành công. Kiểm tra công khai không đăng nhập, không sửa hồ sơ, không gửi push.
Job thất bại phải được kiểm tra trước khi thông báo app hoạt động bình thường.

Biến môi trường Production tiếp tục được quản lý tại Vercel. Không commit `.env.local`,
service-account private key, keystore, workbook nhân sự hoặc token thiết bị. Android
dùng Firebase project `himoto-70f21` và cơ chế Vercel OIDC → Google WIF; không cần
khóa tài khoản dịch vụ trong repository. Google client config được cấp riêng khi
build APK. Không chạy lại SQL lịch sử chỉ vì source mới được deploy.

Khi cần kiểm tra thủ công bằng source hiện tại:

```powershell
node scripts/check-mobile-live-public.cjs --output .backups/mobile-production-manual-check
```

Mỗi lần dùng thư mục kết quả mới. Route không bearer phải trả JSON 401
`SESSION_EXPIRED`; HTML 404 là dấu hiệu deployment thiếu API. Kết quả này chưa thay
cho kiểm tra đăng nhập, quyền/cơ sở và nhận thông báo thật trên Samsung.
