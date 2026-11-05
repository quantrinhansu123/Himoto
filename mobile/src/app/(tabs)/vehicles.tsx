import { CatalogueScreen } from "@/components/catalogue-screen";
import { useLocalSearchParams } from "expo-router";
import { initialCatalogueStatus } from "@/lib/catalogue-config";
export default function Vehicles() {
  const { status } = useLocalSearchParams<{ status?: string }>();
  const preset = initialCatalogueStatus("vehicles", status);
  return (
    <CatalogueScreen key={preset} kind="vehicles" initialStatus={preset} />
  );
}
