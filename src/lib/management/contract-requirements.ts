export interface ContractDocumentRequirements {
  phone: boolean; id_card: boolean; address: boolean; representative: boolean; relatives: 0 | 1 | 2;
}
export const DEFAULT_DOCUMENT_REQUIREMENTS: ContractDocumentRequirements = {phone:true,id_card:true,address:true,representative:true,relatives:2};
export function documentRequirements(value?: ContractDocumentRequirements): ContractDocumentRequirements {
  return value || DEFAULT_DOCUMENT_REQUIREMENTS;
}
export function validDocumentRequirements(value: unknown): value is ContractDocumentRequirements {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string,unknown>;
  return Object.keys(row).length === 5 && ['phone','id_card','address','representative'].every(key=>typeof row[key] === 'boolean') && [0,1,2].includes(Number(row.relatives)) && typeof row.relatives === 'number';
}
