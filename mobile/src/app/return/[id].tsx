import {useLocalSearchParams} from 'expo-router';
import {ReturnRecovery} from '@/components/return-recovery';
export default function ReturnResult(){const {id}=useLocalSearchParams<{id:string}>();return <ReturnRecovery id={id}/>;}
