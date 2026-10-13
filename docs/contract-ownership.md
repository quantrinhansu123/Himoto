# Thuê sở hữu: thu theo kỳ

Theo yêu cầu ngày 2026-10-13, khi ký thu cọc và khoản thuê đầu tiên; không thu gộp toàn bộ thời hạn sở hữu.

- Chọn **Thuê sở hữu** trong Loại hợp đồng. Form mới hoặc nháp ở cơ sở **CS Thuê sở hữu** mặc định loại này; người nhập có thể chọn lại rõ ràng.
- Thời hạn sở hữu phân nhóm **6 / 12 / 24 tháng / Thời hạn khác**. Chọn nhóm gợi ý ngày kết thúc theo tháng lịch từ ngày bắt đầu; ngày kết thúc tự nhập được phân nhóm lại theo thời hạn thực tế. Phân loại lưu cùng nháp, có bộ lọc trên danh sách và hiển thị trong chi tiết. Tần suất đóng tiền vẫn chọn riêng theo ngày/tuần/tháng/tùy chọn.
- Kỳ đóng tiền gồm ngày, tuần, tháng và **Tùy chọn ngày hẹn và số tiền**. Lịch tùy chọn kê các khoản sau khoản đầu tiên, ngày hẹn tăng dần và trước ngày hết hạn.
- Đơn giá là tiền thuê của một kỳ; với lịch tùy chọn, đây là tiền thuê thu lần đầu. Phí khác tính một lần; cọc tách khỏi tiền thuê và công nợ.
- Ví dụ 13/10/2026 09:00–13/10/2027 09:00, tháng 3 triệu và cọc 3 triệu: form/xác nhận đề nghị thu **6 triệu**, gồm cọc 3 triệu và kỳ đầu 3 triệu. Lịch gồm **12 kỳ/36 triệu** tiền thuê, không thành công nợ 36 hoặc 39 triệu lúc ký.
- Tháng tính theo lịch và neo vào ngày bắt đầu; ngày cuối tháng được kẹp cho tháng ngắn rồi khôi phục ngày neo ở tháng tiếp theo. Ngày kết thúc là ranh giới loại trừ: nếu hợp đồng kéo dài thêm sang kỳ mới, lịch hiện thêm kỳ đó để người nhập kiểm tra.
- Khi lưu chính thức, server kiểm tra tiền thuê ban đầu bằng một kỳ cộng phí, tự sinh và lưu lịch trong `draft_payload.management_composer.installment_plan`. Nháp chưa đủ thông tin vẫn lưu được; phát hành từ chối lịch hoặc số tiền sai.
- Công nợ và thanh toán chỉ cộng các kỳ đã đến ngày hẹn, trừ tiền thuê thực nhận. Cọc không bù nợ. Thu thiếu/trả chậm giữ ngày hẹn chưa thanh toán đầu tiên; phiếu thu dư vượt khoản đến hạn bị chặn.
- Thu tiền kỳ tiếp theo bằng **Thu công nợ còn thiếu**, không ghi thành phí gia hạn. Phí khác/thu thêm vẫn có phiếu riêng. Thuê sở hữu không dùng nghiệp vụ gia hạn thuê thường để cộng kỳ hoặc đổi thời hạn.
- **Đến hạn đóng tiền** trong menu và nhắc trên danh sách hợp đồng hiển thị khoản đến hẹn chưa đóng đủ. Khi trang đang mở, mốc đến hạn được cập nhật mỗi phút; đóng đủ thì khoản đó hết nhắc, kỳ kế tiếp theo lịch ban đầu. Đây là nhắc trong app.
- Trả toàn bộ xe dừng phát sinh kỳ mới tại thời điểm trả, giữ công nợ các kỳ đã đến hạn. Điều chỉnh giảm tiền thuê khi trả sớm cần đối chiếu riêng, không trừ tự động vào kỳ đầu.
- Bản in có phụ lục lịch ngày hẹn/số tiền; vẫn chỉ có một khối chữ ký chung tại phụ lục hợp đồng. Hợp đồng đã phát hành từ trước không được tự chuyển sang lịch sở hữu chỉ vì thuộc cơ sở sở hữu.

Kiểm tra: `npm.cmd run test:contract-billing`, `node scripts/check-contract-billing-db.cjs` (bảng PostgreSQL TEMP, rollback, không ghi nghiệp vụ thật), các kiểm tra hợp đồng/thu tiền/lưu chính thức, typecheck, lint và build.

Browser QA: `python -X utf8 scripts/check-contract-billing-ui.py --url http://127.0.0.1:3005 --session-cookie-file <cookie-file> --output .backups/ownership/ui`. Dùng phiên QA hợp lệ; toàn bộ API nghiệp vụ được mô phỏng, không ghi dữ liệu thật. Kiểm tra số tiền thu ban đầu cho tháng/ngày/tuần/tùy chọn, phụ lục in, thu thiếu rồi thu đủ, nhắc kỳ kế tiếp và thẻ công nợ trên điện thoại.
