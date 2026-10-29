BEGIN;
SET LOCAL lock_timeout='30s';

-- Đồng bộ trạng thái xe: các xe đang có hợp đồng thuê hoạt động (renting và chưa hoàn thành)
-- phải có trạng thái là 'using' (Đang thuê), không để 'ready' (Lưu kho).
UPDATE himoto.vehicles v
SET status = 'using', updated_at = now()
WHERE v.deleted_at IS NULL
  AND v.status IN ('ready', 'holding', 'pending')
  AND EXISTS (
    SELECT 1 
    FROM himoto.order_vehicle_details d
    JOIN himoto.orders o ON o.id = d.order_id
    WHERE d.vehicle_id = v.id
      AND d.deleted_at IS NULL
      AND d.completed_at IS NULL
      AND o.deleted_at IS NULL
      AND o.order_status = 'renting'
  );

COMMIT;
