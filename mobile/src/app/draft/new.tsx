import { DraftEditor } from "@/components/draft-editor";
import { useLocalSearchParams } from "expo-router";
export default function NewDraft(){const{store_id,reservation}=useLocalSearchParams<{store_id?:string;reservation?:string}>();const cleanStore=store_id&&store_id!=="all"?store_id:undefined;return <DraftEditor key={`${cleanStore||""}:${reservation||""}`} id={null} defaultStore={cleanStore} reservation={reservation==="1"} />;}
