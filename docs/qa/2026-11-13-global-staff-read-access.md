# Quyền xem toàn cơ sở của nv0011 — 13/11/2026

## Kết quả điều tra

Đối chiếu trực tiếp DB và bản đang chạy tại `https://himoto.vercel.app`:

- Nguyễn Việt Hà (`nv0011`, user 166) đang hoạt động, được phép đăng nhập, có `contracts.read`, `hr.read` và `scope_all=true`.
- Phạm vi tất cả cơ sở đã lưu đúng. Tài khoản có 11 quyền thao tác; phạm vi cơ sở không tự cấp thêm quyền tài chính, cấu hình hoặc quản lý tài khoản.
- Kiểm tra 28 trường hợp API chỉ đọc: 25 trường hợp được phép đều trả 200, số lượng và tổng số khớp admin. Bao gồm hợp đồng, quá hạn theo từng cơ sở trong 7 cơ sở, khách hàng, xe, nhân sự, Dashboard, doanh thu, lịch trực và báo cáo ca.
- Ba API sổ quỹ, tài khoản, tích hợp trả 403 đúng với các quyền chưa được cấp.

Không cập nhật tài khoản, mật khẩu, hợp đồng hay giao dịch thật trong quá trình kiểm tra.

## Lỗi và thay đổi

1. Menu/trang Cơ sở yêu cầu `settings.write` dù API cho phép đọc với quyền hợp đồng. Trang nay dùng quyền xem hợp đồng; thao tác thêm/sửa/xóa vẫn yêu cầu quyền cấu hình. Nhãn trạng thái phản ánh đúng chế độ chỉ đọc.
2. Trang Quá hạn tự chọn `traditional-overdue`, loại hợp đồng thuê sở hữu khỏi kết quả. Trang và thao tác Xóa bộ lọc nay mặc định toàn bộ hợp đồng quá hạn trong phạm vi đã cấp. Có nút Tất cả quá hạn và bộ lọc Quá hạn truyền thống riêng.
3. Tab đang mở chỉ kiểm tra phiên hết hạn, không cập nhật quyền mới. Khi quay lại tab hoặc sau mỗi phút đang hiển thị, ứng dụng kiểm tra lại phiên và tải lại layout nếu quyền/phạm vi thay đổi. Provider được tạo lại theo phiên mới để bỏ danh sách, phạm vi và cấu hình quyền cũ.

## Kiểm tra

- `npm run typecheck`: đạt.
- `npm run build`: đạt, gồm TypeScript và lint của production build.
- ESLint hai component thay đổi: đạt.
- `node scripts/check-management-login.cjs`: 14 nhóm đạt.
- `node scripts/check-contract-monitoring.cjs`: 5 nhóm đạt.
- `node scripts/check-contract-tabs.cjs`: 4 nhóm đạt.
- `node scripts/check-management-loading.cjs`: 13 nhóm đạt.
- `python scripts/check-management-read-access-ui.py --url http://127.0.0.1:3036 --cookie-file <private-session-file>`: 6 nhóm đạt ở 1440px và 390px; gồm hợp đồng hai loại, chuyển cơ sở, xóa bộ lọc, xem Cơ sở không có quyền sửa, và nhận quyền mới khi focus. API nghiệp vụ được mô phỏng, không phát sinh lệnh ghi.
- Kiểm tra trình duyệt với mã mới và DB thật, đúng phiên `nv0011`: 9 trường hợp đạt; trang quá hạn ở phạm vi tất cả và từng cơ sở khớp API; trang Cơ sở hiển thị 7 dòng và không có nút thêm/sửa. Không có lỗi JavaScript hoặc yêu cầu ghi.

Suite cũ `check-contract-monitoring-ui.py` dừng ở assertion bộ lọc trang Thuê sở hữu phải thu gọn (dòng 54), trên cả Chromium và WebKit. Mã ở HEAD đã cố ý mở bộ lọc tại trang này (`collapsed={compactContracts && !ownershipOnly}`); phần đó không thuộc thay đổi lần này. Không ghi nhận suite cũ là đạt.

`check-contract-tab-counts.cjs` không đạt: lần đầu mất kết nối DB; lần chạy lại dừng tại guard `Every business read must use isolated fixtures`. Không thay đổi module truy vấn/đếm của suite này; không ghi nhận suite là đạt.

Artifact chứa dữ liệu thực chỉ lưu dưới `.backups/nv0011-access-audit/`, không đưa vào Git. Các file token phiên dùng kiểm tra đã xóa sau khi chạy. Báo cáo này ghi nhận kiểm tra trước triển khai; trạng thái production được xác nhận riêng theo commit phát hành.
