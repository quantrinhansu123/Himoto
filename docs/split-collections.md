# Phí hợp đồng và chia tiền thực nhận

Trong bước **Chi phí**, tiền thuê xe tính theo ngày/đơn giá. Thêm các khoản phí bằng **Tên khoản phí + Số tiền**, ví dụ phí ship 50.000 đ. Tổng tiền thuê/phí bao gồm các khoản này; tổng cần thu còn cộng tiền cọc. Hai tổng này không được coi là tiền đã nhận.

Bấm **Lưu chính thức** để mở bước xác nhận thu tiền. Mỗi dòng ghi loại tiền (cọc hoặc thuê/phí), số tiền thực nhận, hình thức, tài khoản nhận và thời điểm nhận theo giờ Việt Nam 24h. Có thể thêm nhiều dòng cho tiền mặt, tài khoản cá nhân và tài khoản công ty. Chọn nhiều hình thức dự kiến yêu cầu điền số tiền từng dòng. Bỏ chọn ghi nhận để phát hành khi chưa thu; nhập ít hơn số phải thu để giữ phần còn thiếu.

Ví dụ cọc 2 triệu + thuê 200.000 + ship 50.000, tổng cần thu 2.250.000 đ:

| Loại tiền | Số tiền | Tài khoản nhận |
|---|---:|---|
| Cọc trước | 200.000 | TK cá nhân, ghi đúng ngày đã nhận |
| Cọc còn lại | 1.800.000 | TK công ty |
| Thuê và phí ship | 250.000 | Tiền mặt |

Ví dụ khác sau cọc trước 200.000: nhận thêm 1.500.000 tiền mặt và 550.000 chuyển khoản. Ghi cọc 1.500.000 tiền mặt + cọc 300.000 chuyển khoản + thuê/phí 250.000 chuyển khoản. Sổ quỹ tổng hợp đúng 1.500.000 vào tiền mặt và 550.000 vào tài khoản đã chọn.

Tiền cọc đã có trong sổ quỹ được hiển thị là đã ghi nhận trước; chỉ thu phần còn lại, tránh cộng trùng. Tài khoản và phiếu thu dùng cơ sở nguồn/doanh thu của hợp đồng. Xe lấy ở cơ sở khác giữ nguyên kho quản lý.

Mẫu in ghi **Đã thu phí thuê** theo số thực nhận, tách tiền cọc. Phụ lục liệt kê phí theo tên và các khoản đã thu theo tài khoản/thời điểm. Các khoản đã nhận lấy từ giao dịch được duyệt trong DB, không lấy số tiền client tự khai. Tổng phí thuê trong DB giữ phần thuê gốc để gia hạn không tính nhầm phí ship vào đơn giá ngày.

Không cần migration mới cho việc chia thu tiền. Hỗ trợ API phát hành cũ với một dòng cho mỗi loại tiền; API mới nhận mảng `receipts`. Kiểm tra giới hạn tiền, số dòng, tài khoản/hình thức/cơ sở, thời điểm và phần còn phải thu trước khi phát hành trong cùng transaction.

Kiểm tra: `node scripts/check-split-collections.cjs --live-temp` gồm 5 nhóm; chỉ bảng TEMP, rollback và sequence riêng. `python scripts/check-split-collections-ui.py --session-cookie-file <file phiên cục bộ>` giả lập mọi API nghiệp vụ, kiểm tra form, mobile 375px, request chia thu và PDF A4. Ảnh/PDF/kết quả trong `docs/qa/split-collections/`.
