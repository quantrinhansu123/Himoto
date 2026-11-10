import 'server-only';

// The contract total already includes renewals and applied charges and discounts.
export function rentalSalesValueSql(order='o') {
  return `CASE WHEN BTRIM(COALESCE(${order}.total::text,'')) ~ '^[0-9]{1,13}$' THEN ${order}.total::numeric ELSE 0 END`;
}
