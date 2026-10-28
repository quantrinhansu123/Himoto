# Sửa thanh toán gia hạn

Nút **Sửa thanh toán** nằm dưới bản xem trước Telegram của giao dịch gia hạn và trong **Thanh toán / Lịch sử phiếu Thu / Chi**, tại phiếu thu gia hạn. Mở nút, chọn hình thức và tài khoản thực nhận, nhập lý do rồi bấm **Lưu sửa thanh toán**. Khi gia hạn có nhiều phiếu, chọn đúng phiếu cần sửa.

Cho phép Tiền mặt, CK tài khoản cá nhân và CK tài khoản công ty. Két và tài khoản cá nhân phải đang hoạt động tại cơ sở hợp đồng; tài khoản công ty đang hoạt động dùng theo quy tắc thu hiện có. Tài khoản có quyền gia hạn hoặc quyền đọc hợp đồng và ghi tài chính được sửa trong phạm vi cơ sở của mình.

`PATCH /api/auth/order/car-rental/[id]/renewal-payments` chỉ nhận UUID lần sửa, ID/revision phiếu, hình thức, tài khoản và lý do. Server khóa hợp đồng, phiếu và tài khoản, kiểm tra phiếu gia hạn đã duyệt và RLS, rồi cập nhật cùng phiếu thu. Không tạo/xóa phiếu, không đổi tiền, ngày thu, người thu gốc, cọc, kỳ gia hạn, trạng thái hay vị trí xe. Không sửa hash/UUID của lần thu gốc. Sổ quỹ, số dư tài khoản và bảng VAT đọc lại từ phiếu đã sửa.

Hồ sơ `management_composer.payment_corrections` lưu UUID/hash, thời điểm, người sửa, lý do, số phiếu, số tiền và tài khoản/hình thức trước–sau. Lịch sử hợp đồng hiển thị bản sửa. Lặp lại cùng UUID/nội dung trả về trạng thái hiện có; dùng UUID cho nội dung khác bị chặn. Phiếu thay đổi revision cần tải lại.

Bản xem trước Telegram được tải lại sau sửa. Không tự gửi, thu hồi hay sửa tin đã gửi. Lượt đang chờ gửi/đang gửi/mất phản hồi/gửi dở hoặc đang thu hồi phải xử lý xong trước khi sửa; tin đã gửi vẫn giữ trong lịch sử và dùng luồng thu hồi/gửi lại hiện có khi cần.

Không cần migration. Không dùng xóa phiếu hay tạo lại gia hạn để đổi hình thức nhận tiền.

Kiểm tra:

```powershell
node scripts/check-renewal-payment-corrections.cjs --live-temp
node scripts/check-contract-payments.cjs --live-temp
npm.cmd run test:release
npm.cmd run typecheck
npm.cmd run build
python scripts/check-renewal-payment-corrections-ui.py --cookie-file <local-session-file>
```

DB tests dùng TEMP và ROLLBACK, gồm vai trò PostgreSQL có RLS để kiểm tra cơ sở khác. Browser chặn toàn bộ API và giả lập PATCH/mất phản hồi, không ghi tiền hoặc gửi Telegram thật. Cookie và ảnh kiểm tra nằm trong `.backups/`, không commit.
