import {useLocalSearchParams} from 'expo-router';
import {DraftEditor} from '@/components/draft-editor';
import {DraftWorkMedia} from '@/components/draft-work-media';
import {useSession} from '@/providers/session';
export default function ResumeDraftWork(){const {id}=useLocalSearchParams<{id:string}>(),{session}=useSession();return session?.user.permissions.includes('contracts.read')&&session.user.permissions.includes('contracts.draft')?<DraftEditor id={null} workId={id}/>:<DraftWorkMedia id={typeof id==='string'?id:''}/>;}
