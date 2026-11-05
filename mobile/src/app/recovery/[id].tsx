import {useLocalSearchParams} from 'expo-router';
import {BadDebtRecoveryReceipt} from '@/components/bad-debt-recovery-receipt';
export default function RecoveryResult(){const {id}=useLocalSearchParams<{id:string}>();return <BadDebtRecoveryReceipt id={id}/>;}
