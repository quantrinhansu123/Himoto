import { useLocalSearchParams } from "expo-router";
import { DraftEditor } from "@/components/draft-editor";
export default function EditDraft() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DraftEditor key={id} id={id} />;
}
