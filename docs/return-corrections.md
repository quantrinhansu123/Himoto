# Sửa trả xe và gửi lại hồ sơ Telegram

Mở **Trả xe**, tra cứu mã hợp đồng hoặc biển số. Trong **Hồ sơ xe đã trả**, chọn **Sửa hồ sơ trả xe** hoặc **Gửi Telegram**. Nút sửa cũng có ở bước hoàn tất ngay sau khi xác nhận trả.

- Sửa ngày giờ trả, phí quá hạn, phí/nội dung sửa chữa, giảm tiền trả sớm và ghi chú gửi Telegram.
- Sửa, thêm hoặc bỏ các khoản thu/hoàn của đúng lượt trả: số tiền, tiền mặt/CK cá nhân/CK công ty, két/tài khoản, ngày giờ và ngân hàng/STK/tên người nhận. Mỗi lượt có tối đa một khoản hoàn cọc và một khoản hoàn tiền thuê; các khoản thu có thể tách theo hình thức thanh toán.
- Lưu ảnh/video tại phần hồ sơ. Xóa tệp nhập nhầm bằng nút Xóa trong bước kiểm tra Telegram, rồi trở lại sửa để tải bản đúng.
- Nhập lý do sửa, bấm **Lưu thay đổi**. Màn hình chuyển sang kiểm tra; chỉ **Gửi toàn bộ Telegram** mới gửi tin. Có thể đóng và mở lại từ hồ sơ đã trả.

Người có `contracts.return` sửa trong phạm vi cơ sở được cấp; tài khoản đã được admin cấp phạm vi tất cả cơ sở dùng phạm vi đó. Chỉ có quyền xem toàn hệ thống không đủ để sửa lượt trả. Không thay đổi cơ sở, biển số hoặc trạng thái xe thành đang thuê trong luồng sửa trả xe này.

## Tính nhất quán

`GET/PATCH /api/auth/returns/correction` lấy nhóm xe theo lượt trả gốc. Các phiếu liên kết của lượt đó được đánh dấu `cancelled`, giữ nguyên dữ liệu cũ; hệ thống ghi các phiếu đúng và bù chênh lệch `orders.pid`/phí trong một transaction. Phiếu thuê/cọc ban đầu và khoản tiền không thuộc lượt trả được giữ. Sổ quỹ/báo cáo chỉ tính phiếu `approved`; lịch sử hợp đồng hiển thị cả phiếu đã hủy và lý do sửa. `management_composer.return_corrections` giữ trước/sau, người, thời điểm và mã yêu cầu. Không dùng thao tác sửa để ghi nhận trả xe lần hai.

Kiểm tra phiên bản cả hợp đồng, dòng xe và phiếu tiền; bấm lưu lặp cùng mã yêu cầu không ghi thêm. Mã phiếu đã từng dùng không được tái sử dụng. Giới hạn thu, hoàn cọc và hoàn tiền thuê dùng chung logic với lần trả đầu. Sửa giờ trả thuê sở hữu cập nhật mốc dừng lịch đóng tiền. Helper SQL kiểm tra lượt thuê tiếp theo trên toàn hệ thống để ngăn chồng giờ, kể cả khi xe đã chuyển cơ sở.

Lượt đang gửi, gửi dở, chưa rõ kết quả hoặc đang thu hồi Telegram phải đối chiếu xong trước khi sửa tiền. Các tin đã gửi giữ nguyên lịch sử; bản sửa chỉ tạo nội dung mới để người dùng kiểm tra và chủ động gửi. Thêm giờ trả, ghi chú và thông tin nhận hoàn vào bản Telegram đã sửa; giữ khóa chống gửi trùng và cách gửi tiếp phần còn thiếu.

Hồ sơ cũ thiếu liên kết phiếu không được tự đoán khoản tiền thuộc lượt nào. Chỉ các phiếu xác định từ `return_settlements` được sửa trong màn hình này. Xe đã đối chiếu kho nhưng chưa có ngày trả gốc (`actual_recovery_at=null`) vẫn mở được **Sửa hồ sơ trả xe** để nhập ngày giờ thực tế; lần lưu sẽ ghi nhận mốc đó.

## Triển khai và kiểm tra

`node scripts/migrate-return-corrections.cjs --apply` cài helper `correct_returned_contract_time`; migration chỉ thêm định nghĩa hàm, không sửa dữ liệu nghiệp vụ hoặc tự gửi tin.

Kiểm tra: `check-return-corrections.cjs` dùng schema rollback, identity riêng và RLS thật; `check-return-corrections-api.cjs` kiểm tra xác thực/phân quyền/transaction; `check-return-corrections-ui.py` kiểm tra Chromium desktop và WebKit mobile, chặn toàn bộ API nghiệp vụ, ảnh và Telegram. Chạy thêm `check-counter-workflow.cjs`, `check-gps-contract-integrations.cjs`, typecheck, lint và production build.
