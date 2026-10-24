# Tính giá toàn hợp đồng, thu hồi xe nợ xấu và nhập bổ sung — 24/10/2026

## Phạm vi và dữ liệu đã đối chiếu

- Người dùng yêu cầu giá nhập là giá cho toàn bộ xe: hai xe, ba ngày, giá 470.000 đồng/ngày phải là **1.410.000 đồng**, không nhân thêm hai xe.
- Đọc dữ liệu thật chỉ đọc: bản nháp ID 57872 có hai xe, từ 23/10 12:30 đến 26/10 12:30, giá 470.000 và tổng cũ 2.820.000. Không sửa/phát hành bản nháp thật để QA; mở lại nháp sẽ tính theo logic mới, người dùng kiểm tra rồi lưu.
- Tra trực tiếp app cũ bằng kết nối chỉ đọc: biển **29G1-742.69**, Honda Vision 2018, ID 777. App mới đã có đúng ID, số khung và số máy nhưng biển bị đổi thành `650.50`. Theo yêu cầu người dùng đã sửa **hồ sơ hiện có** qua API xe, không tạo xe trùng. Có một lịch sử chỉnh sửa; mọi trường khác của xe giữ nguyên, không ghi giao dịch tiền. Bằng chứng riêng: `.backups/operating-fixes-20261024/vehicle-777-before.json`, `vehicle-777-after.json`, `legacy-query-output.json`.
- Không tự thay cơ sở hay trạng thái xe theo nguồn cũ vì xe đã có lịch sử vận hành mới.

## Thay đổi

### Giá thuê

- `rentalQuote`: giá × số kỳ, không nhân số xe. Phí khác và cọc vẫn riêng một lần theo hợp đồng.
- Nhãn và công thức trên form nói rõ giá cho toàn bộ xe. Mở lại bản nháp giữ giá đã thỏa thuận; giá danh mục tải muộn không đè giá đã lưu.
- Kiểm tra server khi phát hành dùng cùng công thức. `hiring_fee` chia đều cho từng xe, phần lẻ đồng phân bổ đúng một lần; 470.000 thành 235.000 + 235.000. Gia hạn/trả xe dùng đúng giá dòng xe.
- Hợp đồng đã phát hành giữ tổng đã ghi nhận, không tự sửa lịch sử tiền.

### Thu hồi xe nợ xấu

- Chi tiết hợp đồng nợ xấu có **Thu hồi xe nợ xấu**. Cần chọn xe, ngày giờ thực tế thu về, ghi chú và xác nhận xe đã về.
- API riêng `/api/auth/returns/recover`, dùng quyền `contracts.return`, kiểm tra origin/session, phạm vi hợp đồng, revision, ngày giờ và request ID.
- Chỉ đóng dòng xe vật lý; giữ nguyên trạng thái nợ xấu của hợp đồng, tổng tiền, đã thu, cọc và phiếu thu/chi. Lưu thời điểm thực tế, thời điểm nhập, người nhập, ghi chú và mã chống ghi lặp trong hồ sơ; hiển thị ở lịch sử hợp đồng.
- Gỡ trạng thái xe `using`/`rent`/`bad_debt` về Lưu kho khi không còn hợp đồng khác giữ xe. Không ghi đè bảo dưỡng/hỏng/đã bán, không thay cơ sở, không tự gửi Telegram.
- Danh sách trả xe thông thường vẫn không đưa xe nợ xấu vào luồng tính phí/trả cọc thông thường.

### Nhập bổ sung giao dịch

- Nút **Nhập bổ sung giao dịch** ở trang hợp đồng và Thao tác nhanh; hiện các lựa chọn theo quyền hiện có.
- **Hợp đồng bị quên:** nhập ngày thuê/hẹn trả thật, lý do; chọn còn đang thuê hoặc đã trả xe từ trước. Giao dịch đã trả cần ngày trả thật. Khi phát hành lịch sử, kiểm tra chồng lịch thuê cả cơ sở khác, ghi dòng xe đã hoàn thành và giữ kho hiện tại. Chưa thu đủ tiền thì chờ tất toán; đã thu đủ thì hoàn thành.
- **Gia hạn bị quên:** tìm cả hợp đồng đã trả xe. Ngày gia hạn thực tế phải thuộc lượt thuê, không sau ngày trả thực tế/hẹn trả mới. Lưu thời gian phát sinh riêng với thời gian nhập, phí vào đúng hợp đồng; không đổi `completed_at` hoặc kho hiện tại. Có chọn đã nhận tiền/chưa nhận tiền và ngày thu thực tế riêng.
- **Khoản thu/chi bị quên:** tìm hợp đồng đã có, kể cả hoàn thành; chọn đúng nghiệp vụ (nợ tiền thuê, cọc còn thiếu, thu thêm, hoàn cọc/hoàn thuê đủ điều kiện), tài khoản và ngày thực tế. Cần ghi chú/xác nhận đã đối chiếu lịch sử, không mở QR yêu cầu chuyển khoản mới trong chế độ nhập bù.
- Bổ sung phiếu cọc chỉ tăng cọc/đã thu chung, không giảm nợ thuê hoặc tăng tổng tiền thuê. Giới hạn theo phần cọc còn thiếu. Thu nợ hợp đồng hoàn thành vẫn được giới hạn đúng phần còn thiếu. Phiếu dùng UUID/revision và transaction hiện có để tránh ghi lặp.
- Nhập lịch sử không sửa/xóa chứng từ cũ hoặc tự suy diễn khoản đã thu.

### Tìm xe

Kho toàn hệ thống tìm biển không phân biệt dấu chấm, gạch nối hoặc khoảng trắng, đồng nhất với ô chọn xe. Hồ sơ ID 777 được tìm bằng biển đúng sau sửa.

## Kiểm tra

- Typecheck, lint các tệp thay đổi, build và `git diff --check`: đạt. Build có cảnh báo cấu hình plugin Next ESLint tồn tại từ trước.
- `check-multi-vehicle-pricing.cjs`: 7 nhóm đạt, có ví dụ 470.000 × ba ngày và chia lẻ đồng.
- `check-contract-finalize.cjs --live-temp`: 15 nhóm đạt, gồm phát hành lịch sử, giữ kho và từ chối chồng lịch.
- `check-contract-payments.cjs --live-temp`: 16 nhóm, gồm phiếu cọc bổ sung đúng ngày/giữ nợ thuê/giới hạn và replay; gia hạn lịch sử + khoản thu cũ cùng transaction, khôi phục hoàn thành khi thu đủ, không đổi ngày trả thực tế và không ghi lần hai.
- `check-contract-renewals.cjs --live-temp`: 5 nhóm đạt, gồm gia hạn lịch sử đã trả xe và ngày phát sinh không hợp lệ.
- `check-contract-drafts.cjs`: 8 nhóm hồi quy đạt.
- `check-account-scope.cjs`: 24 nhóm quyền/RLS đạt; `check-return-refunds.cjs`: 30 nhóm hồi quy trả xe/hoàn cọc/hoàn thuê đạt; `check-contract-history.cjs`: 6 nhóm phân trang/lịch sử đạt.
- `check-operating-history.cjs`: 8 nhóm đạt trong schema rollback, dùng role `himoto_scoped` và RLS. Kiểm tra giữ nợ cũ, gỡ xe ở kho cơ sở khác qua hàm có bảo vệ, không gỡ hợp đồng khác, không đổi bảo dưỡng, scope/revision, chồng lịch cơ sở khác, lịch sử trả xe và migration idempotent. Không dùng sequence nghiệp vụ thật.
- `check-multi-vehicle-pricing-ui.py`: 6 ca đạt, Chromium 1440×1000 và WebKit 390×844. Mở lại giá thủ công, thay số xe/ngày/giá/phí, lưu/mở lại nháp và màn hình xác nhận tiền đúng.
- `check-operating-history-ui.py`: 12 ca đạt, Chromium 1440×950 và WebKit 390×844. Ghi nhận thu hồi lỗi/thử lại cùng mã, mở form hợp đồng lịch sử, gia hạn xe đã trả, bổ sung cọc/hoàn cọc/nợ đúng ngày và xác nhận.
- Không có lỗi JavaScript trong hai bộ browser. Toàn bộ API ghi ở browser bị chặn bằng fixture: không thu/chi, phát hành, thu hồi/trả xe hoặc gửi Telegram thật để QA.

## Triển khai và bảo toàn

Hai migration mới `2026-10-24-bad-debt-recovery.sql` và `2026-10-24-contract-history-backfill.sql` đã được thử trong schema rollback trước, sau đó áp dụng định nghĩa bốn hàm có kiểm tra scope. Không đổi hàng nghiệp vụ trong migration. Snapshot định nghĩa trước/sau và hash SQL lưu riêng tại `.backups/operating-fixes-20261024/feature-functions-*.json`.

Giữ nguyên 21 tệp riêng bằng SHA-256, gồm `.env*` và diff riêng `scripts/check-contract-support-ui.py` (11 thêm/5 bỏ). Không stage/chạy SQL riêng có sẵn `docs/sql/2026-10-23-vehicle-soft-delete.sql`. Không đưa cookie, dữ liệu khách hoặc thông tin kết nối vào Git.

Bằng chứng local/production và trạng thái Vercel đúng SHA sẽ được lưu trong `.backups/operating-fixes-20261024/`; thư mục có phiên đăng nhập và dữ liệu riêng, không in/commit.
