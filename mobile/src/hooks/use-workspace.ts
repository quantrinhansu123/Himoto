import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/providers/session";
export function useWorkspace() {
  const { api, session } = useSession();
  return useQuery({
    queryKey: ["workspace", session?.user.id],
    queryFn: ({ signal }) => api!.workspace(signal),
    enabled: !!api,
  });
}
