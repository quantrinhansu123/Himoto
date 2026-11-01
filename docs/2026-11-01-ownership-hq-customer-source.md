# Nguồn khách Trụ sở chính thuộc thuê sở hữu

Trụ sở chính là nguồn khách / doanh thu của thuê sở hữu (cùng kho Thuê sở hữu). Không gồm PGD Nguyễn Hoàng.

- Danh sách **Hợp đồng thuê sở hữu** gồm HĐ có `store_id` Trụ sở chính hoặc kho `lease_to_own`, hoặc loại `ownership` / `ownership_cd`.
- Nhân viên / quản lý thuê sở hữu được đọc-ghi HĐ và phiếu thu gắn Trụ sở chính (RLS `access_order_store`).
- Form lập HĐ thuê sở hữu chọn được Trụ sở chính ở **Liên kết nguồn khách**.

SQL: `docs/sql/2026-11-01-ownership-hq-customer-source.sql`.
