# Bảo lưu hợp đồng thuê sở hữu

Chỉ hợp đồng có loại `ownership` hoặc `ownership_cd` dùng luồng này. Nhân viên có quyền `contracts.return` thao tác trong phạm vi cơ sở được cấp. Loại hợp đồng được xác định từ chính hợp đồng; cơ sở thuê sở hữu không biến hợp đồng thuê ngày thành thuê sở hữu.

Trong chi tiết hợp đồng → **Nợ xấu / bảo lưu**:

1. Chọn **Bảo lưu hợp đồng**. Nhập ngày giờ bắt đầu, kết thúc và lý do; xác nhận thực tế đã nhận lại các xe. Xe được về kho theo luồng hiện có. Hợp đồng chuyển sang **Bảo lưu**.
2. Trong bảo lưu không phát sinh kỳ thuê hoặc phí quá hạn mới. Khoản cũ và tiền cọc giữ đúng lịch sử. Hết thời hạn vẫn giữ trạng thái Bảo lưu; hiện **Hết hạn bảo lưu** màu đỏ ngay dưới mã hợp đồng và trên thẻ điện thoại, không thêm cột hay tự chuyển trạng thái.
3. Nếu không quá hạn thanh toán khi bắt đầu bảo lưu và còn thời hạn hợp đồng: hết bảo lưu được **Tiếp tục thuê** hoặc **Hoàn thành hợp đồng**.
4. Nếu đã quá hạn thanh toán khi bắt đầu bảo lưu: hết bảo lưu chỉ được **Hoàn thành hợp đồng**. Thanh toán khoản cũ trong bảo lưu không làm đổi quyết định này.

**Sửa thời hạn bảo lưu** chỉ cập nhật mốc cảnh báo có lưu lịch sử; không đổi ngày bắt đầu, phân loại lúc vào bảo lưu, trạng thái hoặc mốc dừng tính tiền. Hồ sơ bảo lưu cũ chưa có ngày kết thúc cần nhập mốc này, không tự đoán thời hạn.

Hồ sơ cũ đã gỡ giữ xe theo đối chiếu có xác nhận (`confirmed_prior_recovery`), còn thiếu ngày thu hồi thực tế và giữ đúng mốc kỹ thuật được phép vào **Bảo lưu**. Màn hình ghi rõ tình trạng này và dùng hạn trả gốc trên dòng xe để nhận diện quá hạn khi hợp đồng thiếu ngày ở phần chung. Ngày bắt đầu bảo lưu không thay cho ngày thu hồi cũ; thao tác không trả xe lần nữa, không sửa kho xe hoặc lượt thuê về sau, không đổi tiền thuê, tiền đã thu hay cọc. Lịch sử bảo lưu lưu riêng các dòng đã gỡ giữ. Hồ sơ này không được tự tiếp tục thuê; hết hạn bảo lưu mới được chủ động hoàn thành theo luồng hiện có. Lượt đã trả thông thường, đã cập nhật ngày thu hồi thực tế hoặc không khớp bằng chứng đối chiếu không được dùng ngoại lệ này.

## Tiếp tục thuê

Chọn đủ xe đang rảnh. Hạn trả cộng thời gian thực tế từ bắt đầu bảo lưu đến khi nhân viên xác nhận tiếp tục. Ví dụ bảo lưu từ 01/08 đến 01/10: hạn trả 01/10 được dời thành 01/12. Hết hạn bảo lưu mà nhân viên chưa xử lý thì tiếp tục giữ bảo lưu và dừng phát sinh; ngày thuê lại thực tế là mốc kết thúc khoảng dừng.

Giữ số kỳ và số tiền gốc. Chỉ dời các kỳ chưa phát sinh, kể cả kỳ đúng thời điểm bắt đầu bảo lưu; không cộng tiền cho khoảng dừng. Kỳ cuối đã thanh toán vẫn được kéo dài phần thời gian còn lại. Hợp đồng cũ chưa có lịch đóng tiền chỉ dời hạn trả gốc, không tự thêm gói/giá/kỳ mới. Lịch xe và xung đột xuyên cơ sở được kiểm tra trước khi bàn giao lại.

## Hoàn thành sau bảo lưu

Nhân viên nhập lý do và xác nhận khoản chưa thu không thu hồi. Hợp đồng đóng vĩnh viễn trong luồng này, ngừng theo dõi công nợ và bỏ các kỳ chưa phát sinh. Không chuyển sang Nợ xấu.

Ghi riêng **Tổn thất công nợ** bằng chênh lệch dương giữa số tiền đã phát sinh ở mốc bảo lưu và tiền thuê thực tế đã thu. Bao gồm khoản quá hạn đã phát sinh trước bảo lưu; không bao gồm thời gian bảo lưu hoặc các kỳ tương lai. Không cộng khoản này vào doanh thu đã thu, không tạo phiếu chi và không trừ lần nữa vào doanh thu thực thu. Ví dụ còn nợ đã phát sinh 3 triệu và các kỳ tương lai 10 triệu: tổn thất công nợ là 3 triệu, không phải 13 triệu.

Tổng phí cuối cùng giảm về phần thực thu, tối đa bằng phí đã phát sinh; không biến tiền thu dư thành doanh thu. Lưu tổng, lịch đóng tiền, trạng thái, người, thời điểm và toàn bộ thông tin trước khi chốt trong `lifecycle.hold_completion` và lịch sử sự kiện; số tiền không thu hồi dùng trường `waived_amount`. Các phiếu thu/chi, `orders.pid`, tiền cọc và tiền thu dư không bị sửa hoặc giả lập thanh toán. Kế toán vẫn đối chiếu tiền cọc/thu dư từ hồ sơ lịch sử; hệ thống không tự hoàn hoặc cấn trừ tiền.

Sau hoàn thành, API chặn thu thêm nợ/kỳ/phiếu thu thêm, gia hạn nhập bổ sung lịch sử và sửa lại quyết toán trả xe để tránh phát sinh lại khoản phải thu. Việc hoàn khoản tiền thực giữ thuộc đối chiếu kế toán vẫn dùng phiếu chi thật.

## Dữ liệu và kiểm chứng

Không cần migration hay cập nhật hàng loạt dữ liệu thật. Ngày kết thúc, tình trạng quá hạn lúc bắt đầu, số tiền tại mốc đó và quyền tiếp tục được lưu cùng `management_composer.lifecycle.active_hold`. Khoản thu sau ngày bắt đầu được loại khi xác định quá hạn cho thao tác nhập lùi ngày. Kết thúc bảo lưu là cảnh báo đọc, không có cron chuyển trạng thái.

`installment_plan.paused_at` phân biệt mốc bảo lưu với trả xe thông thường, tránh phát sinh kỳ đúng lúc bắt đầu bảo lưu; `stopped_at` tiếp tục khóa phát sinh. Hoàn thành lưu lịch gốc vào lịch sử, kết thúc lịch đang chạy và chốt tổng tiền; không tạo giao dịch tiền.

Kiểm tra bằng schema rollback/sequence riêng, RLS thật, các ca API phân quyền, tính tiền và giao diện Chromium/WebKit với toàn bộ API nghiệp vụ được chặn. Không tạo bảo lưu/hoàn thành, đổi tiền hoặc gửi Telegram trên hợp đồng thật trong kiểm thử.
