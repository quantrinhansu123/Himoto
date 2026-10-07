# HIMOTO Management

Ứng dụng quản lý HIMOTO bằng Next.js 15, React 19 và TypeScript.
Repo chính: https://github.com/quantrinhansu123/Himoto.
Mã cục bộ: `E:\Himoto`.

## Chạy local

```powershell
npm.cmd ci
# Tạo .env.local từ .env.example và điền thông tin Supabase phía server.
npm.cmd run dev
```

Mở http://127.0.0.1:3000/login và đăng nhập bằng tài khoản quản trị đang hoạt động trong `himoto.users`. Ứng dụng luôn dùng Supabase thật, không có nút vào demo hoặc tự thay dữ liệu mẫu khi lỗi. Không cần các biến `NEXT_PUBLIC_MANAGEMENT_DATA_SOURCE`, `NEXT_PUBLIC_MANAGEMENT_API_MODE` hoặc proxy sang web cũ.

Frontend gọi `/api` cùng domain; Route Handlers phía server truy cập schema `himoto` qua PostgreSQL pooler. Trình duyệt không nhận thông tin kết nối DB. Danh sách gồm nhân sự, khách hàng, hợp đồng, cơ sở, xe và sổ quỹ. Sơ đồ nhân sự được dựng từ danh mục DB hiện tại.

Khách hàng hỗ trợ tạo/cập nhật hồ sơ, cơ sở, trạng thái và cảnh báo; xóa bị chặn khi có liên kết với đơn thuê. Hợp đồng hỗ trợ soạn, lưu bản nháp vào DB, mở Log để tiếp tục và in. Hợp đồng đã phát hành chỉ tra cứu/in; chưa nối sao chép hoặc cập nhật hợp đồng đã phát hành. Sổ quỹ chỉ đọc. Không triển khai nghiệp vụ cọc, giao/trả xe, thanh toán hay tất toán.

## Kiểm tra

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:login
npm.cmd run test:management
npm.cmd run test:contracts
npm.cmd run test:drafts
npm.cmd run test:cashbook
npm.cmd run build
```

Fixture còn trong source để kiểm tra tự động; chúng không được chọn làm nguồn dữ liệu của ứng dụng. Các tài liệu/ảnh QA demo cũ là lịch sử kiểm tra trước lần kết nối này.

Xem [cấu hình Supabase](docs/supabase-local.md), [đăng nhập](docs/login.md) và [triển khai Vercel](docs/deployment.md).
