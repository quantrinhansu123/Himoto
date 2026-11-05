import { useLocalSearchParams } from "expo-router";
import { RenewalBillScreen } from "@/components/renewal-bill-screen";
export default function RenewalBill(){const {id,returnTo,backfill}=useLocalSearchParams<{id:string;returnTo?:string;backfill?:string}>();return <RenewalBillScreen id={id} returnToRenewal={returnTo==="renewal"} backfill={backfill==="1"}/>;}
