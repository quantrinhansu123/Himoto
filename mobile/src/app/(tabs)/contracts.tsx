import { CatalogueScreen } from "@/components/catalogue-screen";
import { useLocalSearchParams } from "expo-router";
import { initialCatalogueStatus } from "@/lib/catalogue-config";
import { contractWorkspace } from "../../../../shared/mobile-contract-workspaces";
export default function Contracts() {
  const { status, scope } = useLocalSearchParams<{ status?: string; scope?: string }>();
  const preset = initialCatalogueStatus("contracts", status);
  const group = contractWorkspace(scope)?.key || "";
  return (
    <CatalogueScreen key={`${preset}:${group}`} kind="contracts" initialStatus={preset} initialScope={group} />
  );
}
