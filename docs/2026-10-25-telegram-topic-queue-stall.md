# Telegram bị kẹt khi trả xe 005584

## Đối chiếu chỉ đọc ngày 25/10/2026

- Hợp đồng 005584, order 57851, CS Hà Đông đã `completed`; dòng xe 62698 đã trả lúc 17:59 ngày 25/10 (giờ Việt Nam). Lượt Telegram được nhân viên xác nhận lúc 18:00:23, còn `pending`, đủ 6 ảnh và 1 video, chưa có mã tin hoặc lần gọi Telegram.
- Hợp đồng 005593, order 57979, đang `pending / DELIVERY_CONTINUE`, đã lưu 13/18 mã tệp. Lease nhóm Hà Đông hết hạn lúc 17:01 nhưng vẫn giữ vị trí để media và tin tổng hợp không bị xen giữa. Lượt này chặn 005584 và 005983 trong cùng nhóm.
- Bộ chạy nền `management_integration_schedule.enabled=false`, lần phản hồi cuối là HTTP 401 lúc 18:24:44 ngày 23/10. Cron vẫn được lập lịch nhưng hàm trả về ngay khi disabled. Khóa Vault khớp khóa suy ra từ môi trường local; chưa xác minh lại xác thực production hiện tại.
- Khi mở lại 005584, API cũ chỉ dispatch order 57851; không thể tiếp tục lease của order 57979. Vì vậy tải lại hoặc đăng nhập lại không giải quyết được.

## Bản sửa

- Dispatcher tìm lượt đang giữ đúng chat/topic của các giao dịch được yêu cầu. Có thể tiếp tục lượt chặn thuộc hợp đồng khác, dùng nguyên payload, nhóm nhận và mã tệp đã xác nhận.
- Lượt `DELIVERY_CONTINUE` chỉ gửi phần còn lại. Lượt `DELIVERY_IN_FLIGHT` mất worker chuyển sang `unknown`, không tự gửi lại yêu cầu chưa rõ kết quả, sau đó nhả nhóm cho lượt chờ.
- Lease còn hạn ngăn mọi worker khác chiếm cùng lượt, kể cả continuation. Checkpoint chủ động hết hạn lease để worker sau tiếp tục ngay; vẫn giữ quyền ưu tiên trong nhóm cho đến khi hoàn tất.
- Không cần migration. Không sửa nghiệp vụ trả xe, ảnh/video, số tiền hoặc trạng thái hàng đợi thật trong lần kiểm tra này.

## Xác minh

- Bản SELECT chỉ đọc của truy vấn mới, với order được yêu cầu 57851, chọn đúng lượt chặn 57979 có 13 mã tệp; thời gian truy vấn đo được 72 ms.
- Kiểm thử hồi quy trong `scripts/lib/check-telegram-media-first.cjs`: tiếp tục 5/18 tệp và tin tổng hợp, bảo toàn 13 mã cũ, lượt trả xe gửi sau đó; không gọi nhóm không liên quan; không chiếm lease còn hạn; không tự replay lượt in-flight.
- Lệnh chạy riêng: `node scripts/check-gps-contract-integrations.cjs --telegram-media-first-only`. Dữ liệu QA nằm trong schema riêng, rollback; Telegram và media dùng fixture.
- Đã đạt: 5 nhóm `check-telegram-delivery.cjs`, 46 nhóm integration GPS/Telegram (bao gồm các ca hồi quy mới), TypeScript, ESLint source và production build. Các kiểm thử không gửi Telegram thật hoặc ghi nghiệp vụ thật.

## Trạng thái triển khai

Người dùng đã xác nhận triển khai và chạy tiếp hàng đợi ngày 25/10/2026. Kiểm tra Vercel đúng SHA trước khi bật lại bộ chạy nền. Sau khi bật, kiểm tra phản hồi xác thực và kết quả từng lượt, không đánh dấu `sent` thủ công hoặc xóa lease để bỏ qua 13 tệp đã gửi. Kết quả vận hành được lưu riêng trong `.backups/telegram-queue-20261025/`.
