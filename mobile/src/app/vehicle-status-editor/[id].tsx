import {useLocalSearchParams} from 'expo-router';
import {VehicleStatusEditor} from '@/components/vehicle-status-editor';
export default function Screen(){const {id}=useLocalSearchParams<{id:string}>();return <VehicleStatusEditor id={id}/>;}
