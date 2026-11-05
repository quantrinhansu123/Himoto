import { DraftEditor } from "@/components/draft-editor";
import { useLocalSearchParams } from "expo-router";
export default function NewDraft(){const{store_id}=useLocalSearchParams<{store_id?:string}>();return <DraftEditor id={null} defaultStore={store_id} />;}
