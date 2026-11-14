import { Stack, useLocalSearchParams } from "expo-router";
import { CatalogueScreen } from "@/components/catalogue-screen";
import { StateView } from "@/components/ui";
import { contractWorkspace } from "../../../../shared/mobile-contract-workspaces";

export default function ContractWorkspace() {
  const { scope,store } = useLocalSearchParams<{ scope: string;store?:string }>();
  const workspace = contractWorkspace(scope === "all" ? "" : scope);
  if (!workspace) return <StateView title="Không tìm thấy nhóm hợp đồng" />;
  return <><Stack.Screen options={{ title: workspace.title }} /><CatalogueScreen key={`${workspace.key}:${store||""}`} kind="contracts" initialScope={workspace.key} initialStore={store} showManagementMenu={false} /></>;
}
