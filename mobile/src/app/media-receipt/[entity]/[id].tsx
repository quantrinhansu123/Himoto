import {useLocalSearchParams} from 'expo-router';
import {RecordMediaRecovery} from '@/components/record-media-recovery';
export default function MediaReceiptScreen() {
  const {entity,id}=useLocalSearchParams<{entity:string;id:string}>();
  return <RecordMediaRecovery entity={typeof entity==='string'?entity:''} id={typeof id==='string'?id:''}/>;
}
