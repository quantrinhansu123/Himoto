import type { CollectionFollowup } from '../../../shared/collection-report';
export * from '../../../shared/collection-report';
export const COLLECTION_FOLLOWUP_SAVED='himoto:collection-followup-saved';
export async function loadCollectionFollowups(ids:number[],signal?:AbortSignal):Promise<{id:number;followup:CollectionFollowup}[]> {
  const result:{id:number;followup:CollectionFollowup}[]=[];
  for(let start=0;start<ids.length;start+=200){
    const response=await fetch(`/api/auth/order/car-rental/followups?ids=${ids.slice(start,start+200).join(',')}`,{signal,cache:'no-store',credentials:'same-origin'});
    const body=await response.json();
    if(!response.ok||!Array.isArray(body.data))throw Error(body.message||'Không tải được ghi chú hợp đồng.');
    result.push(...body.data);
  }
  return result;
}
