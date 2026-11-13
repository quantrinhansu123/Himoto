import { isIntegrationOperation,type IntegrationResolution } from '../../../shared/mobile-integrations';
import {MOBILE_BULK_LABELS,type MobileBulkKind} from '../../../shared/mobile-bulk-delete';
import { isContractTypeOperation,type MobileContractTypeResolution } from '../../../shared/mobile-contract-types';
import { isVehicleImportOperation, type MobileVehicleImportResolution } from '../../../shared/mobile-vehicle-import';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileWriteResolution } from "../../../shared/mobile-write-recovery";
import { useSession } from "@/providers/session";
import {findDraftWorkRequest} from "@/lib/draft-work-links";
import {draftWorkDestination} from "@/lib/draft-work-access";
import {settleContractWorkIntent} from "@/lib/contract-work-intent";
import { pendingWrites } from "@/lib/pending-writes";
import { useTheme } from "@/theme";
import { Button, Card, InlineError } from "./ui";
import { ConfirmEdit } from "./editor-sheet";

type RecoveryResult=MobileWriteResolution|MobileContractTypeResolution|IntegrationResolution|MobileVehicleImportResolution;
type Pending = { key: string; operation: string };
function operationLabel(operation: string) {
  if(operation.startsWith('bulk.'))return `Xóa nhiều ${MOBILE_BULK_LABELS[operation.split('.')[1] as MobileBulkKind]||'hồ sơ'}`;
  if(operation.startsWith('telegram.'))return operation.startsWith('telegram.contract:')?'Telegram hợp đồng':'Telegram điều chuyển xe';
  if (operation.startsWith('vimport.')) return operation.startsWith('vimport.reset:') ? 'Xóa danh sách xe có sao lưu' : operation.startsWith('vimport.replace:') ? 'Thay danh sách xe từ Excel' : 'Đồng bộ xe từ Excel';
  if (operation.startsWith('import.cstores:')) return 'Khớp cơ sở từ Excel';
  if (operation.startsWith('import.customers:')) return 'Nhập Excel khách hàng';
  if (operation.startsWith('import.contracts:')) return 'Nhập nháp hợp đồng từ Excel';
  const [kind, id] = operation.split(":");
  const labels: Record<string, string> = {
    "integration.gps-account": "Lưu tài khoản GPS",
    "integration.gps-enabled": "Bật hoặc tắt đồng bộ GPS",
    "integration.telegram": "Lưu cấu hình Telegram",
    "account.create": "Tạo tài khoản",
    "account.update": "Cập nhật tài khoản và quyền",
    "account.delete": "Xóa quyền đăng nhập",
    "account.password": "Xem mật khẩu theo quyền riêng",
    "account.change-password": "Đổi mật khẩu của mình",
    "ctype.create": "Thêm loại hợp đồng",
    "ctype.update": "Sửa hoặc ẩn/hiện loại hợp đồng",
    "customer.create": "Thêm khách hàng",
    "customer.update": "Sửa khách hàng",
    "draft.create": "Tạo bản nháp",
    "draft.update": "Sửa bản nháp",
    "draft.delete": "Xóa nháp trên máy chủ",
    "contract.finalize": "Phát hành hợp đồng",
    "contract.handover": "Giao xe giữ chỗ",
    "contract.approve": "Duyệt hợp đồng sở hữu",
    "contract.ownership_terms": "Sửa thời hạn / mức đóng thuê sở hữu",
    "contract.terms": "Sửa tiền / ngày thuê",
    "contract.edit": "Sửa đầy đủ hợp đồng",
    "correction.receipts": "Sửa cọc / khoản đã thu",
    "correction.renewal": "Sửa ngày / tiền thực thu gia hạn",
    "lifecycle.hold": "Bảo lưu hợp đồng",
    "lifecycle.resume": "Tiếp tục thuê từ bảo lưu",
    "lifecycle.update_hold": "Sửa thời hạn bảo lưu",
    "lifecycle.complete_hold": "Hoàn thành sau bảo lưu",
    "lifecycle.mark_bad_debt": "Chuyển sang Nợ xấu",
    "lifecycle.settle": "Xác nhận tất toán nợ xấu",
    "payment.record": "Ghi thu/chi hợp đồng",
    "payment.renewal": "Thu tiền theo kỳ gia hạn",
    "payment.bill": "Lưu bill khoản thu theo kỳ",
    "renewal.bill": "Lưu bill gia hạn hợp đồng",
    "renewal.record": "Gia hạn hợp đồng",
    "return.record": "Trả xe và quyết toán",
    "return.correct": "Sửa hồ sơ / quyết toán trả xe",
    "return.swap": "Đổi xe trong hợp đồng",
    "return.recover": "Thu hồi xe nợ xấu",
    "vehicle.transfer": "Chuyển kho",
    "vehicle.receive": "Nhận xe",
    "vehicle.reject": "Từ chối điều chuyển",
    "vehicle.cancel": "Hủy điều chuyển",
    "vehicle.create": "Thêm xe",
    "vehicle.update": "Sửa hồ sơ xe",
    "vehicle.status": "Đổi trạng thái / tạo nháp từ kho",
    "media.contract": "Lưu ảnh hợp đồng",
    "video.record": "Lưu video hợp đồng",
    "media.vehicle": "Lưu ảnh chuyển/nhận xe",
    "media.customer": "Lưu giấy tờ khách hàng",
    "media.copy": "Lấy giấy tờ khách vào hợp đồng",
    "media.delete.contract": "Xóa tệp hợp đồng",
    "media.delete.customer": "Xóa giấy tờ khách",
    "media.delete.vehicle": "Xóa tệp chuyển/nhận xe",
    "gps.mapping": "Ghép GPS với xe",
    "duty.create": "Tạo ca trực",
    "duty.update": "Sửa ca trực",
    "duty.delete": "Xóa ca trực",
    "store.create": "Tạo cơ sở",
    "store.update": "Sửa cơ sở",
    "store.delete": "Xóa cơ sở",
    "staff.create": "Thêm nhân sự",
    "staff.update": "Cập nhật nhân sự",
    "staff.delete": "Xóa hồ sơ nhân sự",
    "bank.create": "Thêm tài khoản ngân hàng",
    "bank.update": "Sửa tài khoản ngân hàng",
    "bank.status": "Đổi trạng thái tài khoản ngân hàng",
    "bank.delete": "Xóa tài khoản ngân hàng",
    "cash.create": "Thêm két tiền mặt",
    "cash.update": "Sửa két tiền mặt",
    "cash.status": "Đổi trạng thái két tiền mặt",
    "cash.delete": "Xóa két tiền mặt",
    "cashbook.delete": "Xóa phiếu sổ quỹ",
    "reminder.send": "Gửi nhắc nợ",
    "battery.create": "Lập hợp đồng pin / sạc",
    "battery.update": "Sửa hợp đồng pin / sạc",
    "battery.delete": "Xóa hợp đồng pin / sạc",
    "battery.renew": "Gia hạn pin / sạc",
    "battery.collect_renewal": "Thu nợ gia hạn pin / sạc",
    "battery.return": "Trả pin / sạc",
    "battery.media": "Lưu ảnh lượt pin / sạc",
    "shift.create": "Lập báo cáo ca",
    "shift.update": "Lưu hoặc chốt báo cáo ca",
    "shift.audit": "Đối soát KTNB",
    "shift.media": "Lưu hoặc xóa minh chứng ca",
  };
  return `${labels[kind] || "Thao tác"}${id ? ` #${id}` : ""}`;
}

// The parent keys this component by session/scope. An old response cannot update
// another session or clear its ledger, including after logout and sign-in again.
export function PendingWriteRecovery() {
  const { api, session } = useSession(), theme = useTheme(), cache = useQueryClient();
  const scope = useMemo(() => api && session ? {
    origin: api.origin, userId: session.user.id,
    storeId: session.user.allStores ? null : session.user.storeId,
    allStores: session.user.allStores,
  } : null, [api, session]);
  const [entries, setEntries] = useState<Pending[]>([]);
  const [results, setResults] = useState<Record<string, RecoveryResult>>({});
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const alive = useRef(true), running = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const refresh = useCallback(async () => {
    if (!scope) return;
    setLoading(true);
    setError("");
    try {
      const pending = await pendingWrites.list(scope,true);
      if (alive.current) setEntries(pending);
    } catch (cause) {
      if (alive.current) setError((cause as Error).message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [scope]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  async function resolve(entry: Pending) {
    if (!api || !scope || running.current) return;
    running.current = true;
    setBusy(entry.key);
    setConfirm(null);
    setError("");
    setNotice("");
    try {
      const result = isVehicleImportOperation(entry.operation) ? await api.resolveVehicleImport(entry.key, entry.operation) : isIntegrationOperation(entry.operation) ? await api.resolveIntegration(entry.key,entry.operation) : isContractTypeOperation(entry.operation) ? await api.resolveContractType(entry.key,entry.operation) : await api.resolveWrite(entry.key, entry.operation);
      if ('resourceKind' in result && result.resourceKind === 'vehicle-import' && result.status === 'committed' && result.receipt.actorId !== scope.userId) throw Error('Xác nhận Excel xe không thuộc tài khoản hiện tại.');
      if (!alive.current) return;
      if (result.status === "cancelled") {
        // A lost response/storage failure leaves the original key for a safe retry.
        const linked=await findDraftWorkRequest(scope,entry.operation,entry.key);
        if(linked)await settleContractWorkIntent(linked.store,linked.head.work.id,scope,{type:'cancelled',key:entry.key},pendingWrites);
        else await pendingWrites.complete(scope, entry.operation, entry.key);
        if (!alive.current) return;
        setEntries((previous) => previous.filter((row) => row.key !== entry.key));
        setNotice("Đã xác nhận thao tác chưa được ghi và khóa mã cũ. Có thể mở lại hồ sơ để tiếp tục.");
      } else {
        setResults((previous) => ({ ...previous, [entry.key]: result }));
        setNotice(entry.operation.startsWith("reminder.send:") ? "Lần gửi đã được ghi nhận. Mở kết quả để kiểm tra trạng thái tiếp nhận; chưa xác nhận khách đã nhận tin." : "Thao tác đã được ghi thành công. Mở kết quả để kiểm tra trước khi thao tác tiếp.");
        for (const queryKey of [["record"], ["catalogue"], ["overview"], ["draft-edit"], ["contract-preparation"], ["duty-roster"], ["directory", "stores"], ["store-profile"], ["workspace"]])
          void cache.invalidateQueries({ queryKey });
      }
    } catch (cause) {
      if (alive.current) setError((cause as Error).message);
    } finally {
      running.current = false;
      if (alive.current) setBusy("");
    }
  }
  async function open(entry: Pending, result: RecoveryResult) {
    if (!scope || result.status !== "committed" || running.current) return;
    running.current = true;
    setBusy(entry.key);
    setError("");
    try {
      if(entry.operation.startsWith('bulk.')){router.push({pathname:'/bulk-delete-result/[key]',params:{key:entry.key,kind:entry.operation.split('.')[1]}});return;}
      if(entry.operation.startsWith('telegram.')){router.push({pathname:'/telegram-result/[key]',params:{key:entry.key}});return;}
      if(entry.operation.startsWith('vimport.')){router.push({pathname:'/vehicle-import-result/[key]',params:{key:entry.key}});return;}
      if(entry.operation.startsWith('import.')){router.push({pathname:'/import-result/[key]',params:{key:entry.key}});return;}
      if('resourceKind'in result&&result.resourceKind==='integration'){router.push({pathname:'/integration-result/[key]',params:{key:entry.key}});return;}
      if('resourceKind'in result){router.push({pathname:'/contract-type-result/[key]',params:{key:entry.key}});return;}
      const linked=await findDraftWorkRequest(scope,entry.operation,entry.key);
      if(linked){router.push({pathname:draftWorkDestination(session?.user.permissions??[],linked.head.work,scope)==='media'?'/draft-work-media/[id]':'/draft-work/[id]',params:{id:linked.head.work.id}});return;}
      if(entry.operation.startsWith('draft.delete:')){router.push({pathname:'/draft-delete/[id]',params:{id:String(result.receipt.id)}});return;}
      if(entry.operation.startsWith('account.')){router.push({pathname:'/managed-account-result/[key]',params:{key:entry.key}});return;}
      if(entry.operation.startsWith('return.correct:')){router.push({pathname:'/return-correction/[id]',params:{id:String(result.receipt.id)}});return;}
      if(entry.operation.startsWith('lifecycle.')){router.push({pathname:'/contract-lifecycle/[id]',params:{id:String(result.receipt.id)}});return;}
      if(entry.operation.startsWith('correction.')){router.push({pathname:'/contract-correction/[kind]/[id]',params:{kind:entry.operation.startsWith('correction.receipts:')?'receipts':'renewal',id:String(result.receipt.id)}});return;}
      if(entry.operation.startsWith('contract.ownership_terms:')){router.push({pathname:'/ownership-terms/[id]',params:{id:String(result.receipt.id)}});return;}
      if(entry.operation.startsWith('contract.terms:')){router.push({pathname:'/rental-terms/[id]',params:{id:String(result.receipt.id)}});return;}
      if(entry.operation.startsWith('contract.edit:')){router.push({pathname:'/contract-edit/[id]',params:{id:String(result.receipt.id)}});return;}
      if(entry.operation.startsWith('contract.approve:')){router.push({pathname:'/contract-approval/[id]',params:{id:String(result.receipt.id)}});return;}
      if (entry.operation.startsWith("duty.")) {
        router.push({ pathname: "/duty-result/[key]", params: { key: entry.key } });
        return;
      }
      if (entry.operation.startsWith("reminder.send:")) {
        router.push({ pathname: "/reminder-result/[key]", params: { key: entry.key } });
        return;
      }
      if (entry.operation.startsWith("shift.")) {
        router.push({ pathname: "/shift-result/[key]", params: { key: entry.key } });
        return;
      }
      if (entry.operation.startsWith("battery.")) {
        router.push({ pathname: "/battery-result/[key]", params: { key: entry.key } });
        return;
      }
      if (entry.operation.startsWith("store.")) {
        router.push({ pathname: "/store-result/[key]", params: { key: entry.key } });
        return;
      }
      if (entry.operation.startsWith("staff.")) {
        router.push({ pathname: "/staff-result/[key]", params: { key: entry.key } });
        return;
      }
      if (entry.operation === "cashbook.delete") {
        router.push({ pathname: "/cashbook-delete-result/[key]", params: { key: entry.key } });
        return;
      }
      if (/^(bank|cash)\./.test(entry.operation)) {
        router.push({ pathname: "/cashbook-account-result/[key]", params: { key: entry.key } });
        return;
      }
      if(entry.operation.startsWith('gps.mapping:')){
        router.push({pathname:'/gps-mapping/[id]',params:{id:String(result.receipt.id)}});
        return;
      }
      if(entry.operation.startsWith('media.delete.')){
        router.push({pathname:'/media-delete/[entity]/[id]',params:{entity:entry.operation.startsWith('media.delete.customer:')?'customers':entry.operation.startsWith('media.delete.contract:')?'contracts':'vehicles',id:String(result.receipt.id)}});
        return;
      }
      if(entry.operation.startsWith('media.copy:')){
        router.push({pathname:'/customer-photo-copy/[id]',params:{id:String(result.receipt.id)}});
        return;
      }
      if(entry.operation.startsWith('video.record:')){
        router.push({pathname:'/video-receipt/[id]',params:{id:String(result.receipt.id)}});
        return;
      }
      if(entry.operation.startsWith('media.')){
        router.push({pathname:'/media-receipt/[entity]/[id]',params:{entity:entry.operation.startsWith('media.customer:')?'customers':entry.operation.startsWith('media.contract:')?'contracts':'vehicles',id:String(result.receipt.id)}});
        return;
      }
      if (entry.operation.startsWith("vehicle.")) {
        if(entry.operation.startsWith('vehicle.status:')){router.push({pathname:'/vehicle-status-result/[key]',params:{key:entry.key}});return;}
        if (entry.operation === "vehicle.create" || entry.operation.startsWith("vehicle.update:")) {
          router.push({ pathname: "/vehicle-result/[key]", params: { key: entry.key } });
          return;
        }
        router.push({ pathname: "/vehicle-transfer/[id]", params: { id: String(result.receipt.id),action:entry.operation.split(".")[1].split(":")[0] } });
        return;
      }
      if (entry.operation.startsWith("return.recover:")) {
        router.push({ pathname: "/recovery/[id]", params: { id: String(result.receipt.id) } });
        return;
      }
      if (entry.operation.startsWith("return.swap:")) {
        router.push({ pathname: "/swap/[id]", params: { id: String(result.receipt.id) } });
        return;
      }
      if (entry.operation.startsWith("return.record:")) {
        router.push({ pathname: "/return/[id]", params: { id: String(result.receipt.id) } });
        return;
      }
      if (entry.operation.startsWith("renewal.record:")) {
        router.push({ pathname: "/renewal/[id]", params: { id: String(result.receipt.id) } });
        return;
      }
      if (entry.operation.startsWith("renewal.bill:")) {
        router.push({ pathname: "/renewal-bill/[id]", params: { id: String(result.receipt.id) } });
        return;
      }
      if (entry.operation.startsWith("payment.renewal:")) {
        router.push({ pathname: "/renewal-payment/[id]", params: { id: String(result.receipt.id) } });
        return;
      }
      if (entry.operation.startsWith("payment.bill:")) {
        router.push({ pathname: "/collection-bill/[id]", params: { id: String(result.receipt.id) } });
        return;
      }
      if (entry.operation.startsWith("payment.record:")) {
        // Keep the key until the dedicated recovery screen has shown the exact
        // transaction receipt and the operator acknowledges it.
        router.push({ pathname: "/payment/[id]", params: { id: String(result.receipt.id) } });
        return;
      }
      await pendingWrites.complete(scope, entry.operation, entry.key);
      if (!alive.current) return;
      setEntries((previous) => previous.filter((row) => row.key !== entry.key));
      router.push({ pathname: "/record/[kind]/[id]", params: {
        kind: entry.operation.startsWith("customer.") ? "customers" : "contracts",
        id: String(result.receipt.id),
      } });
    } catch (cause) {
      if (alive.current) setError((cause as Error).message);
    } finally {
      running.current = false;
      if (alive.current) setBusy("");
    }
  }
  return <Card style={{ gap: 16 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 21, fontWeight: "700" }}>Thao tác cần đối chiếu</Text>
    <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 24 }}>
      Các lần gửi chưa rõ kết quả của tài khoản và phạm vi hiện tại. Kiểm tra trước khi nhập lại tiền hoặc tạo hồ sơ mới.
    </Text>
    {!!error && <InlineError message={error} />}
    {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 15, lineHeight: 24 }}>{notice}</Text>}
    {loading && <Text style={{ color: theme.muted }}>Đang đọc các thao tác trên thiết bị…</Text>}
    {!loading && !error && entries.length === 0 && <Text style={{ color: theme.muted, fontSize: 15 }}>Không có thao tác chờ đối chiếu trong phạm vi này.</Text>}
    {entries.map((entry) => {
      const result = results[entry.key], label = operationLabel(entry.operation);
      return <View key={entry.key} style={{ gap: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.border }}>
        <Text style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}>{label}</Text>
        {result?.status === "committed" ? <>
          <Text style={{ color: theme.success, fontSize: 15 }}>{entry.operation.startsWith("reminder.send:") ? "Lần gửi đã được ghi nhận" : "Đã ghi thành công"}</Text>
          <Button label={`Mở kết quả ${label.toLowerCase()}`} loading={busy === entry.key} disabled={!!busy} onPress={() => { void open(entry, result); }} />
        </> : <Button label={`Đối chiếu ${label.toLowerCase()}`} secondary loading={busy === entry.key} disabled={!!busy || loading} onPress={() => setConfirm(entry)} />}
      </View>;
    })}
    <Button secondary label="Tải lại danh sách đối chiếu" loading={loading} disabled={!!busy} onPress={() => { void refresh(); }} />
    {confirm && <ConfirmEdit title="Đối chiếu và kết thúc yêu cầu?"
      message={`${operationLabel(confirm.operation)}: nếu đã ghi, ứng dụng sẽ trả lại kết quả đã lưu. Nếu chưa ghi, máy chủ sẽ hủy mã yêu cầu này và chặn mọi lần gửi đến muộn. Thao tác này không hủy hồ sơ hoặc khoản tiền đã ghi.`}
      confirmLabel="Đối chiếu với máy chủ" onCancel={() => setConfirm(null)} onConfirm={() => { void resolve(confirm); }} />}
  </Card>;
}
