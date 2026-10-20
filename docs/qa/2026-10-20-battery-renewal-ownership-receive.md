# Thuê pin, ghi chú gia hạn sở hữu và quyền nhận xe

## Hành vi

- Hợp đồng pin / sạc đang thuê có **Gia hạn pin / sạc** theo tháng hoặc ngày, gợi ý phí từ đơn giá cùng đơn vị. Nhân viên kiểm tra ngày kết thúc và phí thực tế, chọn rõ đã thực nhận hoặc chưa nhận tiền.
- Thu ngay: ngày kết thúc, lịch sử và phiếu `battery:renewal` lưu trong cùng transaction. Chưa thu: ghi công nợ riêng cho đúng lượt gia hạn. **Lịch sử / Thu gia hạn** cho phép thu sau, kể cả từng phần; không dời hạn lần nữa hoặc dùng cọc để bù nợ.
- **Trả pin / sạc** yêu cầu xác nhận đã nhận tài sản và thời điểm nhận lại. Giữ hạn hẹn trả trong hợp đồng, lưu thời điểm thực tế trong lịch sử. Giữ tiền cọc và nợ chưa thu để đối chiếu riêng trong Sổ quỹ. Không gia hạn hợp đồng đã trả/hủy; vẫn được thu nợ của hồ sơ đã trả.
- UUID chống lưu/thu trùng; cùng UUID khác nội dung bị chặn. Revision chặn bản cũ. Tài khoản nhận phải hoạt động, đúng phương thức và cơ sở; không tự đổi hình thức khi thiếu tài khoản.
- Giá thuê theo kỳ, số đã thu nhập từ app cũ và cọc giữ nguyên. Sửa hồ sơ sau gia hạn không phát sinh thu lại. Xóa phiếu gia hạn trong Sổ quỹ giảm đúng tiền đã thu và mở lại khoản nợ liên kết, giữ phí và lịch sử gia hạn.
- Ghi chú gia hạn xe xuất hiện trong bản xem trước và tin Telegram của **Thuê sở hữu**, theo cùng phân loại đang dùng để định tuyến nhóm. Giữ nguyên nội dung như `57/180N` và xuống dòng. Các mảng khác giữ mẫu hiện tại. Tin cũ đã gửi không mở lại chỉ vì thêm ghi chú vào mẫu; gửi mới vẫn cần nhân viên chủ động bấm gửi.
- Vai trò mặc định `ownership_staff` có thêm `vehicles.receive`. Tài khoản hiện có `nv.thuesohuu` (#156, cơ sở #35) đã được bổ sung đúng quyền này, có bản chụp trước thay đổi và audit. Không cấp chuyển xe, phát hành, quyền tiền hoặc phạm vi toàn hệ thống.
- Xe `20AA-903.64` (#1336), lượt chuyển #341 từ Nguyễn Hoàng (#32) sang Thuê sở hữu (#35), vẫn `in_transit`. Nhân viên cơ sở đích tự xác nhận nhận xe thực tế; QA không nhận hộ.

## Dữ liệu và migration

`docs/sql/2026-10-20-battery-contract-actions.sql` thêm `battery_contracts.workflow_history` JSONB, mặc định mảng rỗng. API chỉnh sửa hồ sơ không nhận trường lịch sử từ client. RLS của chính hợp đồng tiếp tục bảo vệ lịch sử. Thao tác gia hạn dùng cùng thứ tự khóa bảng với tạo/sửa hợp đồng.

Migration bổ sung và quyền nhận xe đã áp dụng. Không nhập lại dữ liệu cũ, không tạo phiếu tiền khách hàng và không gửi Telegram thật trong QA. Bản chụp quyền và kết quả UI: `.backups/ownership-support-20261020/` (Git ignored).

## Kiểm tra

- `node scripts/check-battery-contracts.cjs --live-temp`: 13 nhóm, bảng TEMP và rollback.
- `node scripts/check-account-scope.cjs`: 18 nhóm, schema QA và rollback; có gia hạn pin/phiếu thu dưới RLS thật và chặn ID cơ sở khác.
- `node scripts/check-gps-contract-integrations.cjs`: 27 nhóm đạt trước khi tích hợp 6 commit mới từ `origin/main` (#2fdbad9). Sau tích hợp, suite đầy đủ dừng ở kiểm tra ảnh snapshot trong `scripts/lib/check-contract-telegram.cjs`: commit #66e171f chuyển sang lưu tham chiếu và tải ảnh khi gửi, trong khi test yêu cầu ảnh nguyên bản tại lúc xếp gửi. Không tuyên bố suite đầy đủ đạt trên bản cuối. Dùng `--ownership-only` để chạy riêng định tuyến/ghi chú Thuê sở hữu với các API Telegram mô phỏng; chế độ mặc định vẫn giữ nguyên mọi assertion ảnh.
- `node scripts/check-vehicle-transfers.cjs`: 9 nhóm, TEMP và rollback.
- `node scripts/check-gps-contract-integrations.cjs --ownership-only`: **10 nhóm đạt sau tích hợp**, gồm đúng nội dung ghi chú, định tuyến sở hữu, chống gửi trùng và điều chuyển/nhận xe. Không gọi Telegram thật.
- Typecheck, lint và production build bản cuối sau tích hợp đạt. Các cảnh báo có sẵn trên main: `ManagementPage.tsx:110` (2) và `StaffOrganizationChart.tsx:58` (1).
- Bộ phân quyền được bổ sung các migration hỗ trợ kho/hợp đồng hiện hành trong schema QA. Assertion mẫu Telegram trả xe sửa tên trường thành “Hình thức hoàn cọc” cho khớp hành vi đã triển khai trước đợt này.
- API chỉ đọc với tài khoản cơ sở thật xác nhận quyền nhận xe, hồ sơ pin cơ sở #35 và 404 khi cơ sở khác đoán ID.
- UI trên production build local: **12 tình huống đạt**, Chromium desktop và WebKit iPhone, `errors=[]`; mọi API ghi được mô phỏng. Bộ test chờ tải xong danh sách sau khi lưu trước khi chuyển trang để không hủy request giả lập giữa chừng trên WebKit.

File test production cũ `scripts/check-contract-support-ui.py` đang sửa từ phiên trước được giữ nguyên, không thuộc thay đổi này.
