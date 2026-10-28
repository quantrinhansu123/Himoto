# Telegram: số tiền theo từng hình thức thanh toán

Nội dung thuê xe / giao xe / cọc giữ xe ghi thêm số tiền theo từng hình thức từ phiếu đã duyệt:

```text
Đã thu tiền thuê / phí: Tiền mặt: 10.000 đ · CK TK cá nhân: 130.000 đ
Đã thu tiền cọc: Tiền mặt: 200.000 đ · CK TK công ty: 300.000 đ
```

Gia hạn chỉ tổng hợp các phiếu của đúng phiên bản/lần gia hạn. Trả xe tách thu phí/công nợ, hoàn cọc và hoàn tiền thuê theo phiếu liên kết của lượt trả. Đổi pin dùng phiếu của lượt đổi pin. Các nhóm rỗng không hiện dòng “đã thu”. Không suy số tiền thực thu từ phí hợp đồng hoặc hình thức dự kiến trong bản nháp.

`NotificationPayload.payment_amounts` lưu các nhóm `{method,amount}`. Phiếu cùng hình thức được cộng; tiền mặt, CK cá nhân, CK công ty giữ riêng. Dữ liệu trộn TM/CK trong một phiếu cũ chưa có số tách được ghi rõ “Tiền mặt + CK (chưa tách số tiền)”, không đoán tỉ lệ. Thiếu/sai số tiền gây lỗi tải, không công bố số đã thu sai.

Hợp đồng mới có `management_composer.finalized.transaction_ids`: nội dung thuê ban đầu chỉ dùng các phiếu đó để các lần gia hạn sau không lọt vào phần tách tiền thuê ban đầu. Các hợp đồng cũ chưa có danh sách ID dùng tập phiếu thuê/cọc hiện có như trước. Không đổi số tiền, phiếu, số dư hay trạng thái hợp đồng; không cần migration.

Bản xem trước tải lại phần tách tiền. Lịch sử tin đã gửi giữ snapshot cũ; chỉ nâng cấp mẫu hiển thị không mở khóa gửi trùng tin cũ. Hash của snapshot mới bao gồm số tiền từng hình thức để nhận diện một lần sửa tách tiền thực sự. Các lượt đang gửi/mất phản hồi/gửi dở vẫn dùng luồng xử lý hiện có; không tự tạo lượt gửi, sửa hoặc thu hồi tin Telegram.

Kiểm tra:

```powershell
node --require ./scripts/lib/offline-tests.cjs scripts/check-telegram-payment-amounts.cjs
node scripts/check-telegram-payment-amounts.cjs --live-read
node scripts/check-gps-contract-integrations.cjs --telegram-controls-only
npm.cmd run typecheck
npm.cmd run build
```

Kiểm tra tích hợp dùng schema riêng và ROLLBACK, Telegram được giả lập. `--live-read` chỉ SELECT trong transaction READ ONLY để đối chiếu HĐ 005506: TM 10.000đ, CK cá nhân 130.000đ; lượt đã gửi vẫn `unchanged=true,can_send=false`. Không gửi Telegram thật, không sửa phiếu. Bằng chứng cục bộ tại `.backups/telegram-payment-amounts/`.
