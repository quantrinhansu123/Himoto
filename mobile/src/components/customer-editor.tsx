import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type ScrollViewInstance,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router, usePreventRemove } from "expo-router";
import { uuid } from "expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react-native";
import type {
  MobileCustomerInput,
  MobileCustomerProfile,
  MobileDraftCustomer,
  MobileWriteReceipt,
} from "@himoto/mobile-contract";
import { useSession } from "@/providers/session";
import { useWorkspace } from "@/hooks/use-workspace";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  customerErrors,
  customerInput,
  customerStatuses,
  emptyCustomer,
  type CustomerErrors,
} from "@/lib/customer-form";
import { pendingWrites } from "@/lib/pending-writes";
import { ApiError } from "@/lib/api";
import { useTheme } from "@/theme";
import { Button, Card, InlineError, StateView } from "./ui";
import { ChoiceField, FormField } from "./form-fields";
import { DateField } from "./date-field";
import type { MobileCustomerMatch, MobileCustomerMatches as MatchResult, MobileCustomerMatchQuery } from "../../../shared/mobile-customer-matches";
import { CustomerMatches, CustomerMatchDetails } from "./customer-matches";
import {useCustomerDocuments} from '@/hooks/use-customer-documents';
import {CustomerDocumentFields} from './customer-document-fields';
import {CustomerDocumentSave} from './customer-document-save';
import {mergeCustomerOcr} from '../../../shared/mobile-customer-ocr';

type CreateCustomerFlow = {
  storeId: number | null;
  onClose: () => void;
  onPick: (customer: MobileDraftCustomer) => void;
};
type EditCustomerFlow = {
  onClose: () => void;
  onSaved: (receipt: MobileWriteReceipt) => Promise<void>;
};

export function CustomerCreateSheet(props: CreateCustomerFlow) {
  return <CustomerForm id={null} createFlow={props} />;
}

export function CustomerEditor({ id }: { id: string | null }) {
  const { api, session } = useSession();
  const allowed =
    !!session?.user.permissions.includes("customers.write") &&
    session.user.permissions.includes("customers.read");
  const valid = id === null || /^[1-9]\d{0,14}$/.test(id);
  const query = useQuery({
    queryKey: ["customer-edit", session?.user.id, id],
    queryFn: ({ signal }) => api!.customer(id!, signal),
    enabled: !!api && allowed && valid && id !== null,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (!allowed || !valid)
    return (
      <StateView
        title="Không mở được biểu mẫu"
        message="Kiểm tra liên kết và quyền chỉnh sửa khách hàng."
      />
    );
  if (id !== null && query.isPending)
    return <StateView title="Đang mở hồ sơ khách hàng" loading />;
  if (
    id !== null &&
    query.isError &&
    (!query.data ||
      (query.error instanceof ApiError &&
        [403, 404, 409].includes(query.error.status)))
  )
    return (
      <StateView
        title="Chưa mở được hồ sơ"
        message={query.error.message}
        retry={() => {
          void query.refetch();
        }}
      />
    );
  return (
    <CustomerForm
      key={id || "new"}
      id={id}
      profile={id === null ? undefined : query.data}
    />
  );
}

function Section({
  title,
  children,
  open,
  onToggle,
}: PropsWithChildren<{
  title: string;
  open?: boolean;
  onToggle?: () => void;
}>) {
  const theme = useTheme();
  return (
    <Card style={{ gap: 20, padding: 18 }}>
      {onToggle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ expanded: open }}
          aria-expanded={open}
          onPress={onToggle}
          style={{
            minHeight: 48,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Text
            style={{
              color: theme.text,
              fontSize: 18,
              fontWeight: "700",
              flex: 1,
            }}
          >
            {title}
          </Text>
          {open ? (
            <ChevronUp color={theme.muted} size={21} />
          ) : (
            <ChevronDown color={theme.muted} size={21} />
          )}
        </Pressable>
      ) : (
        <Text
          accessibilityRole="header"
          style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}
        >
          {title}
        </Text>
      )}
      {(open !== false || !onToggle) && children}
    </Card>
  );
}

function CustomerForm({
  id,
  profile,
  createFlow,
  editFlow,
}: {
  id: string | null;
  profile?: MobileCustomerProfile;
  createFlow?: CreateCustomerFlow;
  editFlow?: EditCustomerFlow;
}) {
  const theme = useTheme(),
    reducedMotion = useReducedMotion(),
    queryClient = useQueryClient();
  const { api, session } = useSession();
  const workspace = useWorkspace();
  const [form, setForm] = useState(() =>
    profile
      ? customerInput(profile)
      : emptyCustomer(createFlow?.storeId ?? session?.user.storeId ?? null),
  );
  const [baseline, setBaseline] = useState(() => JSON.stringify(form));
  const formRef=useRef(form);formRef.current=form;
  const [revision, setRevision] = useState(profile?.revision);
  const [errors, setErrors] = useState<CustomerErrors>({});
  const [error, setError] = useState(""),
    [errorCode, setErrorCode] = useState("");
  const [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(false),
    [saved, setSaved] = useState(false);
  const [documents, setDocuments] = useState(id===null||!!profile?.id_card),
    [relatives, setRelatives] = useState(!!profile?.relatives.length);
  const [receipt, setReceipt] = useState<MobileWriteReceipt | null>(null);
  const [matches, setMatches] = useState<MatchResult | null>(null);
  const [matchQuery, setMatchQuery] = useState<MobileCustomerMatchQuery | null>(null);
  const [viewingMatch, setViewingMatch] = useState<MobileCustomerMatch | null>(null);
  const [editingMatch, setEditingMatch] = useState<{ match: MobileCustomerMatch; profile: MobileCustomerProfile } | null>(null);
  const [usedExisting, setUsedExisting] = useState(false);
  const [documentStage,setDocumentStage]=useState<{customer:MobileDraftCustomer;complete:()=>Promise<void>;token:string}|null>(null);
  const [showDocumentSave,setShowDocumentSave]=useState(false);
  const [exitAction, setExitAction] = useState<(() => void) | null>(null),
    [reloadConfirm, setReloadConfirm] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null),
    saving = useRef(false),
    alive = useRef(true);
  const processingMatch = useRef(false);
  const currentUser = useRef(session?.user);
  currentUser.current = session?.user;
  const token = useRef(session?.token);
  useEffect(() => {
    token.current = session?.token;
  }, [session?.token]);
  const scope = useMemo(
    () =>
      api && session
        ? {
            origin: api.origin,
            userId: session.user.id,
            storeId: session.user.allStores ? null : session.user.storeId,
            allStores: session.user.allStores,
          }
        : null,
    [api, session],
  );
  const operation = id === null ? "customer.create" : `customer.update:${id}`;
  const photos=useCustomerDocuments(()=>formRef.current,(fields,before,previous)=>{
    const merged=mergeCustomerOcr(formRef.current,fields,before,previous);
    const next={...formRef.current,...merged.applied};formRef.current=next;setForm(next);
    setErrors(old=>Object.fromEntries(Object.entries(old).filter(([key])=>!Object.hasOwn(merged.applied,key))));
    if(merged.applied.id_card){setMatches(null);setMatchQuery(null);}
    return merged.applied;
  });
  const allowed = !!session?.user.permissions.includes("customers.write") &&
    session.user.permissions.includes("customers.read");
  const dirty = JSON.stringify(form) !== baseline||photos.photos.length>0;
  const disablePrevention = usePreventRemove(
    !createFlow && !editFlow && allowed && !saved && (dirty || busy || checking),
    ({ repeat }) => {
      if (viewingMatch && !busy && !checking) closeMatch();
      else setExitAction(() => repeat);
    },
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [pendingChecked, setPendingChecked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function recover() {
      if (!scope || !api) return;
      try {
        const key = await pendingWrites.lookup(scope, operation);
        if (!key || cancelled) return;
        const found = await api.customerReceipt(key);
        if (cancelled) return;
        if (found.receipt && id === null) setReceipt(found.receipt);
        else if (found.receipt)
          await pendingWrites.complete(scope, operation, key);
      } catch {
        if (!cancelled)
          setError(
            "Chưa kiểm tra được lần lưu trước. Anh/chị có thể kiểm tra lại trước khi tiếp tục.",
          );
      } finally {
        if (!cancelled) setPendingChecked(true);
      }
    }
    void recover();
    return () => {
      cancelled = true;
    };
  }, [api, id, operation, scope]);

  function update<K extends keyof MobileCustomerInput>(
    key: K,
    value: MobileCustomerInput[K],
  ) {
    const next={...formRef.current,[key]:value};formRef.current=next;setForm(next);
    setErrors((current) => ({ ...current, [key]: undefined }));
    setError("");
    setErrorCode("");
    if (key === "id_card" || key === "phone") {
      setMatches(null);
      setMatchQuery(null);
    }
  }
  function closeMatch() {
    setViewingMatch(null);
    setError("");
    if (usedExisting) {
      disablePrevention();
      router.back();
    }
  }
  function requestClose() {
    Keyboard.dismiss();
    if (viewingMatch && !busy && !checking) { closeMatch(); return; }
    const flow = createFlow || editFlow;
    if (!flow) return;
    if (dirty || busy || checking) setExitAction(() => flow.onClose);
    else flow.onClose();
  }
  async function lookupMatches(query: MobileCustomerMatchQuery = { id_card: form.id_card, phone: form.phone }) {
    if (!api || !session) return;
    const user = session.user;
    setChecking(true);
    try {
      const result = await api.customerMatches(query);
      if (!alive.current || currentUser.current !== user) return;
      setMatches(result);
      setMatchQuery(query);
    } catch (failure) {
      if (alive.current && currentUser.current === user) {
        setError((failure as Error).message);
        scroll.current?.scrollTo({ y: 0, animated: !reducedMotion });
        AccessibilityInfo.announceForAccessibility((failure as Error).message);
      }
    } finally {
      if (alive.current) setChecking(false);
    }
  }
  async function settleCreateIntent() {
    if (!api || !scope) throw new Error("Chưa kiểm tra được lần tạo khách trước.");
    const user = currentUser.current;
    const key = await pendingWrites.lookup(scope, "customer.create");
    if (!alive.current || currentUser.current !== user) return false;
    if (!key) return true;
    const resolution = await api.resolveWrite(key, "customer.create");
    if (!alive.current || currentUser.current !== user) return false;
    if (resolution.status === "committed") {
      setReceipt(resolution.receipt);
      setMatches(null);
      setViewingMatch(null);
      setError("Lần tạo trước đã được lưu. Kiểm tra và dùng đúng kết quả đã lưu trước khi chọn hồ sơ khác.");
      return false;
    }
    await pendingWrites.complete(scope, "customer.create", key);
    return alive.current && currentUser.current === user;
  }
  function stageDocuments(customer:MobileDraftCustomer,complete:()=>Promise<void>){
    if(!photos.getPhotos().length||!session)return false;
    const next=emptyCustomer(customer.storeId);
    for(const key of Object.keys(next) as (keyof MobileCustomerInput)[]){
      if(typeof next[key]==='string'&&typeof customer.details[key as keyof typeof customer.details]==='string')
        (next as unknown as Record<string,unknown>)[key]=customer.details[key as keyof typeof customer.details];
    }
    next.customer_type=customer.details.customer_type==='foreign'?'foreign':'vietnam';
    next.status=customer.status==='draft'?'draft':customer.status==='bad_debt'?'blacklist':customer.status==='warning'?'warning':'active';
    next.relatives=customer.relatives;formRef.current=next;setForm(next);
    setMatches(null);setViewingMatch(null);setError('');setDocumentStage({customer,complete,token:session.token});setShowDocumentSave(true);
    scroll.current?.scrollTo({y:0,animated:false});return true;
  }
  async function afterDocuments(confirmed:MobileWriteReceipt,complete:()=>Promise<void>){
    if(photos.getPhotos().length){
      if(!api||!session)throw Error('Chưa có phiên để tải hồ sơ đã lưu.');
      const at=session.token;
      const found=await api.customerMatches({id:confirmed.id});
      if(!alive.current||token.current!==at)return;
      const selected=found.rows.find(row=>row.customer.id===confirmed.id);
      if(!selected)throw Error('Đã lưu khách; chưa tải được đúng hồ sơ để hoàn tất ảnh. Giữ kết quả và thử lại.');
      stageDocuments(selected.customer,complete);return;
    }
    await complete();
  }
  async function finishExisting(match: MobileCustomerMatch) {
    if(stageDocuments(match.customer,()=>finishExisting(match)))return;
    setSaved(true);
    disablePrevention();
    if (createFlow) createFlow.onPick(match.customer);
    else if (match.canEdit) router.dismissTo({ pathname: "/record/[kind]/[id]", params: { kind: "customers", id: String(match.customer.id) } });
    else { setUsedExisting(true); setViewingMatch(match); }
  }
  async function selectExisting(match: MobileCustomerMatch, edit = false) {
    if (!allowed || !api || !session || !matchQuery || processingMatch.current || busy || checking || receipt) return;
    processingMatch.current = true;
    setChecking(true);
    setError("");
    const user = session.user;
    try {
      if (!await settleCreateIntent()) return;
      if (!alive.current || currentUser.current !== user) return;
      const fresh = await api.customerMatches(matchQuery);
      if (!alive.current || currentUser.current !== user) return;
      setMatches(fresh);
      const selected = fresh.rows.find((row) => row.customer.id === match.customer.id);
      if (!selected) throw new Error("Hồ sơ đã thay đổi và không còn khớp thông tin tra cứu. Kiểm tra lại trước khi chọn.");
      if (edit) {
        setViewingMatch(selected);
        if (!selected.canEdit) throw new Error("Hồ sơ hiện chỉ được xem. Quyền sửa vẫn theo cơ sở được phân công.");
        const profile = await api.customer(String(selected.customer.id));
        if (!alive.current || currentUser.current !== user) return;
        setEditingMatch({ match: selected, profile });
      } else await finishExisting(selected);
    } catch (failure) {
      if (alive.current && currentUser.current === user) {
        setError((failure as Error).message);
        scroll.current?.scrollTo({ y: 0, animated: !reducedMotion });
        AccessibilityInfo.announceForAccessibility((failure as Error).message);
      }
    } finally {
      processingMatch.current = false;
      if (alive.current) setChecking(false);
    }
  }
  async function editedExisting(confirmed: MobileWriteReceipt) {
    if (!api || !session || !editingMatch || confirmed.id !== editingMatch.match.customer.id)
      throw new Error("Kết quả sửa không khớp hồ sơ khách đang mở.");
    const user = session.user;
    const fresh = await api.customerMatches({ id: confirmed.id });
    if (!alive.current || currentUser.current !== user) return;
    const selected = fresh.rows.find((row) => row.customer.id === confirmed.id);
    if (!selected || !selected.canEdit) throw new Error("Đã lưu thay đổi; chưa tải được hồ sơ trong phạm vi hiện tại. Kiểm tra lại kết quả đã lưu.");
    setEditingMatch(null);
    await finishExisting(selected);
  }
  async function selectSavedCustomer(confirmed: MobileWriteReceipt) {
    if (!api || !session || !scope || !createFlow) return;
    const submittedToken = session.token;
    const found = await api.draftCustomer({ id: confirmed.id });
    if (!alive.current || token.current !== submittedToken) return;
    const selected = found.rows.find((row) => row.id === confirmed.id);
    if (!selected || found.rows.length !== 1 || found.hasMore)
      throw new Error("Khách hàng đã được lưu. Chưa tải được hồ sơ để dùng cho hợp đồng; kiểm tra lại hồ sơ đã lưu.");
    if(stageDocuments(selected,()=>selectSavedCustomer(confirmed)))return;
    const key = await pendingWrites.lookup(scope, operation);
    if (key) await pendingWrites.complete(scope, operation, key);
    if (!alive.current || token.current !== submittedToken) return;
    setSaved(true);
    createFlow.onPick(selected);
  }
  async function checkPrevious() {
    if (!api || !scope || checking) return;
    setChecking(true);
    setError("");
    try {
      const key = await pendingWrites.lookup(scope, operation);
      const result = key ? await api.customerReceipt(key) : { receipt: null };
      if (!alive.current) return;
      if (result.receipt) setReceipt(result.receipt);
      else
        setError(
          "Chưa có kết quả lưu cho yêu cầu này. Anh/chị có thể sửa thông tin và thử lưu lại.",
        );
    } catch (failure) {
      if (alive.current) setError((failure as Error).message);
    } finally {
      if (alive.current) setChecking(false);
    }
  }
  async function submit() {
    if (!allowed || !api || !session || !scope || saving.current || checking || processingMatch.current || receipt||documentStage||photos.picking||photos.reading) return;
    const invalid = customerErrors(form, id === null);
    setErrors(invalid);
    setError("");
    setErrorCode("");
    if (Object.keys(invalid).length) {
      if (
        invalid.id_card ||
        invalid.id_card_issued_on ||
        invalid.driver_license_issued_on
      )
        setDocuments(true);
      if (invalid.relatives) setRelatives(true);
      scroll.current?.scrollTo({ y: 0, animated: !reducedMotion });
      AccessibilityInfo.announceForAccessibility(
        "Kiểm tra các mục được đánh dấu trong biểu mẫu.",
      );
      return;
    }
    Keyboard.dismiss();
    saving.current = true;
    setBusy(true);
    const submittedToken = session.token;
    try {
      const key = await pendingWrites.reserve(scope, operation, () =>
        uuid.v4().toLowerCase(),
      );
      if (!alive.current || token.current !== submittedToken) return;
      const result = await api.saveCustomer(
        id,
        {
          ...form,
          allow_incomplete: form.status === "draft",
          ...(id ? { revision } : {}),
        },
        key,
      );
      if(photos.getPhotos().length){
        if(!alive.current||token.current!==submittedToken)return;
        setReceipt(result);void queryClient.invalidateQueries({queryKey:['catalogue']});
        await afterDocuments(result,()=>openConfirmedReceipt(result));return;
      }
      if (editFlow) {
        if (!alive.current || token.current !== submittedToken) return;
        setReceipt(result);
        await pendingWrites.complete(scope, operation, key);
        void queryClient.invalidateQueries({ queryKey: ["catalogue"] });
        await editFlow.onSaved(result);
        return;
      }
      if (createFlow) {
        if (!alive.current || token.current !== submittedToken) return;
        setReceipt(result);
        void queryClient.invalidateQueries({ queryKey: ["catalogue"] });
        await selectSavedCustomer(result);
        return;
      }
      await pendingWrites.complete(scope, operation, key).catch(() => {}); // Receipt remains recoverable if secure cleanup fails.
      if (!alive.current || token.current !== submittedToken) return;
      setSaved(true);
      disablePrevention();
      for (const queryKey of [
        ["catalogue"],
        ["overview"],
        ["record"],
        ["customer-edit"],
      ])
        void queryClient.invalidateQueries({ queryKey });
      router.dismissTo({
        pathname: "/record/[kind]/[id]",
        params: { kind: "customers", id: String(result.id) },
      });
    } catch (failure) {
      if (!alive.current || token.current !== submittedToken) return;
      setError((failure as Error).message);
      setErrorCode(failure instanceof ApiError ? failure.code : "STORAGE");
      if (id === null && failure instanceof ApiError && failure.code === "CUSTOMER_EXISTS")
        await lookupMatches();
      scroll.current?.scrollTo({ y: 0, animated: !reducedMotion });
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function loadLatest() {
    if (!id || !api || busy) return;
    setReloadConfirm(false);
    setBusy(true);
    setError("");
    try {
      const latest = await api.customer(id);
      if (!alive.current) return;
      const fields = customerInput(latest);
      queryClient.setQueryData(["customer-edit", session?.user.id, id], latest);
      setForm(fields);
      setBaseline(JSON.stringify(fields));
      setRevision(latest.revision);
      setErrors({});
      setErrorCode("");
    } catch (failure) {
      if (alive.current) setError((failure as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function openReceipt() {
    if (!receipt || !scope || checking) return;
    if(documentStage){setShowDocumentSave(true);return;}
    setChecking(true);
    setError('');
    try{await openConfirmedReceipt(receipt);}
    catch(failure){if(alive.current)setError((failure as Error).message);}
    finally{if(alive.current)setChecking(false);}
  }
  async function openConfirmedReceipt(confirmed:MobileWriteReceipt){
    if(!scope)return;
    if(photos.getPhotos().length){await afterDocuments(confirmed,()=>openConfirmedReceipt(confirmed));return;}
    for(const queryKey of [['catalogue'],['overview'],['record'],['customer-edit']])void queryClient.invalidateQueries({queryKey});
    if (editFlow) {
      const key = await pendingWrites.lookup(scope, operation);
      if (key) await pendingWrites.complete(scope, operation, key);
      await editFlow.onSaved(confirmed);
      return;
    }
    if (createFlow) {
      await selectSavedCustomer(confirmed);
      return;
    }
    const key = await pendingWrites.lookup(scope, operation).catch(() => null);
    if (key)
      await pendingWrites.complete(scope, operation, key).catch(() => {});
    if (!alive.current) return;
    setSaved(true);
    disablePrevention();
    router.dismissTo({
      pathname: "/record/[kind]/[id]",
      params: { kind: "customers", id: String(confirmed.id) },
    });
  }
  async function startAnother() {
    if (!scope || checking) return;
    setChecking(true);
    try {
      const key = await pendingWrites.lookup(scope, operation);
      if (key) await pendingWrites.complete(scope, operation, key);
      const initial = emptyCustomer(createFlow?.storeId ?? session?.user.storeId ?? null);
      setForm(initial);
      setBaseline(JSON.stringify(initial));
      setReceipt(null);
      setErrors({});
      setError("");
      setErrorCode("");
    } catch {
      setError(
        "Chưa xóa được thông tin lần lưu trước trên thiết bị. Vui lòng thử lại.",
      );
    } finally {
      setChecking(false);
    }
  }
  const disabled = busy || checking || !!receipt || !!documentStage || !allowed;
  const stores = (workspace.data?.stores || []).filter(
    (store) => session?.user.allStores || store.id === session?.user.storeId,
  );
  const foreign = form.customer_type === "foreign";
  const content = (
    <SafeAreaView
      edges={createFlow || editFlow ? ["top", "bottom", "left", "right"] : ["bottom", "left", "right"]}
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      {!createFlow && !editFlow && <Stack.Screen
        options={{ title: id ? "Sửa khách hàng" : "Thêm khách hàng" }}
      />}
      {(createFlow || editFlow) && (
        <View style={{ padding: 16, gap: 12, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: theme.border }}>
          <Text accessibilityRole="header" style={{ flex: 1, color: theme.text, fontSize: 21, fontWeight: "700" }}>{editFlow ? "Sửa hồ sơ khách đã có" : "Thêm khách trong hợp đồng"}</Text>
          <Button secondary label={editFlow ? "Quay lại hồ sơ trùng" : "Quay lại hợp đồng"} onPress={requestClose} />
        </View>
      )}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 18,
            gap: 16,
            maxWidth: 760,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 22 }}>
            Nhập thông tin đang có và chọn trạng thái phù hợp. Hồ sơ chưa đủ
            giấy tờ có thể lưu là Chưa hoàn tất.
          </Text>
          {!allowed && <InlineError message="Quyền chỉnh sửa hồ sơ đã thay đổi. Quay lại hợp đồng và kiểm tra quyền truy cập." />}
          {!!Object.keys(errors).filter(
            (key) => errors[key as keyof CustomerErrors],
          ).length && (
            <InlineError message="Kiểm tra các mục được đánh dấu bên dưới. Thông tin đang nhập vẫn được giữ lại." />
          )}
          {!!error && (
            <View style={{ gap: 10 }}>
              <InlineError message={error} />
              <Button
                secondary
                label="Kiểm tra lần lưu trước"
                loading={checking}
                disabled={busy}
                onPress={() => {
                  void checkPrevious();
                }}
              />
              {!!id && errorCode === "CUSTOMER_CONFLICT" && (
                <Button
                  secondary
                  label="Tải bản mới"
                  onPress={() => setReloadConfirm(true)}
                />
              )}
              {id === null && errorCode === "CUSTOMER_EXISTS" && <Button secondary label="Tìm lại hồ sơ trùng" loading={checking} disabled={busy} onPress={() => { void lookupMatches(); }} />}
            </View>
          )}
          {matches && id === null && !receipt && <CustomerMatches matches={matches} disabled={disabled} onView={(row) => { Keyboard.dismiss(); setError(""); setViewingMatch(row); }} onUse={(row) => { void selectExisting(row); }} />}
          {documentStage&&<Card style={{gap:12,borderColor:theme.primary}}>
            <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'700'}}>Hoàn tất ảnh vào khách #{documentStage.customer.id}</Text>
            <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>{documentStage.customer.details.name} · {documentStage.customer.storeName}. Hồ sơ đã được chọn; hoàn tất phần ảnh trước khi tiếp tục.</Text>
            <Button label="Tiếp tục lưu ảnh khách hàng" onPress={()=>setShowDocumentSave(true)}/>
          </Card>}
          {!!receipt && (
            <Card style={{ gap: 14, borderColor: theme.primary }}>
              <Text
                accessibilityRole="header"
                style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}
              >
                Lần lưu trước đã thành công
              </Text>
              <Text
                style={{ color: theme.muted, fontSize: 14, lineHeight: 22 }}
              >
                {createFlow ? "Dùng đúng hồ sơ đã lưu để tiếp tục hợp đồng; không tạo lại khách hàng." : "Mở hồ sơ đã lưu để kiểm tra và bổ sung thông tin."}
              </Text>
              <Button
                label={createFlow ? "Dùng khách hàng đã lưu" : "Xem hồ sơ đã lưu"}
                loading={checking}
                onPress={() => {
                  void openReceipt();
                }}
              />
              {id === null && !createFlow && !documentStage && (
                <Button
                  secondary
                  label="Tạo hồ sơ mới"
                  loading={checking}
                  onPress={() => {
                    void startAnother();
                  }}
                />
              )}
            </Card>
          )}
          <Section title="Giấy tờ" open={documents} onToggle={() => setDocuments(value=>!value)}>
            <ChoiceField
              label="Loại khách hàng"
              value={form.customer_type}
              disabled={disabled}
              choices={[
                { value: "vietnam", label: "Khách trong nước" },
                { value: "foreign", label: "Khách nước ngoài" },
              ]}
              onChange={(value) =>
                update(
                  "customer_type",
                  value as MobileCustomerInput["customer_type"],
                )
              }
            />
            <CustomerDocumentFields documents={photos} disabled={disabled} foreign={foreign}/>
            <FormField
              label={foreign ? "Số hộ chiếu" : "Số CCCD/CMND"}
              value={form.id_card}
              onChangeText={(value) => update("id_card", value)}
              error={errors.id_card}
              editable={!disabled}
              maxLength={foreign ? 100 : 12}
              autoCapitalize="characters"
              keyboardType={foreign ? "default" : "number-pad"}
            />
          </Section>
          <Section title="Thông tin khách hàng">
            <FormField
              label="Họ và tên"
              value={form.name}
              onChangeText={(value) => update("name", value)}
              error={errors.name}
              editable={!disabled}
              maxLength={200}
              autoCapitalize="words"
              autoComplete="name"
            />
            <FormField
              label="Số điện thoại"
              value={form.phone}
              onChangeText={(value) => update("phone", value)}
              error={errors.phone}
              editable={!disabled}
              maxLength={foreign ? 1000 : 30}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
            <DateField
              label="Ngày cấp giấy tờ"
              value={form.id_card_issued_on}
              onChange={(value) => update("id_card_issued_on", value)}
              error={errors.id_card_issued_on}
              disabled={disabled}
            />
            <FormField
              label="Nơi cấp giấy tờ"
              value={form.id_card_issued_by}
              onChangeText={(value) => update("id_card_issued_by", value)}
              editable={!disabled}
              maxLength={255}
            />
            {foreign && (
              <>
                <FormField
                  label="Quốc tịch"
                  value={form.nationality}
                  onChangeText={(value) => update("nationality", value)}
                  editable={!disabled}
                  maxLength={1000}
                />
                <FormField
                  label="Kênh liên hệ"
                  value={form.contact_channel}
                  onChangeText={(value) => update("contact_channel", value)}
                  editable={!disabled}
                  placeholder="Ví dụ: WhatsApp, WeChat, email"
                  maxLength={1000}
                />
                <FormField
                  label="Thông tin liên hệ"
                  value={form.contact_detail}
                  onChangeText={(value) => update("contact_detail", value)}
                  error={errors.contact_detail}
                  editable={!disabled}
                  autoCapitalize="none"
                  maxLength={1000}
                />
              </>
            )}
            <FormField
              label="Email"
              value={form.email}
              onChangeText={(value) => update("email", value)}
              error={errors.email}
              editable={!disabled}
              maxLength={254}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />
            <FormField
              label="Địa chỉ"
              value={form.address}
              onChangeText={(value) => update("address", value)}
              error={errors.address}
              editable={!disabled}
              maxLength={2000}
              multiline
              autoComplete="street-address"
            />
          </Section>
          <Section title="Giấy phép lái xe">
            <CustomerDocumentFields documents={photos} disabled={disabled} foreign={foreign} license/>
            <FormField
              label="Số giấy phép lái xe"
              value={form.driver_license_number}
              onChangeText={(value) => update("driver_license_number", value)}
              editable={!disabled}
              maxLength={100}
              autoCapitalize="characters"
            />
            <DateField
              label="Ngày cấp giấy phép lái xe"
              value={form.driver_license_issued_on}
              onChange={(value) => update("driver_license_issued_on", value)}
              error={errors.driver_license_issued_on}
              disabled={disabled}
            />
          </Section>
          <Section title="Quản lý hồ sơ">
            <ChoiceField
              label="Cơ sở quản lý"
              value={String(form.store_id)}
              choices={stores.map((store) => ({
                value: String(store.id),
                label: store.name,
              }))}
              searchable
              disabled={disabled || workspace.isPending}
              error={errors.store_id}
              onChange={(value) => update("store_id", Number(value))}
            />
            {workspace.isError && (
              <Button
                secondary
                label="Tải lại cơ sở"
                onPress={() => {
                  void workspace.refetch();
                }}
              />
            )}
            <ChoiceField
              label="Trạng thái hồ sơ"
              value={form.status}
              choices={[...customerStatuses]}
              disabled={disabled}
              onChange={(value) =>
                update("status", value as MobileCustomerInput["status"])
              }
            />
            {(form.status === "warning" || form.status === "blacklist") && (
              <FormField
                label="Nội dung lưu ý"
                value={form.warning_note}
                onChangeText={(value) => update("warning_note", value)}
                editable={!disabled}
                maxLength={2000}
                multiline
              />
            )}
          </Section>
          <Section
            title="Người thân"
            open={relatives}
            onToggle={() => setRelatives((value) => !value)}
          >
            {!!errors.relatives && <InlineError message={errors.relatives} />}
            {form.relatives.map((relative, index) => (
              <View
                key={index}
                style={{
                  gap: 14,
                  borderBottomColor: theme.border,
                  borderBottomWidth: 1,
                  paddingBottom: 16,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Text
                    style={{
                      color: theme.text,
                      fontWeight: "600",
                      fontSize: 15,
                      flex: 1,
                    }}
                  >
                    Người thân {index + 1}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Xóa người thân ${index + 1}`}
                    disabled={disabled}
                    onPress={() =>
                      update(
                        "relatives",
                        form.relatives.filter(
                          (_, position) => position !== index,
                        ),
                      )
                    }
                    style={{
                      minHeight: 48,
                      minWidth: 48,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Trash2 color={theme.danger} size={21} accessible={false} />
                  </Pressable>
                </View>
                {(
                  [
                    ["name", "Họ tên"],
                    ["relationship", "Quan hệ"],
                    ["phone", "Điện thoại"],
                  ] as const
                ).map(([key, label]) => (
                  <FormField
                    key={key}
                    label={`${label} người thân ${index + 1}`}
                    value={relative[key]}
                    editable={!disabled}
                    maxLength={key === "phone" ? 50 : 200}
                    keyboardType={key === "phone" ? "phone-pad" : "default"}
                    onChangeText={(value) =>
                      update(
                        "relatives",
                        form.relatives.map((item, position) =>
                          position === index ? { ...item, [key]: value } : item,
                        ),
                      )
                    }
                  />
                ))}
              </View>
            ))}
            {form.relatives.length < 2 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Thêm người thân"
                disabled={disabled}
                onPress={() =>
                  update("relatives", [
                    ...form.relatives,
                    { name: "", relationship: "", phone: "" },
                  ])
                }
                style={{
                  minHeight: 48,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Plus color={theme.primary} size={22} accessible={false} />
                <Text
                  style={{
                    color: theme.primary,
                    fontSize: 16,
                    fontWeight: "600",
                  }}
                >
                  Thêm người thân
                </Text>
              </Pressable>
            )}
          </Section>
        </ScrollView>
        <View
          style={{
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: theme.border,
            backgroundColor: theme.surface,
          }}
        >
          <View style={{ maxWidth: 724, width: "100%", alignSelf: "center" }}>
            <Button
              label={id ? "Lưu thay đổi" : "Lưu khách hàng"}
              loading={busy}
              disabled={!pendingChecked || checking || !!receipt || !!documentStage || photos.picking || photos.reading || !allowed}
              onPress={() => {
                void submit();
              }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
      {(exitAction || reloadConfirm) && (
        <Modal
          transparent
          animationType={reducedMotion ? "none" : "fade"}
          onRequestClose={() => {
            setExitAction(null);
            setReloadConfirm(false);
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: theme.scrim,
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <Card style={{ gap: 16, maxWidth: 440, width: "100%" }}>
              <Text
                accessibilityRole="header"
                style={{ color: theme.text, fontSize: 22, fontWeight: "700" }}
              >
                {busy || checking
                  ? "Đang lưu hồ sơ"
                  : reloadConfirm
                    ? "Tải thông tin mới?"
                    : "Rời biểu mẫu?"}
              </Text>
              <Text
                style={{ color: theme.muted, fontSize: 15, lineHeight: 24 }}
              >
                {busy || checking
                  ? "Chờ máy chủ xác nhận kết quả lưu."
                  : reloadConfirm
                    ? "Thông tin đang nhập sẽ được thay bằng bản mới từ máy chủ."
                    : "Thông tin đang nhập sẽ mất. Nếu vừa gửi lưu, có thể kiểm tra kết quả khi mở lại."}
              </Text>
              <Button
                secondary
                label={busy || checking ? "Tiếp tục chờ" : "Tiếp tục chỉnh sửa"}
                onPress={() => {
                  setExitAction(null);
                  setReloadConfirm(false);
                }}
              />
              {!busy && !checking && (
                <Button
                  label={reloadConfirm ? "Tải bản mới" : "Rời biểu mẫu"}
                  onPress={() => {
                    if (reloadConfirm) void loadLatest();
                    else {
                      const repeat = exitAction;
                      setSaved(true);
                      disablePrevention();
                      setExitAction(null);
                      repeat?.();
                    }
                  }}
                />
              )}
            </Card>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
  const body = !allowed ? <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, padding: 20, gap: 20 }}>
    <InlineError message="Quyền truy cập hồ sơ đã thay đổi. Quay lại và kiểm tra quyền trước khi tiếp tục." />
    <Button secondary label="Quay lại" onPress={() => { disablePrevention(); (createFlow || editFlow)?.onClose(); }} />
  </SafeAreaView> : <>
    {viewingMatch ? <CustomerMatchDetails match={viewingMatch} busy={busy || checking} error={error} onClose={closeMatch}
      onUse={usedExisting ? undefined : () => { void selectExisting(viewingMatch); }}
      onEdit={usedExisting ? undefined : () => { void selectExisting(viewingMatch, true); }} /> : content}
    {editingMatch && <CustomerForm key={editingMatch.match.customer.id} id={String(editingMatch.match.customer.id)} profile={editingMatch.profile}
      editFlow={{ onClose: () => setEditingMatch(null), onSaved: editedExisting }} />}
    {documentStage&&showDocumentSave&&<CustomerDocumentSave key={documentStage.customer.id} customer={documentStage.customer} documents={photos}
      onClose={()=>{scroll.current?.scrollTo({y:0,animated:false});setShowDocumentSave(false);}} onComplete={async()=>{
        const stage=documentStage;
        if(token.current!==stage.token)throw Error('Phiên làm việc đã thay đổi. Giữ kết quả và kiểm tra lại đúng tài khoản.');
        photos.clear();await stage.complete();
        if(alive.current){setDocumentStage(null);setShowDocumentSave(false);}
      }}/>}
  </>;
  return createFlow || editFlow ? (
    <Modal animationType={reducedMotion ? "none" : "slide"} onRequestClose={requestClose}>
      {body}
    </Modal>
  ) : body;
}
