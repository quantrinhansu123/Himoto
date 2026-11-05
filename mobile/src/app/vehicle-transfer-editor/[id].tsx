import {useLocalSearchParams} from 'expo-router';
import {VehicleTransferEditor} from '@/components/vehicle-transfer-editor';
export default function VehicleTransferEntry(){const {id}=useLocalSearchParams<{id:string}>();return <VehicleTransferEditor id={id}/>;}
