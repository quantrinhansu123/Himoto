# Xóa ảnh/video đã lưu trong chi tiết hợp đồng — 24/10/2026

## Lỗi đã tái hiện

Ảnh gia hạn được lưu đúng nhưng hai danh sách trong chi tiết hợp đồng chỉ có chức năng xem:

- Tab Telegram: danh sách xem trước toàn bộ ảnh/video của giao dịch.
- Tab Ảnh thuê / trả xe: danh sách hồ sơ của các lượt thuê, gia hạn và trả xe.

Trên bản trước sửa, fixture gia hạn v2 có bốn ảnh nhưng cả hai danh sách đều không có nút xóa. Kiểm tra tái hiện: `.backups/contract-photo-delete-20261024/before/report.json`.

## Thay đổi

- Thẻ ảnh/video dùng chung có nút **Xóa ảnh / Xóa video** dưới mỗi tệp; vùng bấm cao tối thiểu 44px.
- Hỏi xác nhận trước khi xóa; thông báo rõ ảnh đã gửi lên Telegram vẫn còn trong nhóm và phải dùng chức năng thu hồi nếu cần gỡ.
- Gọi API DELETE hiện có cho đúng hợp đồng và slot. Giữ nguyên kiểm tra quyền, phạm vi cơ sở, liên kết lượt gia hạn/phiếu gia hạn/dòng trả xe trên server.
- Quyền nút xóa theo từng slot: gia hạn/đổi pin dùng `contracts.renew`, trả xe dùng `contracts.return`, giao xe dùng `contracts.finalize`, các ảnh thuê dùng `contracts.draft`.
- Lỗi xóa giữ ảnh và cho phép thử lại; khóa bấm liên tiếp trong lúc xử lý. Có thông báo sau khi xóa thành công.
- Tab Telegram tải lại nội dung, số ảnh và hash sau khi xóa. Nếu tải lại lỗi, ẩn dữ liệu và nút gửi cũ cho đến khi đọc lại thành công. Không tự gửi hoặc thu hồi Telegram.
- Chặn xóa trong phần xem trước Telegram khi giao dịch đang gửi. Hợp đồng đã hoàn thành vẫn sử dụng API xóa ảnh hiện có.

## Kiểm tra local

- `npm.cmd run typecheck`: đạt.
- `npm.cmd exec -- eslint src/components/management/ContractPhotoCard.tsx src/components/management/ContractTelegramPanel.tsx src/components/management/ContractTransactionPhotos.tsx src/lib/management/contract-photos.ts`: đạt.
- `npm.cmd run build`: đạt. Cảnh báo cấu hình plugin Next ESLint tồn tại từ trước vẫn xuất hiện.
- `node scripts/check-contract-photo-delete.cjs`: 7 nhóm đạt, dùng database giả, không kết nối/ghi dữ liệu thật. Kiểm tra quyền UI khớp API; hoàn thành vẫn xóa đúng một ảnh; từ chối thiếu quyền, sai hợp đồng, sai lượt, sai origin, không có session và slot không hợp lệ.
- `node scripts/check-record-photo-save.cjs`: 4 nhóm hồi quy đạt; ghi nhận thất bại/success của lưu/xóa ảnh đúng.
- `python scripts/check-contract-photo-delete-ui.py`: 23 ca đạt. Chromium 1440×950, WebKit 390×844, Chromium 844×390; tài khoản admin, nhân viên cơ sở, kế toán, nhân viên thuê sở hữu.
- Ca browser gồm hủy xác nhận, lỗi API/giữ ảnh/thử lại, bấm liên tiếp chỉ phát một DELETE, số ảnh và hash mới, không gửi Telegram sau xóa, xóa đúng tệp ở gallery, hợp đồng hoàn thành, lỗi đọc sau khi xóa và thử tải lại, chặn nút khi đang gửi và ẩn nút thiếu quyền.
- Không có lỗi JavaScript. Đã xem ảnh chụp máy tính/điện thoại; nút và tên ảnh nằm trong vùng cuộn, không tràn ngang.
- `git diff --check`: đạt.

## Bảo toàn và giới hạn QA

Toàn bộ API ghi của browser được chặn bằng fixture; 15 yêu cầu DELETE mô phỏng, **0 thao tác ghi dữ liệu thật**, **0 gửi/thu hồi Telegram thật**. Không thao tác với hợp đồng thật trong ảnh người dùng gửi. Session chỉ phục vụ xác thực đọc trang và lưu tại `.backups/`, không in hoặc commit.

21 tệp riêng, `.env*`, diff riêng `scripts/check-contract-support-ui.py` được so SHA-256 với baseline và giữ nguyên. Không chạy SQL riêng hoặc đổi schema.

Bằng chứng local: `.backups/contract-photo-delete-20261024/`, gồm báo cáo API, hồi quy lưu ảnh, tái hiện trước sửa, báo cáo và ảnh browser. Kết quả triển khai và QA production được ghi tại `deployment.json` và `production-ui/report.json` trong cùng thư mục sau khi push.
