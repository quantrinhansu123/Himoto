import {useLocalSearchParams} from 'expo-router';
import {RecordVideoEditor} from '@/components/record-video-editor';
export default function Screen(){const p=useLocalSearchParams<{id:string;kind:string;referenceId:string;slot:string}>();return <RecordVideoEditor id={typeof p.id==='string'?p.id:''} kind={typeof p.kind==='string'?p.kind:''} referenceId={typeof p.referenceId==='string'?p.referenceId:''} slot={typeof p.slot==='string'?p.slot:''}/>;}
