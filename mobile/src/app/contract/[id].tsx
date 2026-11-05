import { useLocalSearchParams } from "expo-router";
import { ContractPreparation } from "@/components/contract-preparation";
export default function ContractActionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ContractPreparation id={id} />;
}
