import { useLocalSearchParams } from "expo-router";
import { CustomerEditor } from "@/components/customer-editor";
export default function EditCustomer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CustomerEditor key={id} id={id} />;
}
