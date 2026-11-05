import {lazy,Suspense} from 'react';
import {useLocalSearchParams} from 'expo-router';
import {useSession} from '@/providers/session';
import {StateView} from '@/components/ui';

const Screen=lazy(()=>import('@/components/contract-work-qa').then(module=>({default:module.ContractWorkQaScreen})));
const TransitionScreen=lazy(()=>import('@/components/contract-work-transition-qa').then(module=>({default:module.ContractWorkTransitionQaScreen})));

// No product navigation points here. The test is absent in release execution and cannot use operational origins.
export default function ContractWorkQaRoute(){
  const {run,mode}=useLocalSearchParams<{run:string;mode?:string}>(),{api,session}=useSession();
  if(!__DEV__||api?.origin!=='http://127.0.0.1:8091'||session?.user.id!==7||typeof run!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(run))return <StateView title="Không mở được màn hình kiểm tra"/>;
  // Keep QA input/image and native fault actions out of the normal form path.
  return <Suspense fallback={<StateView title="Đang mở kiểm tra QA" loading/>}>{mode==='transition'?<TransitionScreen key={run} run={run}/>:<Screen key={run} run={run}/>}</Suspense>;
}
