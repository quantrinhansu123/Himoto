# Giảm timeout khi gửi Telegram

## Sự cố được kiểm tra

Lượt trả xe VPS-32090 (hợp đồng #57659, xe 89AB-725.56) đã được nhân viên xác nhận gửi lúc 19:30:29 ngày 19/10/2026. Hàng đợi ghi `unknown / TELEGRAM_TIMEOUT`, chưa có mã tin. Bảy ảnh và hai video đều còn trên Cloudinary, đúng phiên bản, tổng khoảng 9,6 MB. Đây là mất phản hồi khi gọi Telegram, không phải thiếu ảnh hoặc thiếu cấu hình nhóm Láng. Chưa có bằng chứng rằng Telegram không nhận được yêu cầu.

## Thay đổi

- Album ảnh giới hạn **4 MiB và tối đa 10 ảnh**. Mỗi video được tải riêng bằng `sendVideo`, giữ nguyên thứ tự tệp và bản gốc. Trường hợp trên sẽ gửi 7 ảnh, video thứ nhất, video thứ hai, rồi một tin tổng hợp. Đây là chính sách dung lượng của HIMOTO; Telegram cho phép album từ 2 đến 10 tệp theo [Bot API](https://core.telegram.org/bots/api#sendmediagroup).
- Tăng thời gian chờ gửi media từ 60 lên **120 giây**; tin chữ 30 giây. Phân loại lỗi bao gồm cả giai đoạn đọc JSON phản hồi. Chỉ coi thành công khi nhận đủ mã tin hợp lệ cho toàn bộ tệp trong lượt gửi.
- Mỗi lượt chạy dành tối đa 240 giây, chừa thời gian lưu kết quả trước giới hạn 300 giây của các route. Nếu không còn đủ thời gian để bắt đầu tác vụ tiếp theo, lưu các mã tin đã xác nhận và đưa chính lượt đó về `pending / DELIVERY_CONTINUE`. Worker tiếp tục từ tệp chưa gửi, hoặc chỉ gửi tin tổng hợp nếu toàn bộ media đã xong. Không gửi lại tệp đã được xác nhận.
- Giữ quyền gửi của nhóm cho lượt đang tiếp tục, kể cả khi lease hết hạn. Các lượt khác không xen giữa media và tin tổng hợp. Mỗi lần tiếp tục kiểm tra, gia hạn lease và dùng bản chụp payload gốc trong hàng đợi.
- Cron trả lời sau phần đồng bộ GPS và chạy gửi Telegram trong `after()`. Request của scheduler giới hạn 55 giây không còn phải chờ toàn bộ media được tải lên. Thời gian xử lý nền vẫn nằm trong `maxDuration=300`.
- Timeout, lỗi mạng, phản hồi không hợp lệ hoặc gửi một phần vẫn chặn tự gửi lại. Chỉ một lượt chủ động tạm dừng ở ranh giới đã có xác nhận mới được tự tiếp tục; `unknown` không nằm trong phạm vi này. Không có retry POST tự động sau timeout.

Không cần migration. Dùng `message_ids`, `error_code` và bảng `management_telegram_delivery_leases` hiện có. Không thay đổi trạng thái hoặc gửi lại lượt VPS-32090 khi triển khai. Nhân viên vẫn đối chiếu nhóm và xác nhận chưa nhận trước khi gửi lại lượt cũ.

## Kiểm tra

- `node scripts/check-telegram-delivery.cjs`: mô phỏng đúng 7 ảnh + 2 video; giới hạn byte/số tệp; timeout khi chờ header và khi đọc body; phản hồi thiếu mã tin; không retry POST; cron tách phần gửi khỏi HTTP response.
- `node scripts/check-gps-contract-integrations.cjs`: schema QA rollback, kiểm tra giữ nhóm, tiếp tục sau checkpoint, không lặp media, chỉ tiếp tục tin cuối khi cần và không tự replay timeout.
- `node scripts/check-international-media.cjs`: video riêng, đủ ảnh, nguồn media và API được mô phỏng; dữ liệu thử trong bảng tạm rồi rollback.
- Typecheck, lint và production build. Lint có cảnh báo sẵn tại `StaffOrganizationChart.tsx:58`; phần gửi Telegram không phát sinh cảnh báo mới.

Các kiểm thử không gửi Telegram thật và không gọi nhà cung cấp GPS. Lỗi mạng/Telegram vẫn có thể xảy ra; thay đổi này giảm kích thước mỗi request, tăng khoảng chờ media và tránh mất tiến độ khi hồ sơ lớn, không bảo đảm mọi lượt gửi luôn thành công.
