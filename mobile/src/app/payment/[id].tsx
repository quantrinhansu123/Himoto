import { useLocalSearchParams } from "expo-router";
import { PaymentEditor } from "@/components/payment-editor";
export default function Payment() {
  const { id,backfill } = useLocalSearchParams<{ id: string;backfill?:string }>();
  return <PaymentEditor id={id} backfill={backfill==="1"} />;
}
