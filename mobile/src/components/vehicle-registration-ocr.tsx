import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { uuid } from "expo";
import { VEHICLE_OCR_FIELDS, mergeVehicleOcr, type MobileVehicleOcr, type VehicleOcrValues } from "../../../shared/mobile-vehicle-ocr";
import { selectRecordMediaPhoto, type RecordMediaPhoto } from "@/lib/record-media-photo";
import { useSession } from "@/providers/session";
import { useTheme } from "@/theme";
import { Button, Card, InlineError } from "./ui";
const labels: Record<keyof VehicleOcrValues, string> = { license: "Biển số", chassis: "Số khung", engine: "Số máy", color: "Màu sắc", year: "Năm sản xuất" };
export function VehicleRegistrationOcr({ values, disabled, onApply }: { values: VehicleOcrValues; disabled: boolean; onApply: (values: VehicleOcrValues) => void }) {
  const { api } = useSession(), theme = useTheme();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [review, setReview] = useState<{ result: MobileVehicleOcr; before: VehicleOcrValues; uri: string } | null>(null);
  const current = useRef(values), previousAi = useRef<Partial<VehicleOcrValues>>({}), photo = useRef<RecordMediaPhoto | null>(null);
  const control = useRef<AbortController | null>(null), alive = useRef(true), running = useRef(false);
  useLayoutEffect(() => { current.current = values; }, [values]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; control.current?.abort(); photo.current?.dispose(); }; }, []);
  useEffect(() => { if (disabled) control.current?.abort(); }, [disabled]);
  async function read(camera: boolean) {
    if (!api || disabled || running.current) return;
    running.current = true; setBusy(true); setError(""); setReview(null); setNotice(""); photo.current?.dispose(); photo.current = null;
    const abort = new AbortController(); control.current = abort;
    try {
      const selected = await selectRecordMediaPhoto(camera, abort.signal);
      if (!selected) return;
      if (!alive.current || abort.signal.aborted) { selected.dispose(); return; }
      photo.current = selected;
      const before = { ...current.current }, result = await api.vehicleOcr(await selected.bytes(), uuid.v4().toLowerCase(), abort.signal);
      if (alive.current && !abort.signal.aborted) setReview({ result, before, uri: selected.uri });
    } catch (cause) { if (alive.current && !abort.signal.aborted) setError((cause as Error).message); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  function apply() {
    if (!review || disabled) return;
    const merged = mergeVehicleOcr(current.current, review.result.fields, review.before, previousAi.current);
    previousAi.current = { ...previousAi.current, ...merged.applied }; onApply(merged.values);
    setNotice(Object.keys(merged.applied).length ? `Đã điền: ${Object.keys(merged.applied).map(key => labels[key as keyof VehicleOcrValues]).join(", ")}.` : "Thông tin nhập tay được giữ nguyên. Chọn trường cần sửa để nhập bổ sung.");
    setReview(null); photo.current?.dispose(); photo.current = null;
  }
  return <Card style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Đọc đăng ký xe</Text>
    <Text style={{ color: theme.muted, lineHeight: 22 }}>Rà soát thông tin trước khi áp dụng. Lưu ảnh giấy tờ trong hồ sơ xe sau khi lưu thông tin.</Text>
    <View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><Button secondary label="Chụp đăng ký xe" loading={busy} disabled={disabled} onPress={() => { void read(true); }} /></View><View style={{ flex: 1 }}><Button secondary label="Chọn ảnh đăng ký" disabled={disabled || busy} onPress={() => { void read(false); }} /></View></View>
    {!!error && <InlineError message={error} />}
    {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.text }}>{notice}</Text>}
    {review && <View style={{ gap: 10 }}>
      <Image source={{ uri: review.uri }} style={{ height: 180, borderRadius: 12 }} contentFit="contain" accessibilityLabel="Ảnh đăng ký đang rà soát OCR" />
      {VEHICLE_OCR_FIELDS.map(key => <Text key={key} style={{ color: theme.text }}>{labels[key]}: {review.result.fields[key] || "Chưa đọc được"}</Text>)}
      {review.result.warnings.map((warning, index) => <Text key={index} style={{ color: theme.warning, lineHeight: 22 }}>{warning}</Text>)}
      <Button label="Áp dụng thông tin đã rà soát" disabled={disabled} onPress={apply} />
      <Button secondary label="Bỏ kết quả OCR" onPress={() => { setReview(null); photo.current?.dispose(); photo.current = null; }} />
    </View>}
  </Card>;
}
