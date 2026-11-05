import { useLocalSearchParams } from "expo-router";
import { RenewalCollectionEditor } from "@/components/renewal-collection-editor";
export default function RenewalPayment() { const { id, version } = useLocalSearchParams<{ id: string; version?: string }>(); return <RenewalCollectionEditor id={id} version={version} />; }
