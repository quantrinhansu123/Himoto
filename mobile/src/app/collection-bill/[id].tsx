import { useLocalSearchParams } from "expo-router";
import { RenewalBillScreen } from "@/components/renewal-bill-screen";
export default function CollectionBill() { const { id, version, returnTo } = useLocalSearchParams<{ id: string; version?: string; returnTo?: string }>(); return <RenewalBillScreen id={id} collection collectionVersion={version} returnToCollection={returnTo === "collection"} />; }
