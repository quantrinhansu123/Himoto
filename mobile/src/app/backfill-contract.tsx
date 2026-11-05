import { DraftEditor } from '@/components/draft-editor';
import { useLocalSearchParams } from 'expo-router';
export default function Route(){const{store_id}=useLocalSearchParams<{store_id?:string}>();return <DraftEditor id={null} backfill defaultStore={store_id} />;}
