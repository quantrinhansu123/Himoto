import {useLocalSearchParams} from 'expo-router';
import {DraftWorkMedia} from '@/components/draft-work-media';
export default function ResumeSavedWorkMedia(){const {id}=useLocalSearchParams<{id:string}>();return <DraftWorkMedia id={typeof id==='string'?id:''}/>;}
