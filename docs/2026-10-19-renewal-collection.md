# Gia hạn, ghi nhận thu và hoàn cọc

## Đối chiếu sự cố

VPS-32031 đã được gia hạn lúc 10:58 ngày 19/10/2026: tăng phí 140.000đ,
dời hạn trả sang 09:50 ngày 20/10. Tại thời điểm đó chưa có phiếu thu 140.000đ.
Khoản còn thiếu trên ảnh là công nợ thuê, không phải phí quá hạn.

Nhân viên đã tự tất toán lúc 21:01: thu 140.000đ và hoàn 1.000.000đ cọc.
Hợp đồng hiện hoàn thành, không còn công nợ/cọc giữ; không sửa hay phát lại
các giao dịch này.

## Thay đổi

- Người có quyền gia hạn phải chọn rõ đã thực nhận hoặc chưa nhận phí gia hạn.
  Cơ sở có thể ghi đúng khoản thu của lần gia hạn; quyền ghi phiếu tài chính
  chung vẫn giữ nguyên.
- Ngày trả, phí, phiên bản và phiếu thu tùy chọn dùng một giao dịch PostgreSQL.
  Lỗi tài khoản hoặc lỗi lưu phiếu thu sẽ hủy toàn bộ lượt gia hạn.
- UUID và dấu vân tay nội dung ngăn một lần thử lại tạo thêm phiên bản/phiếu thu.
  Thông báo Telegram được chuẩn bị sau phiếu thu, trong cùng giao dịch;
  thử lại không tạo thêm sự kiện. Không tự gửi Telegram trong kiểm thử.
- Chưa nhận tiền vẫn ghi công nợ. Khi chưa thể hoàn cọc, giao diện nêu rõ
  số tiền chưa ghi nhận và phân biệt gia hạn với thu tiền.
- Không thay đổi điều kiện hoàn cọc: nhận đủ xe, thu đủ nợ và đủ thông tin hoàn.

Không cần migration, không sửa dữ liệu tài chính lịch sử.
Kết nối IOPGPS đang dùng được giữ nguyên; không bổ sung hay kích hoạt Open API.

## Kiểm tra

`node scripts/check-renewal-collection.cjs` kiểm tra trong bảng TEMP và rollback:
thu cùng gia hạn, liên kết đúng phiên bản/tài khoản, thử lại, nội dung xung đột,
rollback sau khi chèn phiếu thu, tài khoản khác cơ sở, trả trước hạn mới,
hoàn cọc sau thu đủ và chặn hoàn khi chưa thu.

`python -X utf8 scripts/check-renewal-collection-ui.py --branch-cookie-file <file>`
dùng phiên cơ sở và chặn toàn bộ API bằng dữ liệu QA: Chromium 1440px,
WebKit 390px, đã thu/chưa thu, không có POST thanh toán tách rời.

Kiểm tra bổ sung: thanh toán hợp đồng, 26 nhóm GPS/Telegram, TypeScript,
lint và bản build production. Chỉ có cảnh báo lint cũ tại
`StaffOrganizationChart.tsx:58`.
