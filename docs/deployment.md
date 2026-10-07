# Triển khai Vercel — 07/10/2026

Repo chính: https://github.com/quantrinhansu123/Himoto, nhánh `main`, root project `/`.

## Cấu hình

1. Kết nối đúng repo trên Vercel; framework Next.js, install `npm ci`, build `npm run build`.
2. Đặt `DATABASE_URL` từ Supabase Transaction pooler (cổng 6543) và `MANAGEMENT_SESSION_SECRET` ngẫu nhiên ít nhất 32 ký tự cho Production. Chỉ đặt cho Preview nếu chủ động cho phép môi trường đó truy cập DB vận hành.
3. Xóa các cấu hình cũ `NEXT_PUBLIC_MANAGEMENT_DATA_SOURCE`, `NEXT_PUBLIC_MANAGEMENT_API_MODE`, `API_PROXY_URL`, `NEXT_PUBLIC_API_URL` và `NEXT_PUBLIC_RENTAL_APP_URL`; ứng dụng hiện gọi API cùng origin và không chọn demo theo chúng.
4. Redeploy sau khi thay biến môi trường. `vercel.json` đặt vùng function Singapore (`sin1`) để gần Supabase hiện tại.

DB/session secret chỉ dùng phía server. Không commit `.env.local`, copy toàn bộ env Laravel cũ hoặc để secret xuất hiện trong log. Kết nối TLS xác minh CA và hostname; certificate Supabase công khai đã kèm source.

## Kiểm tra sau triển khai

- Chưa đăng nhập: các trang quản lý chuyển đến `/login`; GET `/api/auth/customers` trả 401 khi đủ cấu hình.
- Đăng nhập bằng quản trị viên hiện có; kiểm tra cookie HttpOnly/Secure/SameSite và mở đủ danh mục, Log, sổ quỹ.
- Kiểm tra số lượng/ID qua DB, lọc/tìm kiếm, mở hợp đồng và tải lại trang. Không hiển thị nút demo, khôi phục mẫu hoặc dữ liệu mẫu khi API lỗi.
- Đăng xuất rồi kiểm tra API trả 401. Khi env thiếu, API trả 503 và trang quản lý vẫn bị chặn.
- Các thao tác ghi chỉ thử bằng môi trường kiểm thử riêng hoặc dữ liệu được người dùng chỉ định. Không tạo/xóa hợp đồng hay giao dịch để xác minh triển khai.

## Trạng thái

Local production build, TypeScript, lint và 38 nhóm kiểm tra dữ liệu/API đã đạt. 7 nhóm kiểm tra browser với Supabase thật (gồm đủ 7 màn và trường hợp thiếu cấu hình) có kết quả tại `docs/qa/supabase-live/results.json`; không ghi dữ liệu nghiệp vụ. Chưa xác minh triển khai Vercel từ repo mới: thông tin xác thực Vercel lưu trên máy trả HTTP 403 `Not authorized`; project được GitHub xác nhận là `congs-projects-f25af77d/himoto`. Người dùng sẽ thêm hai biến môi trường phía server vào project này rồi redeploy nếu cần. URL demo cũ `himoto-management.vercel.app` chưa được coi là bản dữ liệu thật.
