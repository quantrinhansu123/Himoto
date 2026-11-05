import {useLocalSearchParams} from 'expo-router';
import {RecordVideoReceipt} from '@/components/record-video-receipt';
export default function Screen(){const p=useLocalSearchParams<{id:string}>();return <RecordVideoReceipt id={typeof p.id==='string'?p.id:''}/>;}
