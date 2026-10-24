# Nợ xấu: trả xe và tất toán riêng; bảo lưu / thuê lại thuê sở hữu

Theo xác nhận của người dùng, hợp đồng đã quá hạn mới được chuyển sang Nợ xấu. Tại Chi tiết hợp đồng → **Nợ xấu / bảo lưu**:

- Chuyển Nợ xấu cần lý do, ngày giờ, xác nhận và phiên bản hiện tại. API kiểm tra lại quá hạn theo xe đang thuê hoặc kỳ thanh toán còn thiếu; không dựa riêng vào nhãn cũ trên màn hình. Không tự Blacklist khách hoặc sửa tiền/cọc/phiếu.
- Hiển thị riêng xe đã trả/thu hồi và tất toán. Thu hồi từng xe giải phóng đúng dòng xe khi không còn hợp đồng khác giữ; xe bảo dưỡng/hỏng/đã bán giữ trạng thái nghiệp vụ.
- Tất toán đọc lại tiền thuê, phí, tiền đã thu, cọc còn giữ và thu dư. Khoản chưa xác định, còn nợ, còn cọc chưa xử lý hoặc còn tiền thu dư đều chặn. Nếu vẫn giữ xe thuê sở hữu, đối chiếu cả các kỳ còn lại của hợp đồng. Nhân viên vận hành có `contracts.return` hoặc kế toán có `contracts.read` + `finance.write` xác nhận được; phiếu thu/chi vẫn theo quyền hiện có.
- Đã trả đủ xe nhưng chưa tất toán: giữ Nợ xấu. Đã tất toán nhưng chưa trả đủ xe: giữ Nợ xấu. Đủ cả hai: chuyển Hoàn thành, ghi lịch sử. Xác nhận tất toán trước rồi phát sinh khoản thiếu mới sẽ không được đóng bằng xác nhận cũ.
- Thu hồi đủ xe trong hợp đồng có lịch đóng tiền dừng phát sinh kỳ tương lai tại ngày thu hồi cuối, cùng quy tắc dừng kỳ của luồng trả xe hiện có; không xóa khoản đã phát sinh hoặc phiếu cũ.

**Bảo lưu thuê sở hữu** đã được người dùng chốt: thực tế thu xe về, dừng kỳ mới, giữ nợ/cọc cũ; thuê lại tiếp tục chính hợp đồng cũ.

- Bảo lưu cần xác nhận thu về các xe còn đang thuê; đóng dòng xe trong transaction, dừng lịch tại thời điểm bảo lưu và chuyển trạng thái `reserved` (Bảo lưu). Không tạo phiếu thu/chi hoặc Telegram.
- Khi thuê lại, chọn đủ xe còn rảnh. Có thể chọn xe khác nếu xe cũ đã cho khách khác thuê. API/RPC khóa xe và kiểm tra hợp đồng đang mở, cọc giữ xe và cả lịch sử giao nhau khi nhập ngày thuê lại trong quá khứ. Chặn trùng xe; lỗi ở xe thứ hai rollback cả lượt.
- Lịch đã có: giữ các kỳ đã phát sinh, chỉ dời kỳ tương lai và ngày kết thúc theo thời gian bảo lưu; giữ số kỳ và số tiền gốc. Có mục mở xem lịch trước xác nhận.
- Hợp đồng cũ chưa có lịch: bắt buộc nhập thời hạn, gói ngày/tuần/tháng và số tiền mỗi kỳ cho toàn bộ xe còn lại đã đối chiếu. Khoản tiền cũ được giữ thành phần riêng trong lịch; không tự đoán thời hạn/mức thu.
- Thêm dòng thuê mới trong cùng hợp đồng, giữ nguyên dòng đã trả, phiếu tiền, khách, cơ sở chủ quản và lịch sử. Dùng xe tại cơ sở khác theo phạm vi chọn xe hiện có; không tự tạo lượt điều chuyển.
- Công nợ Bảo lưu vẫn vào tổng công nợ. Báo cáo thuê sở hữu lấy số hợp đồng đang Bảo lưu từ dữ liệu ngày hiện tại; dữ liệu lịch sử chưa có snapshot giữ chưa xác định.

An toàn dữ liệu và kiểm tra:

- Endpoint mới `/api/auth/order/car-rental/:id/lifecycle`: GET chỉ đọc, POST transaction; origin/session/ID/body allowlist/revision/UUID replay/actor từ phiên. Mọi sự kiện có lý do, thời gian thực tế và thời gian ghi nhận. Xem được trong tab trạng thái và Lịch sử chỉnh sửa.
- `docs/sql/2026-10-24-contract-lifecycle.sql` chỉ thêm RPC scoped `resume_reserved_vehicles`. Đã áp dụng sau khi chạy hai lần trong schema QA; snapshot transaction xác nhận không sửa bản ghi hợp đồng, xe, tài khoản, sổ quỹ, ảnh hoặc thông báo.
- `check-contract-lifecycle.cjs`: **13 nhóm** PostgreSQL schema rollback/sequence riêng; đủ ma trận trả xe/tất toán, nhiều xe, cọc, phiếu thật trong fixture, replay sau đóng, scope cơ sở, pause/resume, legacy, nhánh admin, lịch sử giao nhau và rollback nhiều xe.
- `check-contract-lifecycle-api.cjs`: **4 nhóm**, xác thực/quyền/origin/body/read-only/rollback; kế toán được tất toán nhưng không được tự bảo lưu/thuê lại.
- Browser: **30 ca** Chromium1440×950 / WebKit390×844, admin / ownership_staff / accounting; mọi mutation là fixture, không JavaScript error. Đối chiếu lại trên bản build tách riêng trước khi phát hành.
- Hồi quy: operating-history **8**, return-refunds **30**, account-scope **25**, contract-billing **12**, contract-summary **8**, payment **4**, billing-db **3**, operating-reports **7**, management-table **10** nhóm đạt.
- API local nối DB thật: chỉ đọc bằng admin, nhân viên cơ sở, thuê sở hữu, kế toán; dữ liệu xe/tiền thống nhất, đoán ID hợp đồng ngoài cơ sở bị404, anonymous401. Không dùng hợp đồng/xe đang tạm dừng theo yêu cầu người dùng để QA.
- Build/typecheck/lint và diff check đạt trên bản phát hành riêng. Workspace có diff sửa hợp đồng song song ở một số tệp chung; chỉ phần lifecycle thuộc commit này. Không ghi đè hoặc đưa các diff riêng đó vào release.
- 21 tệp riêng/env giữ hash, `scripts/check-contract-support-ui.py` giữ 11 thêm/5 bỏ. Bằng chứng `.backups/contract-lifecycle-20261024/`, có session riêng; không in hoặc commit. Không trả xe, tất toán, bảo lưu, thuê lại, tạo tiền hay Telegram thật để QA.
