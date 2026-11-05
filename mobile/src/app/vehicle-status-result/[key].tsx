import {useLocalSearchParams} from 'expo-router';
import {VehicleStatusRecovery} from '@/components/vehicle-status-recovery';
export default function Screen(){const {key}=useLocalSearchParams<{key:string}>();return <VehicleStatusRecovery requestKey={key}/>;}
