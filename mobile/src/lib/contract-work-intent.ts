import {sameWorkActor,sameWorkScope,ContractWorkRuleError,type ContractWorkScope,type ContractWorkCommand} from '../../../shared/mobile-contract-work';
import {mediaMutationOperations} from '../../../shared/mobile-media-delete';
import type {createContractWorkJournal} from './contract-work-journal';

interface WorkIntentLedger {
  reserveExclusive(scope:ContractWorkScope,operation:string,conflicts:readonly string[],makeKey:()=>string):Promise<{operation:string;key:string;created:boolean}>;
}
/** Persist and cold-read the exact planned input/photo linkage before touching SecureStore. */
export async function reserveContractWorkIntent(journal:ReturnType<typeof createContractWorkJournal>,workId:string,scope:ContractWorkScope,ledger:WorkIntentLedger){
  scope={...scope};
  const head=await journal.load(workId);
  const attempt=head.work.attempts.find(a=>a.state==='planned');
  if(!sameWorkActor(head.work.scope,scope)||!sameWorkScope(head.work.scope,scope)&&!(head.work.contractId!==null&&attempt&&(attempt.kind==='photo'||attempt.kind==='copy')))throw new ContractWorkRuleError('Cơ sở hoặc quyền đã đổi. Giữ bản và đối chiếu yêu cầu gốc.');
  if(!attempt||head.work.status!=='open')throw new ContractWorkRuleError('Chưa lưu được mã yêu cầu và dữ liệu gốc trên thiết bị.');
  const conflicts=attempt.kind==='metadata'?[attempt.operation]:mediaMutationOperations('contracts',head.work.contractId!);
  const reserved=await ledger.reserveExclusive(scope,attempt.operation,conflicts,()=>attempt.key);
  if(reserved.key!==attempt.key||reserved.operation!==attempt.operation)throw new ContractWorkRuleError('Có yêu cầu thuộc thao tác khác. Vào Tài khoản để đối chiếu; chưa gửi bản này.');
  const latest=await journal.load(workId);
  if(latest.commitId!==head.commitId)throw new ContractWorkRuleError('Kết quả của mã yêu cầu đã thay đổi. Đối chiếu lại trước khi gửi.');
  // An existing UUID may already have reached the server. Never infer "not sent" from a local stage.
  return {head,attempt,sendAllowed:reserved.created,recoveryRequired:!reserved.created};
}

/** Shared by the future form/Account integration: save the original proof and local acknowledgement before removing the ledger UUID. */
export async function settleContractWorkIntent(
  journal:ReturnType<typeof createContractWorkJournal>,workId:string,scope:ContractWorkScope,
  outcome:Extract<ContractWorkCommand,{type:'committed'|'cancelled'}>,
  ledger:{complete(scope:ContractWorkScope,operation:string,key:string):Promise<void>},
){
  let head=await journal.load(workId);
  const original=head.work.attempts.find(a=>a.key===outcome.key);
  if(!original)throw new ContractWorkRuleError('Không tìm thấy bản đang soạn gắn với mã gốc. Giữ mã để đối chiếu.');
  head=await journal.change(head,scope,outcome);
  head=await journal.change(head,scope,{type:'acknowledge',key:outcome.key});
  const verified=await journal.load(workId),attempt=verified.work.attempts.find(a=>a.key===outcome.key);
  if(!attempt?.acknowledged||attempt.state==='planned')throw new ContractWorkRuleError('Chưa lưu được kết quả đối chiếu trên thiết bị. Giữ mã gốc và thử lại.');
  // Create keys remain destination-scoped even when the actor now works at a
  // different branch. Acknowledgement must remove the original key only.
  await ledger.complete(original.operation.includes(':')?scope:head.work.scope,original.operation,outcome.key);
  return head;
}
