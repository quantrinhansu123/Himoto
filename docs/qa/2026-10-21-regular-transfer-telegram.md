# Telegram cho chuyển / nhận xe thường

## Thay đổi

- Trước đây, điều kiện `ownership` chặn xe thuê thường ngay ở bước xem trước. Lịch sử vẫn hiện nút Telegram nhưng không có thông báo nào được xếp gửi.
- Lượt chuyển / nhận xe thường giờ hiển thị nội dung và hai nhóm cơ sở: bên chuyển đi và bên nhận. Hai bản ghi outbox dùng khóa `vehicle-event:<id>:from:store` và `vehicle-event:<id>:to:store`, đi qua cấu hình nhóm cơ sở hiện có.
- Nội dung xe thường dùng tiêu đề “ĐIỀU CHUYỂN XE” / “ĐÃ NHẬN XE”. Luồng thuê sở hữu và các payload cũ giữ tiêu đề, nhóm nhận cũ.
- Bộ xử lý sau POST lấy tối đa hai thông báo của đúng lượt đang gửi, để xử lý đủ hai nhóm.
- Bên chuyển gửi lượt chuyển; bên nhận gửi lượt nhận. Cơ sở không liên quan bị chặn. Bên chuyển vẫn mở được lịch sử khi xe đã sang cơ sở khác.
- Mở / đóng / làm mới bản xem trước không gửi tin. Nhân viên phải bấm **Gửi thông tin Telegram**. Lượt đã gửi bị khóa; kết quả chưa rõ không được gửi lại. Nếu một nhóm thiếu cấu hình, chỉ nhóm chưa gửi được xếp lại sau thao tác chủ động.
- Áp dụng cho lượt cũ khi mở lại từ **Lịch sử luân chuyển**. Không tự gửi bù, không đổi trạng thái xe hoặc hợp đồng. Không cần migration production.

## Kiểm thử

- `node scripts/check-vehicle-transfer-telegram-api.cjs`: xác thực, quyền, cùng nguồn, dữ liệu POST, transaction và bộ xử lý gửi đủ hai đích sau commit.
- `node scripts/check-gps-contract-integrations.cjs`: nhóm, ảnh trước nội dung, chống gửi trùng, gửi lại riêng nhóm thiếu cấu hình, chặn kết quả chưa rõ; hồi quy thuê sở hữu / hợp đồng / thu hồi Telegram. Chỉ dùng schema QA và rollback; bot, nhóm và phản hồi Telegram đều giả lập. Bổ sung migration ảnh xe vào môi trường thử sau các migration cũ ghi đè ràng buộc slot ảnh.
- `python scripts/check-vehicle-transfer-telegram-ui.py --url <url> --session-cookie-file <ignored-file> --browser chromium|webkit`: lưu chuyển xe rồi xem trước, mở lại lịch sử, hai nơi nhận, trạng thái lỗi / đang gửi / chưa rõ / đã gửi, quyền chỉ xem và lượt nhận riêng. Mọi API ghi được chặn và giả lập; kiểm tra 390px và 1440px.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`.

Ảnh và kết quả máy chạy lưu trong `.backups/regular-transfer-telegram/`, không commit thông tin xác thực hoặc dữ liệu khách hàng. Kiểm tra production chỉ đọc lượt chuyển và quyền cơ sở; không gửi / xóa Telegram thật.

Kết quả trước push: 35 nhóm tích hợp, 4 nhóm API và 5 tình huống trên mỗi trình duyệt Chromium / WebKit đều đạt. Typecheck, lint và build thành công; lint còn 3 cảnh báo hook có sẵn tại `ManagementPage` và `StaffOrganizationChart`.
