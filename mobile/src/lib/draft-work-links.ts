import {Platform} from 'react-native';
import {DRAFT_WORK_RECOVERY_ENABLED} from './draft-work-feature';
import {openNativeContractWorkStore} from './contract-work-files';
import {sameWorkScope,type ContractWorkScope,ContractWorkRuleError} from '../../../shared/mobile-contract-work';

const relevant=(operation:string)=>/^(?:draft\.(?:create|update:[1-9]\d*)|media\.(?:contract|copy|delete\.contract):[1-9]\d*)$/.test(operation);
export async function findDraftWorkRequest(scope:ContractWorkScope,operation:string,key:string){
  if(!DRAFT_WORK_RECOVERY_ENABLED||Platform.OS==='web'||!relevant(operation))return null;
  const store=await openNativeContractWorkStore(scope),all=await store.list();
  const matches=all.flatMap(head=>head.work.attempts.filter(a=>a.key===key&&a.operation===operation).map(attempt=>({store,head,attempt})));
  if(matches.length>1)throw new ContractWorkRuleError('Mã yêu cầu đang gắn với nhiều bản trên thiết bị. Giữ mã để đối chiếu.');
  return matches[0]??null;
}
export function installDraftWorkLedgerGuard(ledger:{configureWorkGuard(guard:{reserve(scope:ContractWorkScope,operation:string,conflicts:readonly string[],key:string):Promise<void>;complete(scope:ContractWorkScope,operation:string,key:string):Promise<void>}):void}){
  if(!DRAFT_WORK_RECOVERY_ENABLED||Platform.OS==='web')return;
  ledger.configureWorkGuard({
    async reserve(scope,operation,conflicts,key){
      if(!conflicts.some(relevant))return;const store=await openNativeContractWorkStore(scope),all=await store.list();
      for(const head of all)for(const attempt of head.work.attempts){
        if(!conflicts.includes(attempt.operation)||!attempt.operation.includes(':')&&!sameWorkScope(head.work.scope,scope))continue;
        if((attempt.state==='planned'||!attempt.acknowledged)&&(attempt.key!==key||attempt.operation!==operation))throw new ContractWorkRuleError('Còn yêu cầu của bản đang soạn trên thiết bị. Mở bản gốc hoặc Tài khoản để đối chiếu trước khi gửi tiếp.');
      }
    },
    async complete(scope,operation,key){
      const linked=await findDraftWorkRequest(scope,operation,key);
      if(linked&&(!linked.attempt.acknowledged||linked.attempt.state==='planned'))throw new ContractWorkRuleError('Mở bản đang soạn để lưu kết quả gốc trước khi xóa mã đối chiếu.');
    },
  });
}
