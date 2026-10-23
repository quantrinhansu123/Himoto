import 'server-only';

// Legacy OrderService::addOnPrice writes name=addon,type=addon for every
// cash/bank renewal. Other addon-type receipts keep their own classification.
export const renewalReceiptSql = (receipt = 't') => `(${receipt}.name='order:renewal'
  OR (${receipt}.name='addon' AND ${receipt}.type='addon' AND ${receipt}.order_id IS NOT NULL)
  OR (${receipt}.name IN ('order:payment','order:rental_fees') AND ${receipt}.id IN
    (SELECT p.transaction_id FROM himoto.management_contract_payments p WHERE p.renewal_payload IS NOT NULL)))`;
