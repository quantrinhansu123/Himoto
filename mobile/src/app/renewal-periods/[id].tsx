import { useLocalSearchParams } from "expo-router";
import { RenewalPeriodsScreen } from "@/components/renewal-periods-screen";
export default function RenewalPeriods() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RenewalPeriodsScreen id={id} />;
}
