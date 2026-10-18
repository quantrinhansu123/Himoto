import 'server-only';

// Ownership comes from the customer profile. The first rental comes from actual
// rental history, excluding drafts, reservations, cancellations and deleted orders.
export const CUSTOMER_PROFILE_SQL = `SELECT c.id, c.name, c.email, c.phone, c.address, c.id_card, c.customer_type, c.nationality, c.contact_channel, c.contact_detail,
  c.driver_license_number, c.driver_license_issued_on::text AS driver_license_issued_on,
  CASE WHEN c.status = 2 THEN 'bad_debt' WHEN c.status = 0 THEN 'draft'
       WHEN NULLIF(BTRIM(c.warning), '') IS NOT NULL THEN 'warning' ELSE 'active' END AS status,
  c.warning, c.created_at, c.xmin::text AS customer_revision,
  c.id_card_issued_on, c.id_card_issued_by, c.relatives, c.store_id, s.store_name,
  COALESCE(oc.contract_count, 0) AS contract_count,
  first_rental.store_id AS first_rental_store_id,
  first_store.store_name AS first_rental_store_name, first_rental.rented_at AS first_rented_at
  FROM himoto.customers c
  LEFT JOIN himoto.stores s ON s.id = c.store_id
  LEFT JOIN (SELECT customer_id, count(*)::int AS contract_count FROM himoto.orders
             WHERE deleted_at IS NULL GROUP BY customer_id) oc ON oc.customer_id = c.id
  LEFT JOIN (
    SELECT DISTINCT ON (o.customer_id) o.customer_id, o.store_id,
      COALESCE(o.rent_at, rental_dates.rented_at, o.created_at) AS rented_at
    FROM himoto.orders o
    LEFT JOIN (SELECT d.order_id, min(d.rent_at) AS rented_at
      FROM himoto.order_vehicle_details d WHERE d.deleted_at IS NULL GROUP BY d.order_id
    ) rental_dates ON rental_dates.order_id = o.id
    WHERE o.deleted_at IS NULL
      AND o.order_status IN ('renting', 'overdue', 'completed', 'bad_debt')
    ORDER BY o.customer_id, rented_at ASC NULLS LAST, o.id ASC
  ) first_rental ON first_rental.customer_id = c.id
  LEFT JOIN himoto.stores first_store ON first_store.id = first_rental.store_id`;

export const CUSTOMER_SEARCH_SQL = `${CUSTOMER_PROFILE_SQL}
  WHERE upper(regexp_replace(COALESCE(c.id_card, ''), '[[:space:]]', '', 'g')) = $1
     OR ($1 ~ '^[0-9]{6,15}$' AND regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') = $1)
     OR (c.customer_type='foreign' AND CASE WHEN c.contact_detail ~ '^[+0-9[:space:].()-]+$'
       THEN regexp_replace(c.contact_detail, '\\D', '', 'g')
       ELSE upper(regexp_replace(c.contact_detail, '[[:space:]]', '', 'g')) END=$1)
  ORDER BY c.id DESC`;
