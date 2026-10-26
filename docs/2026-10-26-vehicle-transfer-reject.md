# Từ chối điều chuyển xe

Cơ sở đích có quyền `vehicles.receive` có thể **Từ chối điều chuyển** khi xe đang `in_transit`. Xe về `ready` tại cơ sở chuyển đi; lịch sử ghi `manual_transfer_reject` gắn lần `manual_transfer` gốc. Người đã bấm Chuyển xe không tự từ chối cùng lượt.

Áp dụng SQL `docs/sql/2026-10-26-vehicle-transfer-reject.sql` trước deploy để RLS cho phép ghi/đọc event từ chối.
