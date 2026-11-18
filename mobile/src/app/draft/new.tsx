import { DraftEditor } from "@/components/draft-editor";
import { useLocalSearchParams } from "expo-router";
export default function NewDraft(){const{store_id,reservation}=useLocalSearchParams<{store_id?:string;reservation?:string}>();return <DraftEditor key={`${store_id||""}:${reservation||""}`} id={null} defaultStore={store_id} reservation={reservation==="1"} />;}
