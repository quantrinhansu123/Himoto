import {useLocalSearchParams} from 'expo-router';
import {MediaDeleteScreen} from '@/components/media-delete';
export default function MediaDeleteRoute(){
  const p=useLocalSearchParams<{entity:string;id:string;kind?:string;referenceId?:string;slot?:string}>();
  return <MediaDeleteScreen entity={typeof p.entity==='string'?p.entity:''} id={typeof p.id==='string'?p.id:''} kind={typeof p.kind==='string'?p.kind:undefined} referenceId={typeof p.referenceId==='string'?p.referenceId:undefined} slot={typeof p.slot==='string'?p.slot:undefined}/>;
}
