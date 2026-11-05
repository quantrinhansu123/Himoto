import {useLocalSearchParams} from 'expo-router';
import {RecordMediaEditor} from '@/components/record-media-editor';
export default function MediaScreen() {
  const p=useLocalSearchParams<{entity:string;id:string;kind?:string;referenceId?:string}>();
  return <RecordMediaEditor entity={typeof p.entity==='string'?p.entity:''} id={typeof p.id==='string'?p.id:''}
    kind={typeof p.kind==='string'?p.kind:undefined} referenceId={typeof p.referenceId==='string'?p.referenceId:undefined}/>;
}
