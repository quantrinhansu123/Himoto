# Đồng bộ hợp đồng và danh sách xe theo app cũ

Người dùng xác nhận ngày 29/10/2026 lấy `app.himoto.vn` làm chuẩn, thay dữ liệu xung đột trên app mới và loại các cơ sở đã đóng. Bản chụp nguồn lúc **11:12:48 ngày 29/10/2026, giờ Việt Nam**; đây là đồng bộ tại một thời điểm. Phát sinh sau bản chụp đích được giữ riêng.

- Đối chiếu và ghi đúng nguồn cho toàn bộ **370 xe** ở sáu cơ sở đang mở; **223 xe Đang thuê**, 144 Lưu kho, 2 Đã bán, 1 Nợ xấu.
- **259 hợp đồng chưa kết thúc** khớp nguồn: 251 đang thuê, 2 chờ thanh toán, 2 nợ xấu, 4 đặt cọc. Cập nhật thêm các phát sinh từ mốc đồng bộ 19/10 và hồ sơ app mới cần khớp trạng thái: tổng **642 hợp đồng, 664 dòng xe, 5.687 phiếu nguồn**.
- Giữ ID/mã và giấy tờ của 357 bản nhập cùng lần thuê đã xác minh. Trường hợp khác khách nhập hồ sơ riêng; bản bị thay thế giữ lịch sử. Cất 6 hợp đồng mở riêng trên app mới không thuộc nguồn; giữ nguyên giá trị các phiếu bị hủy hiệu lực, không tạo hoàn tiền.
- 41 xe không thuộc danh sách nguồn tại cơ sở đang mở được giữ ngoài kho vận hành; không xóa lịch sử xe. Điều chỉnh kho có audit, không xác nhận việc di chuyển vật lý.
- Lưu bản trước sửa, kế hoạch, checksum và ánh xạ trong batch `himoto-source-authoritative-20261029` của `himoto.legacy_migration_batches`. Dữ liệu khách và Excel đối chiếu nằm tại `.backups/active-rental-sync-20261029/`, được Git bỏ qua. Không chạy lại batch đã áp dụng.

Giữ nguyên các bất nhất có sẵn trên nguồn để đối chiếu: xe Đang thuê thiếu hợp đồng mở, hợp đồng còn mở trên xe Lưu kho, hồ sơ thiếu xe nguồn, chênh tổng đã thu với các phiếu và thiếu lịch đóng tiền sở hữu. Hai trường hợp CCCD trùng hồ sơ khác giữ nguyên toàn bộ CCCD nguồn trên hợp đồng, không gộp giấy tờ giữa các khách khác nhau.

Danh sách xe và thống kê dùng cùng trạng thái kho đã lưu, chỉ chuẩn hóa các tên trạng thái cũ. Một hợp đồng còn mở không tự đổi trạng thái hiển thị từ Lưu kho sang Đang thuê. Thông tin khách/hợp đồng và kiểm tra xe đang bị giữ tiếp tục được đọc độc lập.

Kiểm tra: chạy kế hoạch trên bảng TEMP và rollback; đối chiếu độc lập nguồn về trạng thái, cơ sở, khách, tiền, ngày thuê/trả và toàn bộ phiếu; kiểm tra hash các hàng ngoài phạm vi, ảnh, Telegram và sự kiện ngân hàng trước/sau. Kiểm tra lại qua DB và API Vercel sau commit. Kiểm thử trạng thái kho bằng `node scripts/check-vehicle-stock-status.cjs --live-read` chỉ đọc PostgreSQL, không ghi nghiệp vụ.
