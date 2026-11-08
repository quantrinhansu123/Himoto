# Sửa lỗi tải hợp đồng theo quyền cơ sở — 08/11/2026

## Nguyên nhân

Quyền admin đọc trang đầu nhanh, nhưng tài khoản cơ sở phải gọi `contract_vehicle_labels()` trong các phép tổng hợp xe cho từng hợp đồng. Kế hoạch thực thi của trang 10 dòng gọi hàm này 20 lần; riêng trang Thuê sở hữu mất khoảng 26,7 giây ở bước lấy chi tiết và vượt statement timeout 20 giây. Việc chỉ bổ sung timeout phía trình duyệt không xử lý được nguyên nhân này.

## Thay đổi

- Hàm DB xác định các cơ sở được đọc một lần trước khi lấy tập xe. Vẫn yêu cầu actor và dùng đúng `access_order_store`; giữ nguyên kết quả, SECURITY DEFINER, search_path và quyền EXECUTE.
- Truy vấn ứng dụng materialize tập nhãn xe và vị trí kho một lần cho cả trang, dùng lại cho các dòng và phần quá hạn. Truy vấn admin giữ nguyên.
- Migration đã áp dụng: `docs/sql/2026-11-08-contract-vehicle-label-performance.sql`. Không sửa dòng dữ liệu nghiệp vụ. Định nghĩa hàm trước sửa và phép đối chiếu nằm trong `local-backups/contract-label-performance/`.

## Đối chiếu

Đã so sánh toàn bộ các trường nhãn xe trước/sau trong cùng transaction cho ba phạm vi cơ sở (23, 35, 31), phạm vi mọi cơ sở và không có actor. Các tập kết quả khớp; không có actor trả 0 dòng. Thời gian hàm của cơ sở 35 giảm từ 13044ms xuống 788ms trong lần đo đối chiếu. Đây là thời gian DB từ local, không phải thời gian tải toàn trang qua Internet.

Kiểm tra hồi quy: `node scripts/check-contract-scoped-loading.cjs --live-read`. Kiểm tra dùng transaction READ ONLY, đối chiếu cơ sở/mã hợp đồng và các dòng xe, tên xe/biển số với quan hệ dữ liệu trong cùng phạm vi quyền, và mở riêng HĐ 3110264 bằng ID trong CS Thuê sở hữu. Không tạo hợp đồng, phiếu thu hoặc thông báo ngoài hệ thống.

Tìm kiếm văn bản theo quyền cơ sở là một luồng riêng: phép đo tìm mã còn vượt timeout ở truy vấn tìm kiếm; bản sửa này xử lý tải danh sách và chi tiết xe, chưa khẳng định đã xử lý tốc độ tìm kiếm văn bản.
