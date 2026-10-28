# Tổng thu theo phiếu trong chi tiết hợp đồng

Tab **Chi phí** tải toàn bộ lịch sử thu chi của đúng hợp đồng và hiển thị ngay tổng tiền đã thu (gồm cọc), tiền thuê/phí, tiền gia hạn, tiền cọc, khoản thu khác, tổng chi/hoàn, cọc đã hoàn/còn giữ và thu trừ chi. Bên dưới có từng phiếu: ID, ngày giờ, số tiền, nội dung, hình thức/tài khoản, người thao tác và trạng thái. Tab **Lịch sử thu chi** giữ nguyên và dùng chung dữ liệu đã tải.

Nguyên nhân thiếu số thu cũ: `orders.pid` và `orders.total` của hợp đồng nhập từ nguồn cũ có thể không bao gồm các phiếu `name=addon,type=addon` từ các lần gia hạn. Truy vấn lịch sử đã đọc những phiếu này, nhưng tab Chi phí chưa tải lịch sử, chỉ dùng số tổng hợp trên hợp đồng. Truy vấn danh sách phân trang cũng thiếu hai trường cọc đã thu/đã hoàn, dù đã join phần cọc; nay trả thêm các trường này.

`history.receipts` tổng hợp các phiếu `approved`, phân loại gia hạn bằng helper `renewalReceiptSql()` dùng chung với Sổ quỹ. Bao gồm gia hạn cũ `addon` và phiếu mới liên kết `management_contract_payments.renewal_payload`. Phiếu chờ duyệt/hủy không cộng vào tổng; chi/hoàn không làm giảm tổng thu gộp mà hiện riêng và trừ ở số thu trừ chi. Khi so sánh số thu thuê/phí với hợp đồng, trừ riêng khoản hoàn tiền thuê để không báo lệch do hoàn tiền hợp lệ. Phiếu cùng ngày, nội dung, số tiền nhưng khác ID vẫn được giữ riêng. Không đoán phiếu trùng để gộp/xóa.

Ví dụ đối chiếu: 17 phiếu đã duyệt gồm 1.500.000đ thuê, 10.750.000đ gia hạn, 500.000đ cọc → tổng thu 12.750.000đ. Số tổng hợp cũ đang ghi 2.000.000đ thuê không được coi là toàn bộ tiền khách đã trả. Màn hình báo chênh lệch và hiện công nợ cần đối chiếu thay vì kết luận 0 từ số cũ.

Đây là thay đổi đọc/hiển thị: không cập nhật tiền hợp đồng, tổng đã thu, phiếu thu, cọc, gia hạn, trạng thái xe hoặc số dư đầu kỳ. Không tính lại công nợ hay tự xác nhận tiền đã vào ngân hàng. Không cần migration. Lịch sử vẫn kiểm tra quyền đọc hợp đồng và RLS theo cơ sở. Lỗi tải lịch sử hiển thị lỗi và nút tải lại; không công bố tổng bằng 0 khi chưa tải được. Dữ liệu lịch sử gắn ID hợp đồng để không hiện nhầm số thu khi đổi hợp đồng.

Kiểm tra:

```powershell
node scripts/check-contract-receipt-summary.cjs --live-temp
npm.cmd run test:release
npm.cmd run typecheck
npm.cmd run build
python scripts/check-contract-receipt-summary-ui.py --cookie-file <local-session-file>
```

DB fixture dùng TEMP/RLS và ROLLBACK. Browser Chromium/WebKit chặn toàn bộ API ghi; kiểm tra đủ phiếu cũ/mới, giữ các ID giống nội dung, không cộng phiếu hủy, cảnh báo số cũ lệch, cọc, lỗi/thử lại và màn hình 320px. Kiểm tra dữ liệu vận hành chỉ SELECT trong transaction READ ONLY. Bằng chứng/cookie cục bộ nằm trong `.backups/contract-receipt-summary/`, không commit.
