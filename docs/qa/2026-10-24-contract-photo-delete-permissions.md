# Quyền xóa ảnh hợp đồng cho mọi tài khoản xem hợp đồng — 24/10/2026

## Nguyên nhân và phạm vi

Sau khi bổ sung nút Xóa ảnh, UI/API vẫn dùng quyền theo loại ảnh: gia hạn cần `contracts.renew`, trả xe cần `contracts.return`, giao xe cần `contracts.finalize`. Nhân viên thuê sở hữu không có quyền gia hạn, kế toán chỉ xem hợp đồng cũng không có các quyền trên, nên vẫn không xóa được ảnh.

Đã tái hiện trên bản production trước sửa bằng tài khoản kế toán và nhân viên thuê sở hữu: có bốn ảnh gia hạn trong fixture nhưng thiếu nút Xóa. Kết quả riêng: `.backups/photo-delete-permissions-20261024/before/report.json`.

Người dùng yêu cầu mọi tài khoản có thể xóa. Thay đổi cho mọi tài khoản được xem hợp đồng, giữ phạm vi hợp đồng/cơ sở hiện có. Không cấp thêm quyền xem hợp đồng cho các tài khoản vốn không được truy cập hợp đồng.

## Thay đổi

- `ContractPhotoCard` dùng quyền xóa riêng `contractPhotoDeletePermission`: mọi slot ảnh/video hợp đồng hợp lệ yêu cầu `contracts.read`.
- API chỉ đổi yêu cầu quyền của **DELETE `/api/auth/record-photos/contracts/:id/:slot`** sang `contracts.read`, áp dụng cả ảnh gia hạn, trả xe, giao xe, đổi pin/xe, giấy tờ và biển số đã gắn hợp đồng.
- Upload/thay ảnh vẫn dùng quyền thao tác hiện có; quyền gia hạn, trả xe, thu/chi, gửi/thu hồi Telegram, giấy tờ khách/xe không mở rộng theo thay đổi này.
- Giữ kiểm tra phiên, cùng origin, slot, quan hệ giao dịch và RLS theo phạm vi cơ sở. Không sửa bảng quyền/tài khoản, không migration hoặc SQL dữ liệu thật.
- Xóa trên hợp đồng đã hoàn thành vẫn được. Giữ xác nhận trước xóa, khóa bấm lặp, báo lỗi/giữ ảnh khi thất bại và tải lại số ảnh/hash. Khi đang gửi Telegram vẫn khóa xóa ở phần xem trước để tránh đổi hồ sơ giữa lượt gửi.
- Xóa trong HIMOTO không gỡ ảnh đã gửi trong nhóm Telegram; thu hồi tin vẫn là thao tác riêng.

## Kiểm tra

- Typecheck, lint ba tệp source, build và `git diff --check`: đạt. Cảnh báo cấu hình Next ESLint có sẵn vẫn còn.
- `node scripts/check-contract-photo-delete.cjs`: **8 nhóm đạt**. Các vai trò admin, nhân viên cơ sở, nhân viên/quản lý thuê sở hữu, kế toán, KTNB và tài khoản tùy chỉnh chỉ có quyền đọc hợp đồng được xóa. Tài khoản không có quyền xem, không đăng nhập, sai origin, sai hợp đồng/lượt/slot bị từ chối. PUT và các nghiệp vụ khác giữ quyền cũ.
- `node scripts/check-account-scope.cjs`: **25 nhóm đạt**, gồm xóa ảnh dưới RLS thật cho nhân viên cơ sở, thuê sở hữu, kế toán, KTNB chỉ có `contracts.read`; ID hợp đồng ngoài cơ sở bị chặn. Schema QA và sequence riêng đều rollback, không ghi nghiệp vụ thật.
- Browser local: **35 ca đạt**, không có lỗi JavaScript; admin, nhân viên cơ sở, kế toán và nhân viên thuê sở hữu; Chromium 1440×950, Chromium 844×390 và WebKit 390×844. Mỗi cấu hình kiểm tra nút xóa, hủy xác nhận, API lỗi/thử lại, chặn bấm liên tiếp, tải lại số tệp, xóa video đúng slot, hợp đồng hoàn thành, lỗi đọc sau xóa và khóa trong lúc đang gửi. Báo cáo chạy lại trên production lưu riêng trong `production-ui/report.json`.
- Toàn bộ API ghi của browser dùng fixture, không xóa ảnh thật, không ghi tiền/trả xe hoặc gửi/thu hồi Telegram thật.

Bằng chứng local/production, ảnh chụp, kết quả Vercel và kiểm tra release tại `.backups/photo-delete-permissions-20261024/`; không commit thư mục này vì có phiên đăng nhập. 21 tệp riêng và diff `scripts/check-contract-support-ui.py` (11 thêm/5 bỏ) được so SHA-256 và giữ nguyên. Không đổi `.env*` hoặc SQL riêng có sẵn.
