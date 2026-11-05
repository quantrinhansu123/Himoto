import {useLocalSearchParams} from 'expo-router';
import {VehicleTransferRecovery} from '@/components/vehicle-transfer-recovery';
export default function VehicleTransferResult(){const {id,action}=useLocalSearchParams<{id:string;action?:string}>();return <VehicleTransferRecovery id={id} action={action}/>;}
