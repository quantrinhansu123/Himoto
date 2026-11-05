import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react-native";
import type {
  MobileContractDraft,
  MobileDraftCustomer,
  MobileDraftInput,
  MobileDraftOptions,
  MobileDraftProfile,
  MobileVehicleAvailability,
} from "@himoto/mobile-contract";
import {
  validDraftTime,
  draftWindowDifferences,
  alignDraftWindow,
} from "@himoto/mobile-draft-validation";
import { useSession } from "@/providers/session";
import { useTheme, dateTime } from "@/theme";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useDraftWrite } from "@/hooks/use-draft-write";
import { ApiError } from "@/lib/api";
import {
  addDraftVehicle,
  emptyDraftVehicle,
  changeDraftTime,
  chooseDraftCustomer,
  chooseDraftType,
  draftErrors,
  draftSteps,
  errorDraftStep,
  newDraftInput,
  restoreDraftType,
  type DraftErrors,
} from "@/lib/draft-form";
import { Button, Card, InlineError, StateView, StatusBadge } from "./ui";
import { ContractTypeManager } from "./contract-type-manager";
import { ChoiceField, FormField } from "./form-fields";
import { DateField } from "./date-field";
import { RentalDateTime } from "./rental-date-time";
import { ConfirmEdit } from "./editor-sheet";
import { DraftCustomerPicker, DraftVehiclePicker } from "./draft-pickers";
import { CustomerCreateSheet } from "./customer-editor";
import {useDraftWorkLifecycle} from '@/hooks/use-draft-work-lifecycle';
import {DraftWorkGate} from './draft-work-gate';
import type {DraftWorkController,WorkLocalPhoto} from '@/lib/draft-work-controller';
import {useContractPhotos} from '@/hooks/use-contract-photos';
import {ContractPhotoFields} from './contract-photo-fields';
import {ContractPhotoSave} from './contract-photo-save';
import {CustomerPhotoCopyStage} from './customer-photo-copy';
import {plateSelectionIndex} from '../../../shared/mobile-plate-ocr';
import {
  DraftFees,
  DraftRequirements,
  DraftParty,
  DraftPeople,
  DraftSection,
  DraftVehicleLines,
} from "./draft-document-fields";

export function DraftEditor({ id,workId,backfill=false,defaultStore }: { id: string | null;workId?:string;backfill?:boolean;defaultStore?:string }) {
  const { api, session } = useSession();
  const allowed =
    !!session?.user.permissions.includes("contracts.draft") &&
    session.user.permissions.includes("contracts.read");
  const valid = id === null || /^[1-9]\d{0,14}$/.test(id);
  const scope = [
    session?.user.id,
    session?.user.storeId,
    session?.user.allStores,
  ];
  const options = useQuery({
    queryKey: ["draft-options", ...scope],
    queryFn: ({ signal }) => api!.draftOptions(signal),
    enabled: !!api && allowed && valid,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const profile = useQuery({
    queryKey: ["draft-edit", ...scope, id],
    queryFn: ({ signal }) => api!.draft(id!, signal),
    enabled: !!api && allowed && valid && id !== null,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (!allowed || !valid)
    return (
      <StateView
        title="Không mở được bản nháp"
        message="Kiểm tra liên kết và quyền soạn hợp đồng."
      />
    );
  if (options.isPending || (id !== null && profile.isPending))
    return <StateView title="Đang mở bản nháp" loading />;
  if (!options.data)
    return (
      <StateView
        title="Chưa tải được thông tin hợp đồng"
        message={options.error?.message}
        retry={() => {
          void options.refetch();
        }}
      />
    );
  if (
    id !== null &&
    profile.isError &&
    (!profile.data ||
      (profile.error instanceof ApiError &&
        [403, 404, 409].includes(profile.error.status)))
  )
    return (
      <StateView
        title="Chưa mở được bản nháp"
        message={profile.error.message}
        retry={() => {
          void profile.refetch();
        }}
      />
    );
  return (
    <DraftWorkGate key={`${api?.origin}:${session?.token}:${session?.user.permissions.join(',')}:${scope.join(":")}:${id||"new"}:${workId||""}`} id={id} workId={workId} backfill={backfill}>{(work,initialPhotos)=><DraftForm
      key={`${api?.origin}:${session?.token}:${session?.user.permissions.join(',')}:${scope.join(":")}:${id || "new"}:${work?.id||"memory"}`}
      id={work?.getHead()?work.getHead()!.work.baseDraftId===null?null:String(work.getHead()!.work.baseDraftId):id} work={work} initialPhotos={initialPhotos}
      options={options.data!} backfill={backfill} defaultStore={defaultStore}
      profile={id === null ? undefined : profile.data}
    />}</DraftWorkGate>
  );
}
function DraftForm({
  id,
  options,
  profile,work,initialPhotos,backfill=false,defaultStore,
}: {
  id: string | null;
  options: MobileDraftOptions;
  profile?: MobileDraftProfile;work:DraftWorkController|null;initialPhotos:WorkLocalPhoto[];backfill?:boolean;defaultStore?:string;
}) {
  const theme = useTheme(),
    reduced = useReducedMotion(),
    { api, session } = useSession();
  const [input, setInput] = useState(() =>
    work?.initialInput??(profile ? restoreDraftType(profile.input, options) : (()=>{const value=newDraftInput(options);if(defaultStore&&options.stores.some(s=>String(s.id)===defaultStore)){value.draft.store_id=defaultStore;value.draft.vehicle_store_id=defaultStore;}if(backfill)value.draft.backfill={note:""};return value;})()),
  );
  const [baseline, setBaseline] = useState(() => JSON.stringify(input)),
    [step, setStep] = useState(work?.initialStep??0),
    [errors, setErrors] = useState<DraftErrors>({});
  const [typeManager,setTypeManager]=useState(false);
  const [customerPicker, setCustomerPicker] = useState(false),
    [customerCreate, setCustomerCreate] = useState(false),
    [vehiclePicker, setVehiclePicker] = useState(false),
    [alignWindow, setAlignWindow] = useState(false),
    [pendingCustomer, setPendingCustomer] =
      useState<MobileDraftCustomer | null>(null);
  const [availabilityRequest, setAvailabilityRequest] = useState<{
      vehicleIds: number[];
      startsAt: string;
      endsAt: string;
      draftId?: number;
    } | null>(null),
    [localError, setLocalError] = useState("");
  const scroll = useRef<ScrollViewInstance>(null);
  const { width, height } = useWindowDimensions();
  const compact = width > height && height < 500;
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const d = input.draft,
    inputRef=useRef(input);
  useEffect(()=>{inputRef.current=input;},[input]);
  const [photoStage,setPhotoStage]=useState(false),[copyStage,setCopyStage]=useState(false);
  const photos=useContractPhotos({work,initialPhotos,getVehicleIds:()=>inputRef.current.draft.vehicles.map(v=>v.id),onVehicle:(vehicle,before,scan)=>{
    const value=inputRef.current,index=plateSelectionIndex(before,value.draft.vehicles.map(v=>v.id),vehicle.id,scan);
    if(value.draft.vehicles[index]?.id===vehicle.id)return;
    const line=addDraftVehicle({...value,draft:{...value.draft,vehicles:[value.draft.vehicles[index]]}},vehicle).draft.vehicles[0];
    change({...value,draft:{...value.draft,vehicles:value.draft.vehicles.map((v,i)=>i===index?line:v)}});
  }});
  const dirty=JSON.stringify(input)!==baseline||photos.photos.length>0;
  useDraftWorkLifecycle(!!work,photos.prepareTransition,cause=>setLocalError((cause as Error).message));
  const stepRef=useRef(step),[localSave,setLocalSave]=useState(()=>work?.getState()??{saving:false,error:'',scopeChanged:false,waiting:false});
  useEffect(()=>{stepRef.current=step;},[step]);
  useEffect(()=>{if(!work)return;work.setReader(()=>({input:inputRef.current,step:stepRef.current}));return work.subscribe(()=>setLocalSave(work.getState()));},[work]);
  useEffect(()=>{if(work&&dirty&&!work.metadataReceipt())work.schedule();},[work,input,step,dirty]);
  useEffect(()=>()=>{if(work)void work.detach().catch(()=>{});},[work]);
  function reset(next: MobileDraftInput) {
    const normalized = restoreDraftType(next, options);
    setInput(normalized);
    setBaseline(JSON.stringify(normalized));
    setErrors({});
    setLocalError("");
    setStep(0);
    setAvailabilityRequest(null);
    setPendingCustomer(null);
    setAlignWindow(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function reveal(fields: DraftErrors) {
    setErrors(fields);
    if (Object.keys(fields).length) setStep(errorDraftStep(fields));
    scroll.current?.scrollTo({ y: 0, animated: !reduced });
    AccessibilityInfo.announceForAccessibility(
      "Kiểm tra thông tin bản nháp để tiếp tục.",
    );
  }
  const write = useDraftWrite({
    id,work,beforeLeave:photos.prepareTransition,
    input,
    dirty,
    onReload: reset,
    onReset: () => reset(newDraftInput(options)),
    onError: reveal,
    onCommitted:result=>{if(photos.getPhotos().some(row=>row.savedTo!==result.id)){setPhotoStage(true);return true;}if(inputRef.current.draft.customer_id&&!work?.getHead()?.work.attempts.some(a=>a.kind==='copy'&&a.state==='committed'&&a.acknowledged)){setCopyStage(true);return true;}return false;},
  });
  const disabled = write.busy || !!write.receipt || !!pendingCustomer || customerCreate || localSave.scopeChanged || localSave.waiting;
  const staff = useQuery({
    queryKey: ["draft-staff", session?.user.id],
    queryFn: ({ signal }) => api!.draftStaff(signal),
    enabled: !!api && step === 0,
    staleTime: 60000,
    gcTime: 60000,
  });
  const availability = useQuery({
    queryKey: ["draft-availability", session?.user.id, availabilityRequest],
    queryFn: ({ signal }) =>
      api!.draftAvailability(availabilityRequest!, signal),
    enabled: !!api && !!availabilityRequest,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const selected = d.vehicles
    .filter((row) => row.id)
    .map((row) => Number(row.id));
  const currentSignature = JSON.stringify({
    vehicleIds: [...new Set(selected)].sort((a, b) => a - b),
    startsAt: d.start_date,
    endsAt: d.end_date,
    ...(id ? { draftId: Number(id) } : {}),
  });
  const availabilityCurrent =
    availabilityRequest &&
    JSON.stringify(availabilityRequest) === currentSignature;
  function change(next: MobileDraftInput) {
    if (disabled) return;
    inputRef.current=next;
    setInput(next);
    setErrors({});
    setLocalError("");
    write.clearError();
  }
  const set = <K extends keyof MobileContractDraft>(
    key: K,
    value: MobileContractDraft[K],
  ) => change({ ...input, draft: { ...d, [key]: value } });
  function jump(index: number) {
    Keyboard.dismiss();
    stepRef.current=index;setStep(index);
    if(work&&dirty)void work.flush(inputRef.current,index).catch(cause=>setLocalError((cause as Error).message));
    scroll.current?.scrollTo({ y: 0, animated: !reduced });
    AccessibilityInfo.announceForAccessibility(
      `Bước ${index + 1}: ${draftSteps[index]}`,
    );
  }
  function save() {
    if(photos.picking||photos.reading)return;
    if(photos.getPhotos().some(p=>p.slot.startsWith('scan_plate')||p.slot.startsWith('plate-')&&!d.vehicles.some(v=>p.slot===`plate-${v.id}`||p.slot.startsWith(`plate-${v.id}-extra-`)))){
      setLocalError('Có ảnh biển số chưa gắn đúng xe đang chọn. Rà soát, gắn xe hoặc bỏ ảnh này trước khi lưu nháp.');setStep(2);return;
    }
    Keyboard.dismiss();
    const fields = draftErrors(input);
    if (Object.keys(fields).length) {
      reveal(fields);
      return;
    }
    void photos.ensurePersistent().then(()=>write.submit()).catch(cause=>setLocalError((cause as Error).message));
  }
  function check() {
    Keyboard.dismiss();
    if (
      !selected.length ||
      !validDraftTime(d.start_date) ||
      !validDraftTime(d.end_date) ||
      d.end_date <= d.start_date
    ) {
      setLocalError(
        "Chọn xe và nhập đủ ngày giờ nhận/trả hợp lệ trước khi kiểm tra lịch.",
      );
      scroll.current?.scrollTo({ y: 0, animated: !reduced });
      return;
    }
    const next = {
      vehicleIds: [...new Set(selected)].sort((a, b) => a - b),
      startsAt: d.start_date,
      endsAt: d.end_date,
      ...(id ? { draftId: Number(id) } : {}),
    };
    setLocalError("");
    if (JSON.stringify(next) === JSON.stringify(availabilityRequest))
      void availability.refetch();
    else setAvailabilityRequest(next);
  }
  const typeChoices = options.types
    .filter((row) => row.active || row.id === d.contract_type_id)
    .map((row) => ({
      value: row.id,
      label: `${row.label}${row.active ? "" : " (đã ẩn)"}`,
    }));
  const props = { input, change, disabled, errors };
  return (
    <SafeAreaView
      edges={
        compact
          ? ["top", "left", "right", "bottom"]
          : ["left", "right", "bottom"]
      }
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <Stack.Screen
        options={{
          title: profile ? `Soạn ${profile.code}` : d.backfill ? "Nhập bổ sung lịch sử" : "Thêm bản nháp",
          headerShown: !compact,
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {compact && keyboardVisible ? (
          <View
            style={{
              minHeight: 48,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: theme.surface,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 14 }}>
              {step + 1}. {draftSteps[step]}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ẩn bàn phím"
              onPress={Keyboard.dismiss}
              style={{
                minHeight: 48,
                minWidth: 48,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: theme.primary,
                  fontSize: 16,
                  fontWeight: "600",
                }}
              >
                Xong
              </Text>
            </Pressable>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: theme.surface,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <View
              style={{
                maxWidth: 760,
                alignSelf: "center",
                width: "100%",
                paddingHorizontal: 12,
                paddingVertical: compact ? 0 : 8,
                flexDirection: "row",
                gap: 4,
              }}
            >
              {compact && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Quay lại"
                  disabled={write.busy}
                  onPress={() => router.back()}
                  style={{
                    minWidth: 48,
                    minHeight: 48,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ChevronLeft
                    size={22}
                    color={theme.text}
                    accessible={false}
                  />
                </Pressable>
              )}
              {draftSteps.map((name, index) => (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  accessibilityLabel={`Bước ${index + 1}: ${name}`}
                  accessibilityState={{ selected: index === step, disabled }}
                  disabled={disabled}
                  onPress={() => jump(index)}
                  style={{
                    flex: 1,
                    minHeight: compact ? 48 : 60,
                    flexDirection: compact ? "row" : "column",
                    padding: 6,
                    gap: 5,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 12,
                    backgroundColor:
                      index === step ? theme.tint : theme.surface,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "800",
                      color: index === step ? theme.primary : theme.muted,
                    }}
                  >
                    {index + 1}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      textAlign: "center",
                      color: index === step ? theme.primary : theme.muted,
                    }}
                  >
                    {name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          contentContainerStyle={{
            padding: 18,
            gap: 16,
            maxWidth: 760,
            width: "100%",
            alignSelf: "center",
            paddingBottom: 28,
          }}
        >
          <View style={{ gap: 8 }}>
            <Text
              accessibilityRole="header"
              style={{ color: theme.text, fontSize: 23, fontWeight: "700" }}
            >
              {step + 1}. {draftSteps[step]}
            </Text>
            {!compact && (
              <Text
                style={{ color: theme.muted, fontSize: 14, lineHeight: 22 }}
              >
                Có thể lưu nháp ở mỗi bước để bổ sung sau. Ngày giờ sử dụng giờ
                Việt Nam.
              </Text>
            )}
          </View>
          {!!Object.keys(errors).length && (
            <InlineError
              message={
                Object.values(errors)[0] || "Kiểm tra các mục được đánh dấu."
              }
            />
          )}
          {!!localError && <InlineError message={localError} />}
          {!!write.error && (
            <View style={{ gap: 12 }}>
              <InlineError message={write.error} />
              <Button
                secondary
                label="Kiểm tra lần lưu trước"
                loading={write.checking}
                onPress={() => {
                  void write.checkPrevious();
                }}
              />
              {id && write.code === "DRAFT_CONFLICT" && (
                <Button
                  secondary
                  label="Tải bản nháp mới"
                  onPress={write.askReload}
                />
              )}
            </View>
          )}
          {write.receipt && (
            <Card style={{ gap: 14, borderColor: theme.primary }}>
              <Text
                accessibilityRole="header"
                style={{ color: theme.text, fontSize: 19, fontWeight: "700" }}
              >
                Lần lưu trước đã thành công
              </Text>
              <Text
                style={{ color: theme.muted, fontSize: 14, lineHeight: 22 }}
              >
                Mở hồ sơ đã lưu để kiểm tra và tiếp tục bản nháp.
              </Text>
              <Button
                label={photos.photos.some(row=>row.savedTo!==write.receipt?.id)?'Hoàn tất ảnh bản nháp đã lưu':d.customer_id?'Hoàn tất giấy tờ bản nháp đã lưu':'Xem bản nháp đã lưu'}
                loading={write.checking}
                onPress={() => {
                  void write.openReceipt();
                }}
              />
              {id === null && !work && !photos.photos.length && !d.customer_id && (
                <Button
                  secondary
                  label="Tạo bản nháp mới"
                  loading={write.checking}
                  onPress={() => {
                    void write.startAnother();
                  }}
                />
              )}
            </Card>
          )}
          {step === 0 && (
            <>
              <DraftSection title="Hợp đồng và cơ sở">
                <ChoiceField
                  label="Loại hợp đồng"
                  value={d.contract_type_id || ""}
                  choices={typeChoices}
                  disabled={disabled}
                  error={errors.contract_type_id}
                  onChange={(value) => {
                    const type = options.types.find((row) => row.id === value);
                    if (type) change(chooseDraftType(input, type));
                  }}
                />
                {session?.user.permissions.includes("settings.write")&&session.user.permissions.includes("finance.write")&&<Button secondary label="Quản lý loại hợp đồng ngay khi soạn" disabled={disabled} onPress={()=>setTypeManager(true)} />}
                <ChoiceField
                  label="Cơ sở ghi nhận hợp đồng"
                  value={d.store_id}
                  choices={options.stores.map((row) => ({
                    value: String(row.id),
                    label: row.name,
                  }))}
                  disabled={disabled || !session?.user.allStores}
                  error={errors.store_id}
                  onChange={(value) => set("store_id", value)}
                  searchable
                />
                <ChoiceField
                  label="Cơ sở xe / nhân sự"
                  value={d.vehicle_store_id || d.store_id}
                  choices={options.vehicleStores.map((row) => ({
                    value: String(row.id),
                    label: row.name,
                  }))}
                  disabled={disabled}
                  onChange={(value) => set("vehicle_store_id", value)}
                  searchable
                />
                <FormField
                  label="Số hợp đồng giấy"
                  value={d.contract_number}
                  editable={!disabled}
                  maxLength={32}
                  onChangeText={(value) => set("contract_number", value)}
                  hint="Để trống nếu chưa có số hợp đồng giấy."
                  error={errors.contract_number}
                />
              </DraftSection>
              {staff.isError && (
                <View style={{ gap: 12 }}>
                  <InlineError message="Chưa tải được danh sách nhân sự. Có thể nhập tên hoặc thử tải lại." />
                  <Button
                    secondary
                    label="Tải lại nhân sự"
                    onPress={() => {
                      void staff.refetch();
                    }}
                  />
                </View>
              )}
              <DraftPeople
                input={input}
                change={change}
                disabled={disabled}
                staff={staff.data?.rows || []}
                stores={options.vehicleStores}
              />
              <DraftRequirements {...props} />
              <DraftSection title="Ngày và thông tin bổ sung">
                <DateField
                  label="Ngày tạo / nhập hợp đồng"
                  value={d.created_on}
                  onChange={(value) => set("created_on", value)}
                  disabled={disabled}
                  error={errors.created_on}
                />
                <DateField
                  label="Ngày ký hợp đồng"
                  value={d.signed_on}
                  onChange={(value) => set("signed_on", value)}
                  disabled={disabled}
                  error={errors.signed_on}
                />
                {d.backfill && (
                  <>
                    <Text
                      style={{
                        color: theme.warning,
                        fontSize: 14,
                        lineHeight: 22,
                      }}
                    >
                      Bản nháp nhập bổ sung lịch sử. Kiểm tra thời gian thực tế
                      trước khi phát hành.
                    </Text>
                    <ChoiceField label="Tình trạng thực tế của hợp đồng bổ sung" value={d.backfill.returned_at===undefined?'ongoing':'returned'} choices={[{value:'ongoing',label:'Khách còn đang thuê'},{value:'returned',label:'Khách đã trả xe từ trước'}]} disabled={disabled} onChange={v=>set("backfill",{note:d.backfill!.note,...(v==='returned'?{returned_at:''}:{})})} />
                    <FormField
                      label="Lý do nhập bổ sung"
                      value={d.backfill.note}
                      editable={!disabled}
                      maxLength={1000}
                      multiline
                      onChangeText={(value) =>
                        set("backfill", { ...d.backfill!, note: value })
                      }
                    />
                    {d.backfill.returned_at !== undefined && (
                      <RentalDateTime
                        label="trả xe thực tế"
                        value={d.backfill.returned_at}
                        disabled={disabled}
                        onChange={(value) =>
                          set("backfill", {
                            ...d.backfill!,
                            returned_at: value,
                          })
                        }
                      />
                    )}
                  </>
                )}
              </DraftSection>
            </>
          )}
          {step === 1 && (
            <>
              {session?.user.permissions.includes("customers.read") && (
                <Button
                  secondary
                  label="Chọn hồ sơ khách"
                  disabled={disabled}
                  onPress={() => {
                    Keyboard.dismiss();
                    setCustomerPicker(true);
                  }}
                />
              )}
              {session?.user.permissions.includes("customers.read") && session.user.permissions.includes("customers.write") && (
                <Button
                  secondary
                  label="Thêm khách trong hợp đồng"
                  disabled={disabled}
                  onPress={() => {
                    Keyboard.dismiss();
                    setCustomerCreate(true);
                  }}
                />
              )}
              {pendingCustomer && (
                <Card style={{ gap: 14, borderColor: theme.warning }}>
                  <Text
                    style={{
                      color: theme.text,
                      fontWeight: "700",
                      fontSize: 18,
                    }}
                  >
                    Dùng hồ sơ {pendingCustomer.details.name}?
                  </Text>
                  <Text
                    style={{ color: theme.muted, fontSize: 14, lineHeight: 22 }}
                  >
                    Thông tin khách và người thân trên bản nháp sẽ được cập
                    nhật.
                    {id
                      ? " Khi lưu, giấy tờ gắn với khách cũ sẽ được gỡ khỏi hợp đồng."
                      : ""}
                  </Text>
                  <Button
                    label="Dùng hồ sơ đã chọn"
                    onPress={() => {
                      setInput(chooseDraftCustomer(input, pendingCustomer));
                      setPendingCustomer(null);
                      setErrors({});
                      write.clearError();
                    }}
                  />
                  <Button
                    secondary
                    label="Giữ thông tin hiện tại"
                    onPress={() => setPendingCustomer(null)}
                  />
                </Card>
              )}
              <DraftParty {...props} />
            </>
          )}
          {step === 2 && (
            <>
              <DraftSection title="Thời gian thuê">
                <RentalDateTime
                  label="nhận xe"
                  value={d.start_date}
                  onChange={(value) =>
                    change(changeDraftTime(input, "start_date", value))
                  }
                  disabled={disabled}
                  error={errors.start_date}
                />
                <RentalDateTime
                  label="hẹn trả xe"
                  value={d.end_date}
                  onChange={(value) =>
                    change(changeDraftTime(input, "end_date", value))
                  }
                  disabled={disabled}
                  error={errors.end_date}
                />
              </DraftSection>

              <Button
                secondary
                label="Thêm xe vào bản nháp"
                disabled={disabled || selected.length >= 50}
                onPress={() => {
                  Keyboard.dismiss();
                  setVehiclePicker(true);
                }}
              />
              <DraftSection title="Đối chiếu lịch xe">
                <Text
                  style={{ color: theme.muted, fontSize: 14, lineHeight: 22 }}
                >
                  {selected.length} xe đã chọn · {dateTime(d.start_date)} →{" "}
                  {dateTime(d.end_date)}
                </Text>
                <Text
                  style={{ color: theme.muted, fontSize: 13, lineHeight: 20 }}
                >
                  Lịch hợp đồng dùng chung cho mọi xe khi tính tiền, in và phát
                  hành.
                </Text>
                {draftWindowDifferences(d).length > 0 && (
                  <View style={{ gap: 12 }}>
                    <InlineError message="Có dòng xe còn lưu thời gian khác với lịch hợp đồng. Đối chiếu và đồng bộ trước khi phát hành." />
                    <Button
                      secondary
                      label="Đồng bộ lịch các xe"
                      disabled={
                        disabled ||
                        !validDraftTime(d.start_date) ||
                        !validDraftTime(d.end_date) ||
                        d.end_date <= d.start_date
                      }
                      onPress={() => setAlignWindow(true)}
                    />
                  </View>
                )}
                <Button
                  secondary
                  label="Kiểm tra lịch thuê"
                  disabled={disabled}
                  loading={availability.isFetching && !!availabilityCurrent}
                  onPress={check}
                />
                {availabilityRequest && !availabilityCurrent && (
                  <Text
                    accessibilityRole="alert"
                    style={{
                      color: theme.warning,
                      fontSize: 14,
                      lineHeight: 22,
                    }}
                  >
                    Xe hoặc thời gian đã đổi. Kiểm tra lại lịch trước khi phát
                    hành.
                  </Text>
                )}
                {availabilityCurrent && availability.isError && (
                  <InlineError message={availability.error.message} />
                )}
                {availabilityCurrent && availability.data && (
                  <Availability
                    value={availability.data}
                    labels={Object.fromEntries(
                      d.vehicles.map((row) => [
                        Number(row.id),
                        `${row.license} · ${row.name}`,
                      ]),
                    )}
                  />
                )}
              </DraftSection>
              <DraftVehicleLines {...props} />
              {!d.vehicles.some(v=>!v.id)&&<Button label="Thêm dòng xe để quét biển số" secondary disabled={disabled||d.vehicles.length>=50||photos.reading||photos.picking} onPress={()=>change({...input,draft:{...d,vehicles:[...d.vehicles,{...emptyDraftVehicle(),rent_at:d.start_date,return_at:d.end_date}]}})}/>}
              <ContractPhotoFields photos={photos} vehicles={d.vehicles} disabled={disabled} plates canOcr={!!session?.user.permissions.includes('customers.write')}/>
            </>
          )}
          {step === 3 && <DraftFees {...props} />}
          {step === 4 && (
            <>
              <DraftSection title="Ký kết và ghi chú">
                <DateField
                  label="Ngày ủy quyền"
                  value={d.authorization_date}
                  onChange={(value) => set("authorization_date", value)}
                  disabled={disabled}
                  error={errors.authorization_date}
                />
                <FormField
                  label="Ghi chú bản nháp"
                  value={input.notes}
                  onChangeText={(notes) => change({ ...input, notes })}
                  editable={!disabled}
                  multiline
                  maxLength={4000}
                />
              </DraftSection>
              <DraftSection title="Rà soát bản nháp">
                <ContractPhotoFields photos={photos} vehicles={d.vehicles} disabled={disabled} canOcr={!!session?.user.permissions.includes('customers.write')}/>
                <Summary
                  label="Loại hợp đồng"
                  value={d.contract_type_name || "Chưa chọn"}
                />
                <Summary
                  label="Cơ sở"
                  value={
                    options.stores.find((row) => String(row.id) === d.store_id)
                      ?.name || "Chưa chọn"
                  }
                />
                <Summary
                  label="Khách thuê"
                  value={d.customer.name || "Chưa điền"}
                />
                <Summary label="Xe đã chọn" value={`${selected.length} xe`} />
                <Summary label="Nhận xe" value={dateTime(d.start_date)} />
                <Summary label="Hẹn trả" value={dateTime(d.end_date)} />
                <Text
                  style={{ color: theme.muted, fontSize: 14, lineHeight: 22 }}
                >
                  Lưu nháp giữ hồ sơ để bổ sung và phát hành theo quy trình
                  nghiệp vụ.
                </Text>
              </DraftSection>
            </>
          )}
        </ScrollView>
        {!(compact && keyboardVisible) && (
          <View
            style={{
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: theme.border,
              backgroundColor: theme.surface,
            }}
          >
            <View
              style={{
                maxWidth: 724,
                width: "100%",
                alignSelf: "center",
                gap: 10,
              }}
            >
              <View style={{ flexDirection: "row", gap: 10 }}>
                {step > 0 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Bước trước"
                    disabled={disabled}
                    onPress={() => jump(step - 1)}
                    style={{
                      minHeight: 52,
                      minWidth: 48,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: theme.controlBorder,
                      borderRadius: 14,
                    }}
                  >
                    <ChevronLeft
                      size={22}
                      color={theme.text}
                      accessible={false}
                    />
                  </Pressable>
                )}
                <View style={{ flex: 1 }}>
                  <Button
                    label="Lưu nháp"
                    loading={write.busy}
                    disabled={
                      !write.checked || !!write.receipt || !!pendingCustomer || customerCreate || photos.picking || photos.reading || localSave.scopeChanged || localSave.waiting
                    }
                    onPress={save}
                  />
                </View>
                {step < draftSteps.length - 1 && (
                  <View style={{ flex: 1 }}>
                    <Button
                      secondary
                      label="Tiếp theo"
                      disabled={disabled}
                      onPress={() => jump(step + 1)}
                    />
                  </View>
                )}
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
      {customerCreate && (
        <CustomerCreateSheet
          storeId={Number(d.store_id) || session?.user.storeId || null}
          onClose={() => setCustomerCreate(false)}
          onPick={(row) => {
            setInput((current) => chooseDraftCustomer(current, row));
            setCustomerCreate(false);
            setErrors({});
            write.clearError();
            scroll.current?.scrollTo({ y: 0, animated: false });
          }}
        />
      )}
      {typeManager&&<ContractTypeManager onClose={()=>setTypeManager(false)} onCreated={type=>{change(chooseDraftType(inputRef.current,{id:type.id,label:type.label,rentalType:type.rental_type,termMonths:type.term_months,active:type.active}));setTypeManager(false);}} />}
      {customerPicker && (
        <DraftCustomerPicker
          onClose={() => setCustomerPicker(false)}
          onPick={(row) => {
            setCustomerPicker(false);
            if (d.customer_id === row.id && !d.customer.name) {
              change(chooseDraftCustomer(input, row));
            } else setPendingCustomer(row);
            scroll.current?.scrollTo({ y: 0, animated: false });
          }}
        />
      )}
      {vehiclePicker && (
        <DraftVehiclePicker
          stores={options.vehicleStores}
          initialStore={d.vehicle_store_id || d.store_id}
          selectedIds={d.vehicles.map((row) => row.id)}
          onClose={() => setVehiclePicker(false)}
          onPick={(row) => {
            try {
              change(addDraftVehicle(input, row));
              setVehiclePicker(false);
            } catch (failure) {
              setLocalError((failure as Error).message);
              setVehiclePicker(false);
            }
            scroll.current?.scrollTo({ y: 0, animated: false });
          }}
        />
      )}
      {alignWindow && (
        <ConfirmEdit
          title="Đồng bộ lịch các xe?"
          message="Thời gian lưu trên các dòng xe sẽ đổi theo ngày nhận và hẹn trả chung của hợp đồng. Kiểm tra rồi lưu nháp để giữ thay đổi."
          confirmLabel="Áp dụng lịch hợp đồng"
          onCancel={() => setAlignWindow(false)}
          onConfirm={() => {
            change({ ...input, draft: alignDraftWindow(d) });
            setAlignWindow(false);
            setAvailabilityRequest(null);
          }}
        />
      )}
      {work&&<View style={{paddingHorizontal:18,paddingBottom:8}}><Text accessibilityLiveRegion="polite" style={{color:localSave.error?theme.danger:theme.muted}}>{localSave.error|| (localSave.saving?'Đang giữ bản trên thiết bị…':work.getHead()?'Đã giữ bản trên thiết bị':'Bản chưa có thay đổi')}</Text></View>}
      {photoStage&&write.receipt&&<ContractPhotoSave contractId={write.receipt.id} revision={write.receipt.revision} copyAfter={!!d.customer_id} documents={photos} vehicles={d.vehicles} onClose={()=>setPhotoStage(false)} onComplete={async()=>{await write.completePhotos();}}/>}
      {copyStage&&write.receipt&&<CustomerPhotoCopyStage id={write.receipt.id} revision={write.receipt.revision} work={work} onClose={()=>setCopyStage(false)} onComplete={async()=>{await write.completePhotos();}}/>}
      {(write.exit || write.reload) && (
        <ConfirmEdit
          title={
            write.busy
              ? "Đang lưu bản nháp"
              : write.reload
                ? "Tải bản nháp mới?"
                : "Rời bản nháp?"
          }
          message={
            write.busy
              ? "Chờ máy chủ xác nhận kết quả lưu."
              : write.reload
                ? "Thông tin đang nhập sẽ được thay bằng bản mới từ máy chủ."
                : work?"Bản đang soạn và ảnh sẽ được giữ trên thiết bị. Mở lại bằng tài khoản này để tiếp tục.":"Thông tin chưa lưu sẽ mất. Nếu vừa gửi lưu, có thể kiểm tra kết quả khi mở lại bản nháp."
          }
          busy={write.busy}
          onCancel={write.dismissPrompt}
          onConfirm={
            write.reload
              ? () => {
                  void write.loadLatest();
                }
              : write.leave
          }
          confirmLabel={write.reload ? "Tải bản nháp mới" : "Rời bản nháp"}
        />
      )}
    </SafeAreaView>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: theme.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: 16, lineHeight: 24 }}>
        {value}
      </Text>
    </View>
  );
}
function Availability({
  value,
  labels,
}: {
  value: MobileVehicleAvailability;
  labels: Record<number, string>;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 20 }}>
        Đã kiểm tra lúc {dateTime(value.checkedAt)}. Lịch được kiểm tra lại khi
        phát hành.
      </Text>
      {value.vehicles.map((row) => (
        <View key={row.id} style={{ gap: 10 }}>
          <Text
            accessibilityRole="header"
            style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}
          >
            {labels[row.id] || "Xe đã chọn"}
          </Text>
          <StatusBadge status={row.status} />
          <Text
            style={{
              fontSize: 14,
              lineHeight: 22,
              color: row.hasHardBlocker
                ? theme.danger
                : row.reservationOverlap
                  ? theme.warning
                  : theme.success,
            }}
          >
            {row.hasHardBlocker
              ? "Có hợp đồng chưa đóng"
              : row.reservationOverlap
                ? "Chồng lịch xe đã cọc"
                : "Chưa thấy hợp đồng cản lịch trong lần kiểm tra này"}
          </Text>
          {row.blockers.map((blocker, index) => (
            <Text
              key={index}
              style={{
                color:
                  blocker.severity === "hard" ? theme.danger : theme.warning,
                fontSize: 13,
                lineHeight: 20,
              }}
            >
              {blocker.code} · {blocker.storeName}
              {blocker.startsAt ? ` · ${dateTime(blocker.startsAt)}` : ""}
            </Text>
          ))}
          {row.blockersTotal > row.blockers.length && (
            <Text style={{ color: theme.muted, fontSize: 13 }}>
              Hiển thị {row.blockers.length}/{row.blockersTotal} lịch cản.
            </Text>
          )}
          {row.draftsTotal > 0 && (
            <Text
              style={{ color: theme.warning, fontSize: 13, lineHeight: 20 }}
            >
              Còn {row.draftsTotal} bản nháp có chọn xe này.
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
