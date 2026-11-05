import { useEffect, useRef, useState } from "react";
import type { MobileFileExport } from "../../../shared/mobile-export";
import { saveCsvFile } from "@/lib/save-csv-file";
/** Caller mounts this inside its keyed session/scope boundary. */
export function useCsvExport() {
  const alive = useRef(true), running = useRef(false), request = useRef<AbortController | null>(null);
  const [stage, setStage] = useState<"" | "fetching" | "saving">(""), [message, setMessage] = useState(""), [error, setError] = useState("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); }; }, []);
  async function run(load: (signal: AbortSignal) => Promise<MobileFileExport>) {
    if (running.current) return;
    running.current = true; request.current = new AbortController(); setStage("fetching"); setError(""); setMessage("");
    try {
      const file = await load(request.current.signal);
      if (!alive.current) return;
      setStage("saving");
      const result = await saveCsvFile(file, () => alive.current);
      if (alive.current) setMessage(result === "saved" ? `Đã lưu ${file.rowCount} dòng vào ${file.filename}.` : result === "shared" ? `Đã mở chia sẻ ${file.rowCount} dòng. Kiểm tra nơi nhận file.` : "Đã hủy lưu file.");
    } catch (cause) { if (alive.current) setError((cause as Error).message || "Chưa xuất được file. Thử lại."); }
    finally { running.current = false; request.current = null; if (alive.current) setStage(""); }
  }
  return { run, stage, busy: !!stage, message, error };
}
