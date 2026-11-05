import { useLocalSearchParams } from "expo-router";
import { RenewalEditor } from "@/components/renewal-editor";
export default function Renewal() { const { id,backfill } = useLocalSearchParams<{ id: string;backfill?:string }>(); return <RenewalEditor id={id} backfill={backfill==="1"} />; }
