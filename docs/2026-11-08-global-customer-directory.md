# Danh sách khách toàn hệ thống

Theo yêu cầu người dùng, mọi tài khoản đang đăng nhập được xem và tìm khách hàng toàn hệ thống. Trang Khách hàng mặc định “Tất cả cơ sở”, có danh sách cơ sở để lọc riêng. Lựa chọn này được lưu riêng với cơ sở của hợp đồng, không đổi scope_all của tài khoản.

RLS SELECT khách hàng yêu cầu actor của phiên; các quyền ghi, hợp đồng và tài chính giữ phạm vi hiện có. Permission customers.read được cấp chung qua hàm quyền dùng chung giữa giao diện và API. Tên cơ sở trong danh sách dùng store_directory hiện có.

Migration: docs/sql/2026-11-08-global-customer-directory.sql.

Kiểm tra: node scripts/check-global-customer-directory.cjs --live-read; npm run typecheck; npm run build. Kiểm tra live dùng transaction READ ONLY, đối chiếu tổng khách với DB và xác nhận tài khoản cơ sở đọc được hồ sơ 42671 ở cơ sở khác; kiểm tra các policy ghi vẫn yêu cầu access_store và hợp đồng vẫn bị giới hạn theo cơ sở. Không ghi dữ liệu khách thử.
