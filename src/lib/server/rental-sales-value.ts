import 'server-only';

// The payable total includes company charges. Keep those out of rental sales,
// while preserving renewals and any explicitly granted rental discounts.
export function rentalSalesValueSql(order='o') {
  return `GREATEST(CASE WHEN BTRIM(COALESCE(${order}.total::text,'')) ~ '^[0-9]{1,13}$' THEN ${order}.total::numeric ELSE 0 END
    -COALESCE((SELECT sum(CASE WHEN charge->>'amount' ~ '^[0-9]{1,13}$' THEN (charge->>'amount')::numeric ELSE 0 END)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${order}.draft_payload::jsonb #> '{management_composer,draft,extra_charges}')='array'
        THEN ${order}.draft_payload::jsonb #> '{management_composer,draft,extra_charges}' ELSE '[]'::jsonb END) charge),0)
    -COALESCE((SELECT sum(CASE WHEN adjustment->>'late_fee' ~ '^[0-9]{1,13}$' THEN (adjustment->>'late_fee')::numeric ELSE 0 END
      +CASE WHEN adjustment->>'repair_fee' ~ '^[0-9]{1,13}$' THEN (adjustment->>'repair_fee')::numeric ELSE 0 END)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${order}.draft_payload::jsonb #> '{management_composer,return_adjustments}')='array'
        THEN ${order}.draft_payload::jsonb #> '{management_composer,return_adjustments}' ELSE '[]'::jsonb END) adjustment),0),0)`;
}
