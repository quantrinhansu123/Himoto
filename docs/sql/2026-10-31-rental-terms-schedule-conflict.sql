-- Cho phép kiểm tra chồng lịch khi sửa tiền/ngày thuê trên HĐ đã phát hành
-- (trước đây hàm chỉ cho HĐ nháp + ngày kết thúc không được ở tương lai → NV bị "not authorized").
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION himoto.vehicle_history_conflict_ids(targets bigint[], target_order bigint, period_start timestamptz, actual_end timestamptz)
RETURNS TABLE(vehicle_id bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,himoto AS $$
BEGIN
  IF himoto.access_actor() IS NULL OR period_start IS NULL OR actual_end IS NULL OR actual_end < period_start THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE='42501';
  END IF;
  -- HĐ nháp nhập lịch sử: không cho ngày kết thúc xa hơn hiện tại (+5 phút).
  -- HĐ đang thuê / chờ tất toán: cho phép hẹn trả trong tương lai khi sửa ngày thuê.
  IF NOT EXISTS (
    SELECT 1 FROM himoto.orders o
    WHERE o.id = target_order AND o.deleted_at IS NULL AND himoto.access_store(o.store_id)
      AND (
        (o.order_status = 'draft' AND actual_end <= now() + interval '5 minutes')
        OR o.order_status IN ('renting', 'overdue', 'wait_payment', 'pending', 'deposit_contract')
      )
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE='42501';
  END IF;
  -- Nháp nhập lịch sử: đối chiếu cả HĐ đã hoàn thành.
  -- HĐ đang thuê sửa ngày: chỉ chặn chồng với lượt còn mở (không xét lại lịch sử đã trả).
  RETURN QUERY SELECT DISTINCT d.vehicle_id::bigint
  FROM himoto.order_vehicle_details d
  JOIN himoto.orders o ON o.id = d.order_id
  WHERE d.vehicle_id = ANY(targets) AND d.order_id <> target_order AND d.deleted_at IS NULL AND o.deleted_at IS NULL
    AND COALESCE(o.draft_payload #>> '{legacy_migration,sourceStoreId}', '') <> '30'
    AND (
      (
        EXISTS (SELECT 1 FROM himoto.orders cur WHERE cur.id = target_order AND cur.order_status = 'draft')
        AND o.order_status IN ('renting', 'overdue', 'wait_payment', 'pending', 'bad_debt', 'completed', 'deposit_contract', 'draft')
      )
      OR (
        EXISTS (SELECT 1 FROM himoto.orders cur WHERE cur.id = target_order AND cur.order_status IN ('renting', 'overdue', 'wait_payment', 'pending', 'deposit_contract'))
        AND o.order_status IN ('renting', 'overdue', 'wait_payment', 'pending', 'deposit_contract', 'draft')
        AND d.completed_at IS NULL
      )
    )
    AND COALESCE(d.rent_at, o.rent_at, '-infinity'::timestamptz) < actual_end
    AND COALESCE(
      d.completed_at,
      CASE WHEN o.order_status = 'completed' THEN COALESCE(d.return_at, o.return_at) END,
      d.return_at,
      'infinity'::timestamptz
    ) > period_start;
END $$;

REVOKE ALL ON FUNCTION himoto.vehicle_history_conflict_ids(bigint[],bigint,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION himoto.vehicle_history_conflict_ids(bigint[],bigint,timestamptz,timestamptz) TO himoto_scoped;

COMMIT;
