import {useLocalSearchParams} from 'expo-router';
import {BadDebtRecoveryEditor} from '@/components/bad-debt-recovery-editor';
export default function RecoveryEntry(){const {id}=useLocalSearchParams<{id:string}>();return <BadDebtRecoveryEditor id={id}/>;}
