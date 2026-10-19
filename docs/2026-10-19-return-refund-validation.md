# Xác nhận trả xe và hoàn cọc

Hợp đồng `261018-0003` đã trả xe lúc 20:47 ngày 19/10/2026, nhưng không có
phiếu hoàn; còn giữ 1.000.000đ. Người dùng xác nhận chưa hoàn tiền thực tế.
Không tạo giao dịch bù, không sửa lịch sử hay gửi lại Telegram cho hợp đồng này.

Lỗi xác nhận được trong mã: khi có ảnh QR, giao diện chấp nhận thông tin người
nhận nhập bổ sung chưa đầy đủ, nhưng bộ phân tích API lại từ chối một số tổ hợp
ngân hàng/tên. STK có dấu chấm phân nhóm cũng bị từ chối. Không có payload của
lượt nhập cũ để khẳng định nhân viên đã gặp chính xác tổ hợp nào.

Thay đổi:

- Dùng chung quy tắc chuẩn hóa STK giữa giao diện và API, giữ số 0 đầu,
  chấp nhận dấu chấm/khoảng trắng phân nhóm; ký tự khác không hợp lệ vẫn bị chặn.
- API kiểm tra đủ thông tin người nhận cùng ảnh QR trong giao dịch trả xe.
  Có QR thì các ô nhập bổ sung là tùy chọn; STK được nhập vẫn phải hợp lệ.
- Khi trả hết xe và còn cọc, phải chọn rõ đã hoàn hoặc chưa hoàn. Chọn đã hoàn
  phải có nguồn chi, số tiền và người nhận/QR hợp lệ; chọn chưa hoàn lưu
  `refund_deferred` trong lịch sử quyết toán, giữ cọc và không tạo phiếu chi.
- Chặn xác nhận khi chưa tải được thông tin tiền; kiểm tra trạng thái chặn riêng
  từng hợp đồng khi trả nhiều hợp đồng. Không được bỏ qua khoản hoàn chưa hợp lệ.
- Telegram dùng số tiền/hình thức của phiếu chi thật; thông tin người nhận một
  phần không tạo chữ `undefined`. Không tự gửi Telegram trong kiểm thử.

Không cần migration. Không thay đổi quyền ghi phiếu tài chính chung.

Kiểm tra: `node scripts/check-return-refunds.cjs` dùng TEMP/rollback;
`node scripts/check-counter-workflow.cjs`; `node scripts/check-renewal-collection.cjs`;
`python -X utf8 scripts/check-return-refunds-ui.py --branch-cookie-file <file>`
chặn toàn bộ API bằng dữ liệu QA trên Chromium 1440px/WebKit 390px;
TypeScript, lint và production build.
