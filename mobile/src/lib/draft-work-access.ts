import {sameWorkScope,type ContractWork,type ContractWorkScope} from '../../../shared/mobile-contract-work';

/** Metadata stays destination-scoped; saved media can use its own server/RLS rights. */
export function draftWorkDestination(permissions:readonly string[],work:ContractWork,scope:ContractWorkScope):'form'|'media'|'held'{
  if(permissions.includes('contracts.read')&&permissions.includes('contracts.draft')&&sameWorkScope(work.scope,scope))return 'form';
  return work.contractId!==null?'media':'held';
}
