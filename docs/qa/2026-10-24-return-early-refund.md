# Trả xe sớm: hoàn cọc và hoàn tiền thuê — 24/10/2026

## Hành vi

Luồng trả xe trước đây chỉ nhận phiếu hoàn cọc trong cùng lần xác nhận. Ví dụ cọc còn giữ 2.000.000đ, khách nhận lại tổng 2.400.000đ gồm 400.000đ tiền thuê trả sớm: nhập cả tổng vào ô hoàn cọc bị chặn. Giới hạn riêng của cọc đúng, nhưng form thiếu khoản hoàn thuê để hoàn tất nghiệp vụ này.

- Form có **Đã hoàn cọc cho khách** và **Đã hoàn tiền thuê do trả sớm**, hiển thị tổng tiền đã chọn hoàn. Hai khoản dùng chung thông tin khách nhận/QR, có hình thức và tài khoản chi riêng.
- Ghi mức giảm tiền thuê theo từng xe và ngày giờ trả thực tế. Khoản giảm trên tiền thuê chưa thu chỉ giảm công nợ; chỉ được chi hoàn phần thực tế thu dư, sau khi tính phí phát sinh và các khoản đã hoàn trước đó.
- Cọc vẫn bị giới hạn bởi cọc đang giữ. Hoàn thuê được kiểm tra riêng sau khi server ghi nhận đầy đủ điều chỉnh của lượt trả. Không nâng giới hạn cọc để chứa tiền thuê.
- Mỗi khoản thực tế đã hoàn tạo một phiếu chi đúng loại: `order:deposit_refund` và `order:rental_refund`. Toàn bộ xe, điều chỉnh và phiếu thu/chi nằm trong cùng giao dịch; lỗi bất kỳ khoản nào sẽ rollback cả lượt.
- Hoàn thuê giảm số đã thu; không giảm tổng tiền thuê lần thứ hai. Sổ quỹ, doanh thu thực thu, báo cáo từng xe và báo cáo xe theo cơ sở cùng đối chiếu đúng. Báo cáo từng xe cũng nhận điều chỉnh mới trên hợp đồng kế thừa từ app cũ.
- Có thể giữ cọc, hoàn thuê một phần hoặc chưa hoàn thuê. Tiền thuê còn thu dư hiển thị sau trả; người có quyền sổ quỹ có nút điền phiếu hoàn thuê sau.
- Nút xác nhận có khóa đồng bộ để chặn bấm liên tiếp. Khi sửa khoản giảm về 0, khoản hoàn đang chọn được kiểm tra lại và không âm thầm gửi một phiếu chi bị ẩn.
- Nội dung Telegram ghi riêng hoàn cọc/hoàn thuê và tổng tiền hoàn. Lượt trả toàn bộ xe lấy thêm phiếu hoàn thuê được ghi sau từ sổ quỹ; lượt trả một phần lấy phiếu liên kết đúng lượt. Làm mới xóa thông báo cọc chờ hoàn khi đã chi và bỏ số hoàn từ phiếu đã xóa. Không tự gửi Telegram.

## Kiểm tra đã đạt

| Kiểm tra | Kết quả |
| --- | --- |
| `npm.cmd run build`, `npm.cmd run typecheck`, ESLint 8 tệp nguồn sửa | Đạt; build còn cảnh báo cấu hình plugin Next ESLint có sẵn |
| `node scripts/check-return-refunds.cjs` | 30 nhóm; TEMP PostgreSQL, rollback, sequence riêng |
| `node scripts/check-account-scope.cjs` | 24 nhóm; có ca nhân viên `contracts.return` hoàn 2 triệu cọc + 400 nghìn tiền thuê, không cần `finance.write` |
| `node scripts/check-rental-revenue.cjs --live-temp` | 5 nhóm; phiếu hoàn giảm tiền thực thu một lần |
| `node scripts/check-rental-reports.cjs --live-temp` | 6 nhóm; doanh thu từng xe và tổng quan |
| `node scripts/check-owned-fleet-revenue.cjs --live-temp` | 8 nhóm; giữ phân quyền riêng và đối chiếu doanh thu xe chủ sở hữu |
| `node scripts/check-counter-workflow.cjs` | 7 nhóm; giữ luồng trả muộn, sửa chữa, cọc và nội dung Telegram |
| `check-return-early-refund-ui.py` | 16 tình huống Chromium desktop và WebKit điện thoại |
| `check-return-validation-ui.py` | 8 tình huống; riêng hoàn cọc vẫn chặn vượt cọc và báo đúng lỗi |
| `check-refund-qr-ui.py` | 14 tình huống; QR, nhập tay, tải lỗi, hoàn sau |
| `check-return-compact-ui.py` | 13 tình huống Chromium; form gọn, ảnh/video, phí 0 và luồng cũ |

Tổng 51 tình huống trình duyệt, không lỗi JavaScript. Các API ghi đều được chặn và thay bằng dữ liệu kiểm thử. Kiểm tra API báo cáo xe theo cơ sở trên build local với dữ liệu thật: đúng tài khoản được xem, bốn quyền khác bị từ chối, không đăng nhập nhận 401; đối chiếu đủ 82 xe của một cơ sở qua hai trang, tổng tiền khớp. Đọc đầu tiên 643 ms tại thời điểm kiểm tra, không phải cam kết hiệu năng.

Không trả xe, chi tiền, sửa hợp đồng hoặc gửi Telegram thật để QA. Không chạy migration nghiệp vụ. Không sửa/commit `.env*` hoặc tệp riêng có sẵn. Bằng chứng cục bộ trong `.backups/return-early-refund-20261024/` bị Git bỏ qua. Kết quả trên là build local; trạng thái triển khai phải kiểm tra riêng theo SHA sau push.
