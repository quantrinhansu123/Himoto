import { useLocalSearchParams } from "expo-router";
import { FinanceScreen } from "@/components/finance-screen";
export default function Finance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FinanceScreen id={id} />;
}
