import {useLocalSearchParams} from 'expo-router';
import {SwapRecovery} from '@/components/swap-recovery';
export default function SwapResult(){const {id}=useLocalSearchParams<{id:string}>();return <SwapRecovery id={id}/>;}
