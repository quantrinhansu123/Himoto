import {uuid} from 'expo';
import type {ContractWorkScope} from '../../../shared/mobile-contract-work';
import type {MobileApi} from './api';
import {openNativeContractWorkStore} from './contract-work-files';
import {createDraftWorkController} from './draft-work-controller';
import {pendingWrites} from './pending-writes';

/** Authorize the original saved record before exposing photos or acknowledging metadata. */
export async function resumeDraftWorkMedia(scope:ContractWorkScope,workId:string,api:Pick<MobileApi,'customerPhotoCopyReview'>,isCurrent:()=>boolean){
  const check=()=>{if(!isCurrent())throw Error('Phiên làm việc đã thay đổi. Bản gốc được giữ.');};
  check();const store=await openNativeContractWorkStore(scope);check();const head=await store.load(workId);check();
  if(head.work.status!=='open')throw Error('Bản đang soạn đã kết thúc. Về Tài khoản để tải lại danh sách.');
  const metadata=head.work.attempts.find(attempt=>attempt.kind==='metadata'&&attempt.state==='committed');
  if(head.work.contractId===null||metadata?.kind!=='metadata'||!metadata.receipt)throw Error('Bản này chưa có kết quả lưu thông tin hợp đồng. Giữ nguyên bản và đối chiếu với quyền soạn hợp đồng.');
  const review=await api.customerPhotoCopyReview(head.work.contractId);check();
  if(review.id!==head.work.contractId||metadata.receipt.id!==head.work.contractId)throw Error('Kết quả kiểm tra không khớp hợp đồng gốc. Giữ bản để đối chiếu.');
  const work=createDraftWorkController({store,scope,workId,baseDraftId:head.work.baseDraftId,initialHead:head,ledger:pendingWrites,makeUuid:()=>uuid.v4().toLowerCase()});
  work.setReader(()=>({input:head.work.input,step:head.work.step}));
  // This is a received, checked proof, not another metadata write. The RLS read
  // above still has to authorize the saved contract under the current session.
  const pendingMetadata=await pendingWrites.lookup(head.work.scope,metadata.operation);check();
  if(!metadata.acknowledged||pendingMetadata===metadata.key){check();await work.settleMetadata(metadata.key,metadata.receipt);check();}
  const photos=await work.restorePhotos();check();
  return {work,photos,revision:metadata.receipt.revision};
}
