import type { MobileContractFormInput } from "../../../shared/mobile-contract-edit";
import { useRef, useState, type PropsWithChildren } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react-native";
import type {
  MobileContractDraft,
  MobileDraftOptions,
  MobileDraftStaff,
} from "@himoto/mobile-contract";
import { useTheme, money, dateTime } from "@/theme";
import { draftWindowDifferences } from "@himoto/mobile-draft-validation";
import { staffRoles, hasSalesCommissionRole } from '../../../shared/staff-positions';
import { emptyDraftVehicle, type DraftErrors } from "@/lib/draft-form";
import { Card, Button } from "./ui";
import { FormField, ChoiceField } from "./form-fields";
import { DateField } from "./date-field";
import { RentalDateTime } from "./rental-date-time";
import { EditorSheet } from "./editor-sheet";

type Props<T extends MobileContractFormInput> = {
  input: T;
  change: (next: T) => void;
  disabled: boolean;
  errors: DraftErrors;
};
export function DraftSection({
  title,
  children,
}: PropsWithChildren<{ title: string }>) {
  const theme = useTheme();
  return (
    <Card style={{ padding: 18, gap: 18 }}>
      <Text
        accessibilityRole="header"
        style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}
      >
        {title}
      </Text>
      {children}
    </Card>
  );
}
function Disclosure({
  title,
  initial = false,
  children,
}: PropsWithChildren<{ title: string; initial?: boolean }>) {
  const theme = useTheme(),
    [open, setOpen] = useState(initial);
  return (
    <Card style={{ padding: 18, gap: open ? 18 : 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((value) => !value)}
        style={{
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Text
          style={{
            flex: 1,
            color: theme.text,
            fontSize: 17,
            fontWeight: "700",
          }}
        >
          {title}
        </Text>
        {open ? (
          <ChevronUp size={21} color={theme.muted} />
        ) : (
          <ChevronDown size={21} color={theme.muted} />
        )}
      </Pressable>
      {open && children}
    </Card>
  );
}
function MoneyField({
  label,
  value,
  onChange,
  disabled,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  error?: string;
}) {
  return (
    <FormField
      label={label}
      value={value}
      onChangeText={onChange}
      editable={!disabled}
      error={error}
      keyboardType="number-pad"
      maxLength={16}
      autoComplete="off"
      hint={
        /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
          ? money(Number(value))
          : "Số tiền nguyên bằng VND."
      }
    />
  );
}
export function DraftPeople<T extends MobileContractFormInput>({
  input,
  change,
  disabled,
  staff,
  stores,
}: Omit<Props<T>, "errors"> & {
  staff: MobileDraftStaff[];
  stores: MobileDraftOptions["vehicleStores"];
}) {
  const d = input.draft;
  const salesFollowsSource = useRef(!d.sales_staff_id && !d.sales_staff_name?.trim() && !d.tls_staff_id);
  const [manualSales, setManualSales] = useState(Boolean(!d.sales_staff_id && d.sales_staff_name?.trim()));
  const commissionStaff = staff.filter(row => {
    if (/^tls$/i.test(row.name.trim())) return false;
    if (String(row.id) === d.sales_staff_id || String(row.id) === d.tls_staff_id) return true;
    const roles = staffRoles(row.position);
    return hasSalesCommissionRole(row.position) || roles.includes('TPKD') || roles.includes('TLS') || row.roles.includes('telesales') || row.roles.includes('sales');
  });
  const sourceStaff = staff.filter(row => !/^tls$/i.test(row.name.trim()) && (commissionStaff.includes(row) || String(row.storeId) === (d.vehicle_store_id ?? d.store_id) || String(row.storeId) === d.store_id));
  const set = (next: Partial<MobileContractDraft>) =>
    change({ ...input, draft: { ...d, ...next } });
  function changeSource(value:string) {
    const key=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/\s+/g,' ').trim().toLocaleLowerCase('vi');
    const needle=key(value);
    if(['tls','telesale','telesales'].includes(needle)){set({customer_source:'TLS',tls_staff_id:''});return;}
    const exact=commissionStaff.filter(row=>[row.name,row.sourceLabel||''].some(label=>key(label)===needle));
    const partial=needle.length>=2?commissionStaff.filter(row=>[row.name,row.sourceLabel||''].some(label=>key(label).includes(needle))):[];
    const matched=exact.length===1?exact[0]:exact.length===0&&partial.length===1?partial[0]:undefined;
    const sales=matched?.roles.includes('sales'),tls=matched?.roles.includes('telesales')&&!sales;
    set({customer_source:tls?'TLS':value,...(salesFollowsSource.current?matched?sales?{sales_staff_id:String(matched.id),sales_staff_name:matched.name,tls_staff_id:''}:tls?{sales_staff_id:'',sales_staff_name:'',tls_staff_id:String(matched.id)}:{}:{sales_staff_id:'',sales_staff_name:'',tls_staff_id:''}:{})});
  }
  function choices(
    role: MobileDraftStaff["roles"][number],
    current: string | undefined,
    name: string | undefined,
    optional = false,
  ) {
    let rows: MobileDraftStaff[];
    if (role === 'sales') {
      const commissionSet = new Set(commissionStaff.map(s => s.id));
      const remainingStaff = staff.filter(s => !commissionSet.has(s.id) && !/^tls$/i.test(s.name.trim()));
      rows = [...commissionStaff, ...remainingStaff];
    } else {
      rows = staff.filter((row) => row.roles.includes(role));
    }
    return [
      ...(optional ? [{ value: "", label: "Chưa ghi nhận" }] : []),
      { value: "manual", label: "Nhập tên" },
      ...rows.map((row) => ({
        value: String(row.id),
        label: `${row.name}${stores.find((store) => store.id === row.storeId)?.name ? ` · ${stores.find((store) => store.id === row.storeId)!.name}` : ""}`,
      })),
      ...(current && !rows.some((row) => String(row.id) === current)
        ? [{ value: current, label: name || `Nhân sự đã lưu #${current}` }]
        : []),
    ];
  }
  return (
    <Disclosure
      title="Nhân sự và nguồn khách"
      initial={!!d.sales_staff_id || !!d.sales_staff_name || !!d.tls_staff_id}
    >
      <FormField
        label="Người làm hợp đồng"
        value={d.staff_name}
        editable={false}
        hint="Hợp đồng mới lấy tên tài khoản đăng nhập. Hồ sơ đã lưu giữ nguyên người làm hợp đồng."
      />
      <ChoiceField
        label="NVKD ghi nhận doanh số"
        value={d.sales_staff_id || (manualSales || d.sales_staff_name ? "manual" : "")}
        disabled={disabled}
        searchable
        choices={choices("sales", d.sales_staff_id, d.sales_staff_name, true)}
        onChange={(value) => {
          const row = staff.find((item) => String(item.id) === value);
          salesFollowsSource.current = !value;
          const isManual = value === "manual";
          setManualSales(isManual);
          set({
            sales_staff_id: row ? value : "",
            tls_staff_id: '',
            sales_staff_name: row
              ? row.name
              : isManual
                ? d.sales_staff_name || ""
                : "",
          });
        }}
      />
      {(manualSales || (!d.sales_staff_id && !!d.sales_staff_name?.trim())) && (
        <FormField
          label="Tên NVKD nhập tay"
          value={d.sales_staff_name || ""}
          editable={!disabled}
          onChangeText={(value) => {salesFollowsSource.current=!value.trim();set({ sales_staff_name: value, tls_staff_id:'' });}}
          maxLength={191}
          autoComplete="off"
        />
      )}
      <ChoiceField
        label="Nhân viên TLS"
        value={d.tls_staff_id || ""}
        disabled={disabled}
        searchable
        choices={[
          { value: "", label: "Chưa chọn" },
          ...staff
            .filter((row) => row.roles.includes("telesales"))
            .map((row) => ({ value: String(row.id), label: row.name })),
          ...(d.tls_staff_id &&
          !staff.some((row) => String(row.id) === d.tls_staff_id)
            ? [
                {
                  value: d.tls_staff_id,
                  label: `TLS đã lưu #${d.tls_staff_id}`,
                },
              ]
            : []),
        ]}
        onChange={(value) =>
          { salesFollowsSource.current = !value; set({
            tls_staff_id: value,
            ...(value ? {sales_staff_id:'',sales_staff_name:''} : {}),
            ...(value ? { customer_source: "TLS" } : {}),
          }); }
        }
      />
      <ChoiceField label="Chọn nguồn khách từ nhân sự" value={d.customer_source === 'TLS' ? 'TLS' : staff.find(row => row.sourceLabel === d.customer_source)?.id.toString() || ''} disabled={disabled} searchable choices={[
        {value:'',label:'Nhập nguồn khác'}, {value:'TLS',label:'TLS'},
        ...sourceStaff.map(row=>({value:String(row.id),label:row.sourceLabel||row.name})),
      ]} onChange={value=>{
        if(!value){set({customer_source:''});return;}
        if(value==='TLS'){set({customer_source:'TLS',tls_staff_id:''});return;}
        const row=staff.find(item=>String(item.id)===value);if(!row)return;
        const sales=row.roles.includes('sales'),pureTls=!sales&&row.roles.includes('telesales');
        set({customer_source:pureTls?'TLS':row.sourceLabel||row.name,
          ...(salesFollowsSource.current&&commissionStaff.includes(row)?sales?{sales_staff_id:String(row.id),sales_staff_name:row.name,tls_staff_id:''}:pureTls?{sales_staff_id:'',sales_staff_name:'',tls_staff_id:String(row.id)}:{}:{}),
        });
      }} />
      <FormField
        label="Nguồn khách"
        value={d.customer_source}
        editable={!disabled}
        onChangeText={changeSource}
        maxLength={4000}
      />
      <FormField
        label="Đường dẫn nguồn khách"
        value={d.customer_source_url}
        editable={!disabled}
        onChangeText={(value) => set({ customer_source_url: value })}
        maxLength={4000}
        autoCapitalize="none"
        autoComplete="off"
      />
    </Disclosure>
  );
}
export function DraftParty<T extends MobileContractFormInput>({ input, change, disabled, errors }: Props<T>) {
  const d = input.draft,
    customer = d.customer;
  const set = <K extends keyof typeof customer>(
    key: K,
    value: (typeof customer)[K],
  ) =>
    change({
      ...input,
      draft: { ...d, customer: { ...customer, [key]: value } },
    });
  function relative(
    index: number,
    key: "name" | "relationship" | "phone",
    value: string,
  ) {
    const relatives = d.relatives.map((row, i) =>
      i === index ? { ...row, [key]: value } : row,
    ) as MobileContractDraft["relatives"];
    const text = relatives
      .filter((row) => row.name || row.phone)
      .map(
        (row) =>
          `${row.name}${row.relationship ? ` (${row.relationship})` : ""}${row.phone ? `: ${row.phone}` : ""}`,
      )
      .join(" - Và: ");
    change({
      ...input,
      draft: {
        ...d,
        relatives,
        customer: {
          ...customer,
          relatives_text: text,
          relatives_json: JSON.stringify(relatives),
        },
      },
    });
  }
  return (
    <>
      <DraftSection title="Thông tin khách trên hợp đồng">
        <ChoiceField
          label="Loại khách trên hợp đồng"
          value={customer.customer_type || "vietnam"}
          disabled={disabled}
          choices={[
            { value: "vietnam", label: "Khách trong nước" },
            { value: "foreign", label: "Khách nước ngoài" },
          ]}
          onChange={(value) => set("customer_type", value)}
        />
        <FormField
          label="Họ tên khách thuê"
          value={customer.name}
          onChangeText={(value) => set("name", value)}
          editable={!disabled}
          autoComplete="off"
          maxLength={200}
          error={errors.name}
        />
        <FormField
          label="Điện thoại khách thuê"
          value={customer.phone}
          onChangeText={(value) => set("phone", value)}
          editable={!disabled}
          autoComplete="off"
          keyboardType="phone-pad"
          maxLength={1000}
          error={errors.phone}
        />
        <FormField
          label="Email khách thuê"
          value={customer.email}
          onChangeText={(value) => set("email", value)}
          editable={!disabled}
          autoComplete="off"
          autoCapitalize="none"
          keyboardType="email-address"
          maxLength={254}
          error={errors.email}
        />
        <FormField
          label="Địa chỉ khách thuê"
          value={customer.address}
          onChangeText={(value) => set("address", value)}
          editable={!disabled}
          autoComplete="off"
          multiline
          maxLength={4000}
          error={errors.address}
        />
        {customer.customer_type === "foreign" && (
          <>
            <FormField
              label="Quốc tịch"
              value={customer.nationality}
              onChangeText={(value) => set("nationality", value)}
              editable={!disabled}
              maxLength={1000}
            />
            <FormField
              label="Kênh liên hệ khách thuê"
              value={customer.contact_channel}
              onChangeText={(value) => set("contact_channel", value)}
              editable={!disabled}
              maxLength={1000}
            />
            <FormField
              label="Liên hệ khách thuê"
              value={customer.contact_detail}
              onChangeText={(value) => set("contact_detail", value)}
              editable={!disabled}
              maxLength={1000}
            />
          </>
        )}
        <FormField
          label="Lưu ý về khách trên hợp đồng"
          value={customer.warning_note}
          onChangeText={(value) => set("warning_note", value)}
          editable={!disabled}
          multiline
          maxLength={4000}
        />
      </DraftSection>
      <Disclosure
        title="Giấy tờ của khách"
        initial={
          !!errors.id_card_issued_on ||
          !!errors.driver_license_issued_on ||
          !!errors.birthday
        }
      >
        <FormField
          label={
            customer.customer_type === "foreign"
              ? "Hộ chiếu khách thuê"
              : "CCCD/CMND khách thuê"
          }
          value={customer.id_card}
          onChangeText={(value) => set("id_card", value)}
          editable={!disabled}
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={100}
          error={errors.id_card}
        />
        <DateField
          label="Ngày cấp giấy tờ khách thuê"
          value={customer.id_card_issued_on}
          onChange={(value) => set("id_card_issued_on", value)}
          disabled={disabled}
          error={errors.id_card_issued_on}
        />
        <FormField
          label="Nơi cấp giấy tờ khách thuê"
          value={customer.id_card_issued_by}
          onChangeText={(value) => set("id_card_issued_by", value)}
          editable={!disabled}
          maxLength={255}
        />
        <FormField
          label="GPLX khách thuê"
          value={customer.driver_license_number}
          onChangeText={(value) => set("driver_license_number", value)}
          editable={!disabled}
          autoComplete="off"
          maxLength={100}
        />
        <DateField
          label="Ngày cấp GPLX khách thuê"
          value={customer.driver_license_issued_on}
          onChange={(value) => set("driver_license_issued_on", value)}
          disabled={disabled}
          error={errors.driver_license_issued_on}
        />
        <DateField
          label="Ngày sinh khách thuê"
          value={customer.birthday}
          onChange={(value) => set("birthday", value)}
          disabled={disabled}
          error={errors.birthday}
        />
      </Disclosure>
      <Disclosure
        title="Người thân trên hợp đồng"
        initial={Object.keys(errors).some((key) => key.startsWith("relative_"))}
      >
        {d.relatives.map((row, index) => (
          <View key={index} style={{ gap: 14 }}>
            <FormField
              label={`Họ tên người thân ${index + 1}`}
              value={row.name}
              editable={!disabled}
              onChangeText={(value) => relative(index, "name", value)}
              maxLength={200}
              error={errors[`relative_${index}_name`]}
            />
            <FormField
              label={`Quan hệ người thân ${index + 1}`}
              value={row.relationship}
              editable={!disabled}
              onChangeText={(value) => relative(index, "relationship", value)}
              maxLength={200}
            />
            <FormField
              label={`Điện thoại người thân ${index + 1}`}
              value={row.phone}
              editable={!disabled}
              onChangeText={(value) => relative(index, "phone", value)}
              keyboardType="phone-pad"
              maxLength={50}
            />
          </View>
        ))}
      </Disclosure>
    </>
  );
}
export function DraftVehicleLines<T extends MobileContractFormInput>({ input, change, disabled, errors }: Props<T>) {
  const theme = useTheme(),
    d = input.draft;
  return (
    <>
      {d.vehicles.map((row, index) => (
        <DraftSection
          key={`${row.id || "empty"}:${index}`}
          title={row.id ? `${row.license} · ${row.name}` : "Dòng xe chưa chọn"}
        >
          {!!row.stock_store_name && (
            <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 22 }}>
              Kho xe: {row.stock_store_name}
            </Text>
          )}
          {draftWindowDifferences(d).includes(index) && (
            <Text
              style={{ color: theme.warning, fontSize: 14, lineHeight: 22 }}
            >
              Thời gian cũ trên dòng xe: {dateTime(row.rent_at)} →{" "}
              {dateTime(row.return_at)}. {input.status === 'draft' ? 'Khi phát hành sẽ dùng lịch chung của hợp đồng.' : 'Giữ lịch đang lưu nếu không đổi lịch chung hợp đồng.'}
            </Text>
          )}
          <Disclosure
            title={`Lái xe và đồ mượn ${index + 1}`}
            initial={Object.keys(errors).some((key) =>
              key.startsWith(`vehicle_${index}`),
            )}
          >
            <FormField
              label={`Màu xe ${index + 1}`}
              value={row.color}
              editable={!disabled}
              maxLength={100}
              onChangeText={color => change({ ...input, draft: { ...d, vehicles: d.vehicles.map((vehicle, i) => i === index ? { ...vehicle, color } : vehicle) } })}
            />
            <FormField
              label={`Lái xe ${index + 1}`}
              value={row.driver_name}
              editable={!disabled}
              onChangeText={(value) =>
                change({
                  ...input,
                  draft: {
                    ...d,
                    vehicles: d.vehicles.map((vehicle, i) =>
                      i === index
                        ? { ...vehicle, driver_name: value }
                        : vehicle,
                    ),
                  },
                })
              }
              maxLength={200}
              autoComplete="off"
            />
            <FormField
              label={`GPLX lái xe ${index + 1}`}
              value={row.driver_license_number}
              editable={!disabled}
              onChangeText={(value) =>
                change({
                  ...input,
                  draft: {
                    ...d,
                    vehicles: d.vehicles.map((vehicle, i) =>
                      i === index
                        ? { ...vehicle, driver_license_number: value }
                        : vehicle,
                    ),
                  },
                })
              }
              maxLength={100}
              autoComplete="off"
            />
            <DateField
              label={`Ngày cấp GPLX lái xe ${index + 1}`}
              value={row.driver_license_issued_on}
              disabled={disabled}
              onChange={(value) =>
                change({
                  ...input,
                  draft: {
                    ...d,
                    vehicles: d.vehicles.map((vehicle, i) =>
                      i === index
                        ? { ...vehicle, driver_license_issued_on: value }
                        : vehicle,
                    ),
                  },
                })
              }
              error={errors[`vehicle_${index}_driver_license_issued_on`]}
            />
            <FormField
              label={`Mũ bảo hiểm xe ${index + 1}`}
              value={row.borrow_hats}
              editable={!disabled}
              onChangeText={(value) =>
                change({
                  ...input,
                  draft: {
                    ...d,
                    vehicles: d.vehicles.map((vehicle, i) =>
                      i === index
                        ? { ...vehicle, borrow_hats: value }
                        : vehicle,
                    ),
                  },
                })
              }
              keyboardType="number-pad"
              maxLength={5}
              error={errors[`vehicle_${index}_borrow_hats`]}
            />
            <FormField
              label={`Áo mưa xe ${index + 1}`}
              value={row.borrow_raincoats}
              editable={!disabled}
              onChangeText={(value) =>
                change({
                  ...input,
                  draft: {
                    ...d,
                    vehicles: d.vehicles.map((vehicle, i) =>
                      i === index
                        ? { ...vehicle, borrow_raincoats: value }
                        : vehicle,
                    ),
                  },
                })
              }
              keyboardType="number-pad"
              maxLength={5}
              error={errors[`vehicle_${index}_borrow_raincoats`]}
            />
          </Disclosure>
          {(row.id || row.name || row.license || d.vehicles.length > 1) && (
            <Button
              secondary
              label={`Bỏ xe ${row.license || index + 1}`}
              disabled={disabled}
              onPress={() => {
                const vehicles = d.vehicles.filter((_, i) => i !== index);
                change({
                  ...input,
                  draft: {
                    ...d,
                    vehicles: vehicles.length
                      ? vehicles
                      : [emptyDraftVehicle()],
                  },
                });
              }}
            />
          )}
        </DraftSection>
      ))}
    </>
  );
}
export function DraftRequirements<T extends MobileContractFormInput>({ input, change, disabled }: Props<T>) {
  const d = input.draft;
  const requirements = d.document_requirements || {
    phone: true,
    id_card: true,
    address: true,
    representative: true,
    relatives: 2 as const,
  };
  const set = <K extends keyof MobileContractDraft>(key: K, value: MobileContractDraft[K]) =>
    change({ ...input, draft: { ...d, [key]: value } });
  return (
    <Disclosure title="Yêu cầu hồ sơ khi in hợp đồng">
        <ChoiceField
          label="Yêu cầu giấy tờ khi in hợp đồng"
          value={requirements.id_card ? "on" : "off"}
          disabled={disabled}
          choices={[
            { value: "on", label: "Có yêu cầu" },
            { value: "off", label: "Không yêu cầu" },
          ]}
          onChange={(value) =>
            set("document_requirements", {
              ...requirements,
              id_card: value === "on",
            })
          }
        />
        {(
          [
            ["phone", "điện thoại"],
            ["address", "địa chỉ"],
            ["representative", "người đại diện"],
          ] as const
        ).map(([key, label]) => (
          <ChoiceField
            key={key}
            label={`Yêu cầu ${label} khi in hợp đồng`}
            value={requirements[key] ? "on" : "off"}
            disabled={disabled}
            choices={[
              { value: "on", label: "Có yêu cầu" },
              { value: "off", label: "Không yêu cầu" },
            ]}
            onChange={(value) =>
              set("document_requirements", {
                ...requirements,
                [key]: value === "on",
              })
            }
          />
        ))}
        <ChoiceField
          label="Số người thân khi in hợp đồng"
          value={String(requirements.relatives)}
          disabled={disabled}
          choices={[0, 1, 2].map((value) => ({
            value: String(value),
            label: `${value} người`,
          }))}
          onChange={(value) =>
            set("document_requirements", {
              ...requirements,
              relatives: Number(value) as 0 | 1 | 2,
            })
          }
        />
    </Disclosure>
  );
}
export function DraftFees<T extends MobileContractFormInput>({ input, change, disabled, errors }: Props<T>) {
  const theme = useTheme(),
    d = input.draft,
    [schedule, setSchedule] = useState(false);
  const set = <K extends keyof MobileContractDraft>(
    key: K,
    value: MobileContractDraft[K],
  ) => change({ ...input, draft: { ...d, [key]: value } });
  return (
    <>
      <DraftSection title="Giá trị dự kiến">
        <ChoiceField
          label="Gói thuê"
          value={d.package_name}
          disabled={disabled}
          choices={[
            { value: "Theo ngày", label: "Theo ngày" },
            { value: "Theo tuần", label: "Theo tuần" },
            { value: "Theo tháng", label: "Theo tháng" },
            { value: "Tùy chọn", label: "Tùy chọn" },
            ...(!["Theo ngày", "Theo tuần", "Theo tháng", "Tùy chọn"].includes(
              d.package_name,
            ) && d.package_name
              ? [{ value: d.package_name, label: d.package_name }]
              : []),
          ]}
          onChange={(value) => set("package_name", value)}
        />
        <MoneyField
          label="Đơn giá (VND)"
          value={d.unit_price}
          onChange={(value) => set("unit_price", value)}
          disabled={disabled}
          error={errors.unit_price}
        />
        <MoneyField
          label="Tổng giá trị hợp đồng (VND)"
          value={d.total_amount}
          onChange={(value) => set("total_amount", value)}
          disabled={disabled}
          error={errors.total_amount}
        />
        <MoneyField
          label="Tiền cọc dự kiến (VND)"
          value={d.deposit_amount}
          onChange={(value) => set("deposit_amount", value)}
          disabled={disabled}
          error={errors.deposit_amount}
        />
        <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 22 }}>
          Đã nhận tiền thuê:{" "}
          {/^\d+$/.test(d.paid_amount)
            ? money(Number(d.paid_amount))
            : "Chưa có số liệu"}
        </Text>
        <FormField
          label="Tài sản giữ lại / thế chấp"
          value={d.collateral_description}
          onChangeText={(value) => set("collateral_description", value)}
          editable={!disabled}
          multiline
          maxLength={4000}
        />
      </DraftSection>
      {input.status !== 'draft' && <Disclosure title="Hình thức dự kiến nhận tiền">
        {(['deposit_payment_method', 'payment_method'] as const).map(key => {
          const selected = d[key].split(',').map(v => v.trim()).filter(Boolean);
          return <View key={key} style={{ gap: 12 }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{key === 'deposit_payment_method' ? 'Dự kiến nhận cọc' : 'Dự kiến thu thuê / phí'}</Text>
            {['Tiền mặt', 'CK tk cá nhân', 'CK tk công ty'].map(method => <ChoiceField key={method} label={`${key === 'deposit_payment_method' ? 'Nhận cọc' : 'Thu thuê / phí'} bằng ${method}`} value={selected.includes(method) ? 'yes' : 'no'} choices={[{ value: 'yes', label: 'Có chọn' }, { value: 'no', label: 'Không chọn' }]} disabled={disabled} onChange={v => set(key, (v === 'yes' ? [...selected.filter(s => s !== method), method] : selected.filter(s => s !== method)).join(', '))} />)}
          </View>;
        })}
        <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 22 }}>Có thể chọn nhiều hình thức. Phiếu thực thu được giữ riêng theo tài khoản/két đã nhận.</Text>
      </Disclosure>}
      <Disclosure
        title="Các khoản phí khác"
        initial={
          !!d.extra_charges?.length ||
          Object.keys(errors).some((key) => key.startsWith("charge_"))
        }
      >
        {(d.extra_charges || []).map((row, index) => (
          <View key={index} style={{ gap: 14 }}>
            <FormField
              label={`Tên khoản phí ${index + 1}`}
              value={row.name}
              editable={!disabled}
              maxLength={100}
              onChangeText={(value) =>
                set(
                  "extra_charges",
                  d.extra_charges!.map((item, i) =>
                    i === index ? { ...item, name: value } : item,
                  ),
                )
              }
            />
            <MoneyField
              label={`Số tiền khoản phí ${index + 1} (VND)`}
              value={row.amount}
              disabled={disabled}
              onChange={(value) =>
                set(
                  "extra_charges",
                  d.extra_charges!.map((item, i) =>
                    i === index ? { ...item, amount: value } : item,
                  ),
                )
              }
              error={errors[`charge_${index}`]}
            />
            <ChoiceField
              label={`Cách thu khoản phí ${index + 1}`}
              value={row.method || ""}
              disabled={disabled}
              choices={[
                { value: "", label: "Chưa chọn" },
                { value: "cash", label: "Tiền mặt" },
                { value: "transfer", label: "CK tài khoản cá nhân" },
                { value: "company_transfer", label: "CK tài khoản công ty" },
              ]}
              onChange={(value) =>
                set(
                  "extra_charges",
                  d.extra_charges!.map((item, i) =>
                    i === index
                      ? {
                          name: item.name,
                          amount: item.amount,
                          ...(value
                            ? {
                                method: value as
                                  | "cash"
                                  | "transfer"
                                  | "company_transfer",
                              }
                            : {}),
                        }
                      : item,
                  ),
                )
              }
            />
            <Button
              secondary
              label={`Bỏ khoản phí ${index + 1}`}
              disabled={disabled}
              onPress={() =>
                set(
                  "extra_charges",
                  d.extra_charges!.filter((_, i) => i !== index),
                )
              }
            />
          </View>
        ))}
        <Button
          secondary
          label="Thêm khoản phí"
          disabled={disabled || (d.extra_charges?.length || 0) >= 20}
          onPress={() =>
            set("extra_charges", [
              ...(d.extra_charges || []),
              { name: "", amount: "" },
            ])
          }
        />
        <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 20 }}>
          Đối chiếu tổng giá trị hợp đồng với các khoản phí trước khi lưu.
        </Text>
      </Disclosure>
      <Disclosure
        title="Kỳ đóng tiền"
        initial={!!d.custom_installments?.length || !!d.ownership}
      >
        {d.ownership && (
          <ChoiceField
            label="Thời hạn thuê sở hữu"
            value={d.ownership_term_months || "custom"}
            disabled={disabled}
            choices={[
              { value: "custom", label: "Tùy chọn" },
              ...["6", "9", "12", "18", "24"].map((value) => ({
                value,
                label: `${value} tháng`,
              })),
            ]}
            onChange={(value) =>
              set(
                "ownership_term_months",
                value as MobileContractDraft["ownership_term_months"],
              )
            }
          />
        )}
        <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 22 }}>
          Lịch riêng đã lưu: {d.custom_installments?.length || 0} kỳ.
        </Text>
        <Button
          secondary
          label="Chỉnh lịch đóng tiền"
          disabled={disabled}
          onPress={() => setSchedule(true)}
        />
      </Disclosure>
      {schedule && (
        <InstallmentSheet
          items={d.custom_installments || []}
          onClose={() => setSchedule(false)}
          onApply={(items) => {
            set("custom_installments", items);
            setSchedule(false);
          }}
        />
      )}
    </>
  );
}
function InstallmentSheet({
  items,
  onClose,
  onApply,
}: {
  items: NonNullable<MobileContractDraft["custom_installments"]>;
  onClose: () => void;
  onApply: (
    items: NonNullable<MobileContractDraft["custom_installments"]>,
  ) => void;
}) {
  const theme = useTheme(),
    [rows, setRows] = useState(() =>
      items.map((value, index) => ({
        key: String(index),
        value: { ...value },
      })),
    ),
    next = useRef(items.length);
  const update = (key: string, value: Partial<(typeof items)[number]>) =>
    setRows((current) =>
      current.map((row) =>
        row.key === key ? { ...row, value: { ...row.value, ...value } } : row,
      ),
    );
  return (
    <EditorSheet title="Lịch đóng tiền" onClose={onClose}>
      <View style={{ padding: 18, gap: 14 }}>
        <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 22 }}>
          {rows.length} kỳ · Chọn Áp dụng để đưa thay đổi vào bản nháp.
        </Text>
        <Button
          secondary
          label="Thêm kỳ đóng"
          disabled={rows.length >= 3659}
          onPress={() => {
            const key = String(next.current++);
            setRows((current) => [
              ...current,
              { key, value: { due_at: "", amount: "" } },
            ]);
          }}
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={3}
        windowSize={5}
        renderItem={({ item, index }) => (
          <View
            style={{
              padding: 18,
              gap: 14,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <RentalDateTime
              label={`đóng kỳ ${index + 1}`}
              value={item.value.due_at}
              onChange={(due_at) => update(item.key, { due_at })}
            />
            <MoneyField
              label={`Số tiền kỳ ${index + 1} (VND)`}
              value={item.value.amount}
              onChange={(amount) => update(item.key, { amount })}
              disabled={false}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Bỏ kỳ ${index + 1}`}
              onPress={() =>
                setRows((current) =>
                  current.filter((row) => row.key !== item.key),
                )
              }
              style={{
                minHeight: 48,
                minWidth: 48,
                alignSelf: "flex-end",
                justifyContent: "center",
              }}
            >
              <Trash2 size={22} color={theme.danger} />
            </Pressable>
          </View>
        )}
      />
      <View
        style={{ padding: 18, borderTopWidth: 1, borderTopColor: theme.border }}
      >
        <Button
          label="Áp dụng lịch đóng tiền"
          onPress={() => onApply(rows.map((row) => row.value))}
        />
      </View>
    </EditorSheet>
  );
}
