/** Corrections saved on a contract take precedence over its linked directory entry. */
export const CONTRACT_CUSTOMER_NAME_SQL = "COALESCE(o.draft_payload->'management_composer'->'profile'->'customer'->>'name',c.name,o.customer_name)";
export const CONTRACT_CUSTOMER_PHONE_SQL = "COALESCE(o.draft_payload->'management_composer'->'profile'->'customer'->>'phone',c.phone,o.customer_phone)";
