import { useLocalSearchParams } from "expo-router";
import { MOBILE_PAYMENT_PURPOSES, type MobilePaymentPurpose } from "../../../../shared/mobile-finance";
import { PaymentEditor } from "@/components/payment-editor";
export default function Payment() {
  const { id, backfill, purpose } = useLocalSearchParams<{ id: string; backfill?: string; purpose?: string }>();
  const initialPurpose = purpose && MOBILE_PAYMENT_PURPOSES.includes(purpose as MobilePaymentPurpose)
    ? (purpose as MobilePaymentPurpose)
    : undefined;
  return <PaymentEditor id={id} backfill={backfill === "1"} initialPurpose={initialPurpose} />;
}
