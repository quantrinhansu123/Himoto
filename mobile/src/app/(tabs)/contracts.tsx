import { CatalogueScreen } from "@/components/catalogue-screen";
import { useLocalSearchParams } from "expo-router";
import { initialCatalogueStatus } from "@/lib/catalogue-config";
import { contractWorkspace } from "../../../../shared/mobile-contract-workspaces";
import { StateView } from "@/components/ui";
export default function Contracts() {
  const { status, scope, search, customer_id, customer_name, store } = useLocalSearchParams<{ status?: string; scope?: string; search?: string; customer_id?: string; customer_name?: string; store?: string }>();
  if (customer_id !== undefined && (typeof customer_id !== 'string' || !/^[1-9]\d{0,14}$/.test(customer_id)) ||
    search !== undefined && (typeof search !== 'string' || search.length > 120) ||
    store !== undefined && (typeof store !== 'string' || store !== 'all' && !/^[1-9]\d{0,14}$/.test(store)))
    return <StateView title="Bộ lọc hợp đồng chưa hợp lệ" message="Mở lại danh sách từ hồ sơ khách hàng hoặc menu hợp đồng." />;
  const preset = initialCatalogueStatus("contracts", status ?? (customer_id || search ? 'all' : undefined));
  const group = contractWorkspace(scope)?.key || "";
  return (
    <CatalogueScreen key={`${preset}:${group}:${customer_id || ''}:${search || ''}:${store || ''}`} kind="contracts" initialStatus={preset} initialScope={group} initialSearch={search} initialCustomerId={customer_id} customerName={typeof customer_name === 'string' ? customer_name.slice(0, 200) : undefined} initialStore={store} />
  );
}
