import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { CatalogueScreen } from "@/components/catalogue-screen";
import { DirectoryScreen } from "@/components/directory-screen";
import {StoreContracts} from '@/components/store-contracts';
import { StateView } from "@/components/ui";
import { useSession } from "@/providers/session";
const labels = { staff: "Nhân sự", vehicles: "Xe", customers: "Khách hàng",contracts:'Hợp đồng' } as const;
function StoreRecords({ id, kind }: { id: string; kind: keyof typeof labels }) {
  const { api, session } = useSession();
  const query = useQuery({ queryKey: ["store-profile", session!.user.id, id], queryFn: ({ signal }) => api!.storeProfile(id, signal) });
  if (query.isPending) return <StateView title="Đang mở dữ liệu cơ sở" loading />;
  if (query.isError) return <StateView title="Chưa mở được cơ sở" message={query.error.message} retry={() => { void query.refetch(); }} />;
  return <><Stack.Screen options={{ title: `${labels[kind]} · ${query.data.name}` }} />{kind==='contracts'?<StoreContracts id={id}/>:kind === "staff" ? <DirectoryScreen kind="staff" initialStore={id} /> : <CatalogueScreen kind={kind} initialStore={id} />}</>;
}
export default function StoreRecordsRoute() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: string }>(), { api, session } = useSession();
  if (!api || !session || !/^[1-9]\d{0,14}$/.test(id) || !Object.hasOwn(labels, kind)) return <StateView title="Không tìm thấy dữ liệu cơ sở" />;
  return <StoreRecords key={`${id}:${kind}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} id={id} kind={kind as keyof typeof labels} />;
}
