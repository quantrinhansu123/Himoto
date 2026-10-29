# Đồng bộ hợp đồng và danh sách xe theo app cũ

## Kết quả đã đính chính theo mốc hết ngày 28/10

Mốc chuẩn là **23:59:59.999999 ngày 28/10/2026, giờ Việt Nam** (trước `2026-10-28T17:00:00Z`). Người dùng xác nhận **giữ phát sinh trên app mới từ ngày 29/10**; dữ liệu nền lấy `app.himoto.vn` làm chuẩn và loại cơ sở đã đóng. Những số ở các đợt trước bên dưới là nhật ký xử lý, không phải số chốt ngày 28/10.

| Phạm vi tại mốc chốt | Số lượng |
| --- | ---: |
| Xe chưa bán trên toàn web cũ | 476 |
| Xe chưa bán tại cơ sở đóng, loại khỏi kho vận hành | 68 |
| Xe chưa bán tại cơ sở còn mở | 408 |
| Xe đã bán tại cơ sở còn mở | 2 |
| Tổng bản ghi trong danh sách xe tại cơ sở còn mở | **410** |
| Xe có trạng thái kho Đang thuê tại mốc chốt | 226 |
| Toàn bộ hợp đồng thuê xe tại cơ sở còn mở | **28.774** |
| Hợp đồng thuê xe chưa kết thúc tại mốc chốt | **262** |
| Hợp đồng thuê pin, thuộc module riêng | 43 |

262 hợp đồng xe chưa kết thúc gồm 254 đang thuê theo trạng thái lưu trên nguồn, 2 chờ thanh toán, 2 nợ xấu và 4 đặt cọc. Quá hạn được tính khi hiển thị theo ngày hẹn trả. Số hợp đồng còn mở và số xe đang thuê là hai số liệu độc lập ngay trên nguồn.

Đã áp dụng batch `himoto-source-cutoff28-preserve29-20261029`. Sau khi cộng các phát sinh app mới từ 29/10 được giữ lại, app mới có **28.777 hợp đồng thuê xe hiển thị, 259 chưa kết thúc**, cùng **43 hợp đồng pin**. Đã giữ/khôi phục phát sinh trên 19 hồ sơ xe và 1 hồ sơ pin, gồm gia hạn, các phiếu thu/chi, trả xe và hai hợp đồng xe tạo ngày 29. Danh sách xe vẫn gồm 410 bản ghi; trạng thái, thông tin và luân chuyển xe có phát sinh ngày 29 được giữ theo nhật ký app mới.

Dữ liệu nguồn tại mốc chốt được dựng lại từ bản chụp chỉ đọc và before-image đầy đủ của nhật ký MySQL. Đã kiểm tra checksum log, chuỗi 189.475 thay đổi liên tiếp và đối chiếu 347 hàng thay đổi với bản chụp nguồn. Không dùng cách lọc ngày tạo trên dữ liệu hiện tại để suy ra trạng thái quá khứ.

Đã khớp dữ liệu nền của toàn bộ 28.774 hợp đồng xe, các dòng xe và **87.565 phiếu nguồn**. Bổ sung các hồ sơ lịch sử đang bị ẩn và các dòng/phiếu thiếu; lưu 27 hồ sơ ngoài dữ liệu nền vào lịch sử. Thêm 17 hồ sơ xe tại cơ sở đóng chỉ để nối lịch sử hợp đồng, đặt ngoài kho vận hành. Có 196 ID xe lịch sử đã không còn hồ sơ xe ngay trên nguồn; giữ ID gốc trong dữ liệu đối chiếu, không suy đoán biển số hoặc khách.

Kiểm tra toàn bộ kế hoạch trên bảng TEMP và rollback trước khi áp dụng. Khi ghi thật, kiểm tra bản trước sửa, quan hệ dữ liệu, dữ liệu nguồn cộng phát sinh 29/10 và hash các hàng ngoài phạm vi trước commit. Ảnh, thông báo hợp đồng và sự kiện ngân hàng giữ nguyên; không thực hiện thu/chi bên ngoài. Bản nguồn tại mốc chốt, bản trước sửa, kế hoạch và dữ liệu phát sinh 29 được lưu kèm checksum trong `himoto.legacy_migration_batches`; tài liệu riêng nằm tại `.backups/cutoff-20261028/` và được Git bỏ qua.

Đã kiểm tra trực tiếp API production lúc **14:41 ngày 29/10/2026, giờ Việt Nam**: 410 xe (408 chưa bán, 2 đã bán; 223 đang thuê tại thời điểm kiểm tra), 28.777 hợp đồng xe và 43 hợp đồng pin. Tab Đang thuê hiển thị đúng **253 = 141 còn trong hạn + 110 quá hạn + 2 nợ xấu**. Kiểm tra riêng lượt trả xe ngày 29 của hợp đồng `011244` và hai hợp đồng mới ngày 29: lượt trả vẫn hoàn thành, hai hợp đồng mới vẫn đang thuê. Checksum bản sao lưu trong database đạt.

## Nhật ký đợt đầu ngày 29/10

Người dùng xác nhận ngày 29/10/2026 lấy `app.himoto.vn` làm chuẩn, thay dữ liệu xung đột trên app mới và loại các cơ sở đã đóng. Bản chụp nguồn lúc **11:12:48 ngày 29/10/2026, giờ Việt Nam**; đây là đồng bộ tại một thời điểm. Phát sinh sau bản chụp đích được giữ riêng.

- Đối chiếu và ghi đúng nguồn cho toàn bộ **370 xe** ở sáu cơ sở đang mở; **223 xe Đang thuê**, 144 Lưu kho, 2 Đã bán, 1 Nợ xấu.
- **259 hợp đồng chưa kết thúc** khớp nguồn: 251 đang thuê, 2 chờ thanh toán, 2 nợ xấu, 4 đặt cọc. Cập nhật thêm các phát sinh từ mốc đồng bộ 19/10 và hồ sơ app mới cần khớp trạng thái: tổng **642 hợp đồng, 664 dòng xe, 5.687 phiếu nguồn**.
- Giữ ID/mã và giấy tờ của 357 bản nhập cùng lần thuê đã xác minh. Trường hợp khác khách nhập hồ sơ riêng; bản bị thay thế giữ lịch sử. Cất 6 hợp đồng mở riêng trên app mới không thuộc nguồn; giữ nguyên giá trị các phiếu bị hủy hiệu lực, không tạo hoàn tiền.
- 41 xe không thuộc danh sách nguồn tại cơ sở đang mở được giữ ngoài kho vận hành; không xóa lịch sử xe. Điều chỉnh kho có audit, không xác nhận việc di chuyển vật lý.
- Lưu bản trước sửa, kế hoạch, checksum và ánh xạ trong batch `himoto-source-authoritative-20261029` của `himoto.legacy_migration_batches`. Dữ liệu khách và Excel đối chiếu nằm tại `.backups/active-rental-sync-20261029/`, được Git bỏ qua. Không chạy lại batch đã áp dụng.

Giữ nguyên các bất nhất có sẵn trên nguồn để đối chiếu: xe Đang thuê thiếu hợp đồng mở, hợp đồng còn mở trên xe Lưu kho, hồ sơ thiếu xe nguồn, chênh tổng đã thu với các phiếu và thiếu lịch đóng tiền sở hữu. Hai trường hợp CCCD trùng hồ sơ khác giữ nguyên toàn bộ CCCD nguồn trên hợp đồng, không gộp giấy tờ giữa các khách khác nhau.

Danh sách xe và thống kê dùng cùng trạng thái kho đã lưu, chỉ chuẩn hóa các tên trạng thái cũ. Một hợp đồng còn mở không tự đổi trạng thái hiển thị từ Lưu kho sang Đang thuê. Thông tin khách/hợp đồng và kiểm tra xe đang bị giữ tiếp tục được đọc độc lập.

Kiểm tra: chạy kế hoạch trên bảng TEMP và rollback; đối chiếu độc lập nguồn về trạng thái, cơ sở, khách, tiền, ngày thuê/trả và toàn bộ phiếu; kiểm tra hash các hàng ngoài phạm vi, ảnh, Telegram và sự kiện ngân hàng trước/sau. Kiểm tra lại qua DB và API Vercel sau commit. Kiểm thử trạng thái kho bằng `node scripts/check-vehicle-stock-status.cjs --live-read` chỉ đọc PostgreSQL, không ghi nghiệp vụ.

## Đính chính phạm vi danh sách xe

Con số 370 của batch đầu chỉ bao phủ sáu cơ sở theo bản đồ nhập cũ; đã bỏ sót xe của Trụ sở chính và Thuê pin dù các cơ sở này đang mở. Không dùng 370 làm tổng chuẩn của toàn bộ cơ sở đang hoạt động.

Đối chiếu lại ngày 29/10/2026: nguồn có 478 bản ghi xe; bộ đếm “Số lượng xe” của Laravel loại hai xe Đã bán nên hiển thị **476**. Trong đó có **408 xe chưa bán ở cơ sở đang mở** và **68 xe ở cơ sở đã đóng** (Phú Quốc 63, Trần Quốc Hoàn 3, Lê Văn Hiến 1, HAPPY LAND 1). Theo phạm vi đã chốt loại cơ sở đóng, danh sách mới cần đủ **410 bản ghi = 408 chưa bán + 2 đã bán**.

Batch bổ sung `himoto-fleet-open-store-scope-20261029` khôi phục hiển thị 40 bản ghi xe sẵn có, giữ ID và lịch sử, có bản trước sửa cùng audit. Chỉ bổ sung các xe nguồn tại cơ sở còn hoạt động đang nằm ngoài kho vận hành. Không ghi đè phát sinh trên những xe đã hiển thị, không sửa hợp đồng/phiếu tiền hoặc gửi thông báo. Bằng chứng và đối chiếu tại `.backups/fleet-scope-audit-20261029/`.
