# Nhập thủ công nguồn khách và NVKD

Nguồn khách là ô nhập tự do, danh sách chỉ gợi ý. NVKD ghi nhận doanh số cũng cho phép nhập họ tên chưa có hồ sơ nhân sự, kể cả khi API gợi ý lỗi. Lưu `sales_staff_name` trong dữ liệu hợp đồng; chỉ giữ `sales_staff_id` khi chọn/khớp duy nhất một nhân viên trong danh sách. Đổi tên sang giá trị khác hoặc xóa ô sẽ bỏ ID cũ. Tên NVKD nhập riêng không bị thay thế khi đổi nguồn khách.

Tên nhập tay được giữ qua lưu nháp, phát hành, sửa hồ sơ và mở lại. API giới hạn tên NVKD 191 ký tự; ID có gửi lên vẫn phải là nhân viên đúng bộ phận đang hoạt động, tên được lấy từ hồ sơ nhân sự. Không tự tạo nhân sự hoặc ghép tên nhập tay với một ID. Sửa nguồn khách trên hợp đồng đã phát hành cập nhật cả hồ sơ và cột nguồn khách hiện có, cùng revision/audit của hồ sơ; không sửa cơ sở doanh thu, tiền, phiếu thu hoặc xe.

Báo cáo doanh số hợp đồng, doanh thu thuê và báo cáo NVKD bổ sung nhóm các tên nhập tay theo tên đã lưu. Hai người nhập cùng tên chưa có ID thuộc cùng nhóm tên; nhân viên có ID được giữ riêng dù trùng tên. Xóa tên sẽ đưa các báo cáo về nhóm chưa phân công, không dùng lại tên cũ.

Không cần migration, dùng JSON hợp đồng hiện có. Kiểm tra PostgreSQL bằng bảng TEMP/rollback: `node scripts/check-cross-branch-rentals.cjs --live-temp`, `node scripts/check-staff-sales.cjs`, `node scripts/check-rental-revenue.cjs --live-temp`, `node scripts/check-sales-summary.cjs`. Kiểm tra Chromium/WebKit: `python scripts/check-contract-manual-source-ui.py --url <url> --session-cookie-file <session>`; mọi API nghiệp vụ trong bài UI đều bị chặn/giả lập.
