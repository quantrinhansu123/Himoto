import "server-only";
import type { PoolClient } from "pg";
import type { SessionUser } from "./management-session";
import { hasPermission, canViewOwnedFleetRevenue } from "@/lib/management/permissions";
import { withMobileData } from "./mobile-context";
import { himotoPool, ownerDatabase } from "./himoto-database";
import { MobileError } from "./mobile-session";
import { rentalRevenue, RentalRevenueError } from "./rental-revenue";
import { estimatedSales } from "./estimated-sales";
import { revenueLedger, RevenueLedgerError } from "./revenue-ledger";
import { vehicleRevenue, rentalOverview, RentalReportError } from "./rental-reports";
import { ownedFleetRevenue } from "./owned-fleet-revenue";
import { staffSales, StaffSalesError } from "./staff-sales";
import { readSalesSummary, PageSummaryError } from "./page-summaries";
import { newCustomersBySource, NewCustomersBySourceError } from "./new-customers-by-source";
import { filterNewCustomersBySource } from "@/lib/management/new-customers-by-source";
import { validRentalRevenue } from "@/lib/management/rental-revenue";
import { validEstimatedSales } from "@/lib/management/estimated-sales";
import { validRentalReport } from "@/lib/management/rental-reports";
import type { VehicleRevenueRow } from "@/lib/management/rental-reports";
import { CONTRACT_STATUSES } from "@/lib/management/config";
import { validOwnedFleetReport } from "@/lib/management/owned-fleet-revenue";
import { validRevenueLedger, REVENUE_LEDGER_CATEGORIES, REVENUE_LEDGER_METHODS } from "@/lib/management/revenue-ledger";
import { isSalesReportKind, isMobileSalesReport, paginateReportSections, SALES_REPORTS, type SalesReportKind, type MobileSalesReport, type ReportSection, type ReportColumn, type ReportMetric, type ReportRow, type ReportValue, type ReportAction } from "../../../shared/mobile-reports";

const baseKeys = ["from", "to", "store_id", "section_pages"];
export function reportSectionPages(value: string | null): Record<string, number> | null {
  if (value === null) return null;
  try {
    if (value.length > 2048) throw Error();
    const pages: unknown = JSON.parse(value);
    if (!pages || typeof pages !== 'object' || Array.isArray(pages) || Object.keys(pages).length > 20 ||
      !Object.entries(pages).every(([key, page]) => /^[a-zA-Z0-9_-]{1,64}$/.test(key) && Number.isSafeInteger(page) && page >= 1 && page <= 100000)) throw Error();
    return pages as Record<string, number>;
  } catch { throw new MobileError('Trang chi tiết báo cáo không hợp lệ.'); }
}
const keys: Record<SalesReportKind, string[]> = {
  actual: [], ledger: ["search", "category", "method", "side", "page", "size"], vehicles: ["search", "sort", "direction", "page", "size", "vehicle_id"],
  overview: ["view", "detail"], fleet: ["view", "page", "size"], contracts: [], "by-staff": [], "by-store": [],
  "new-customers": ["search", "source", "sourcePresence", "detail"], assigned: ["department"],
};
function permission(user: SessionUser, kind?: SalesReportKind) {
  if (!hasPermission(user, "contracts.read")) throw new MobileError("Tài khoản không có quyền xem báo cáo thuê xe.", 403, "FORBIDDEN");
  if (kind === "fleet" && !canViewOwnedFleetRevenue(user)) throw new MobileError("Tài khoản không có quyền xem doanh thu đội xe chủ quản.", 403, "FORBIDDEN");
}
export function reportQuery(kind: SalesReportKind, raw: URLSearchParams) {
  const query = new URLSearchParams(raw);
  for (const [key] of query) if (![...baseKeys, ...keys[kind]].includes(key) || query.getAll(key).length !== 1) throw new MobileError("Bộ lọc báo cáo không hợp lệ.");
  reportSectionPages(query.get('section_pages'));
  query.delete('section_pages');
  if (query.get("store_id") === "all") query.delete("store_id");
  if (kind === "ledger" && !query.get("side")) query.set("side", "in");
  if (query.has("detail") && query.get("detail") !== "1") throw new MobileError("Mục chi tiết báo cáo không hợp lệ.");
  const from = query.get("from") || "", to = query.get("to") || "";
  const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!date(from) || !date(to) || from > to || query.has("store_id") && !/^[1-9]\d{0,14}$/.test(query.get("store_id") || "")) throw new MobileError("Kiểm tra khoảng ngày và cơ sở báo cáo.");
  if (kind === "assigned" && !["", "NVKD", "TLS"].includes(query.get("department") || "") || kind === "new-customers" && !["", "with", "without"].includes(query.get("sourcePresence") || "") || (query.get("search") || "").length > 255 || (query.get("source") || "").length > 255) throw new MobileError("Bộ lọc báo cáo không hợp lệ.");
  return query;
}
async function read<T>(user: SessionUser, kind: SalesReportKind | null, run: (client: PoolClient) => Promise<T>) {
  permission(user, kind || undefined);
  return withMobileData(user, "", async () => {
    // Exactly the web's individual, read-only exception. Never widen workspace scope.
    const client = await (kind === "fleet" ? ownerDatabase : himotoPool).connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); await client.query("SET LOCAL statement_timeout='60s'");
      const value = await run(client); await client.query("COMMIT"); return value;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof RentalReportError || error instanceof RentalRevenueError || error instanceof PageSummaryError) throw new MobileError(error.message);
      if (error instanceof StaffSalesError || error instanceof RevenueLedgerError || error instanceof NewCustomersBySourceError) throw new MobileError(error.message, error.status);
      throw error;
    } finally { client.release(); }
  });
}
export { read as withMobileReportData };
export function readMobileReportOptions(user: SessionUser) { return read(user, null, async client => ({ canViewFleet: canViewOwnedFleetRevenue(user), stores: (await client.query("SELECT id,store_name FROM himoto.stores ORDER BY store_name,id")).rows.map(row => ({ id: Number(row.id), name: String(row.store_name || "") })), ledgerCategories: [{ value: "", label: "Tất cả nghiệp vụ" }, { value: "revenue", label: "Có tính doanh thu" }, ...Object.entries(REVENUE_LEDGER_CATEGORIES).map(([value, label]) => ({ value, label }))], ledgerMethods: [{ value: "", label: "Tất cả hình thức" }, ...Object.entries(REVENUE_LEDGER_METHODS).map(([value, label]) => ({ value, label }))] })); }
type Fields = readonly (readonly [string, string, ("text" | "money" | "count" | "date" | "datetime")?])[];
const cols = (fields: Fields): ReportColumn[] => fields.map(([key, label, format = "money"]) => ({ key, label, format }));
const values = (row: object, fields: Fields): ReportValue[] => fields.map(([key]) => {
  const value = (row as Record<string, unknown>)[key];
  if (value !== null && typeof value !== "number" && typeof value !== "string") throw new MobileError("Báo cáo thiếu dữ liệu cần đối chiếu.", 503, "INVALID_REPORT_DATA");
  return value;
});
const metrics = (group: string, row: object, fields: Fields): ReportMetric[] => fields.map(([key, label, format]) => ({ group, label, value: (row as Record<string, number>)[key], format: format === "count" ? "count" : "money" }));
const amounts: Fields = [["rental", "Phí thuê"], ["renewal", "Gia hạn"], ["adjustment", "Điều chỉnh muộn / sớm"], ["revenue", "Doanh thu"]];
const summaries: Fields = [["name", "Tên", "text"], ["contracts", "Hợp đồng", "count"], ["customers", "Khách", "count"], ["rent", "Tiền thuê"], ["paid", "Đã thu tiền thuê"], ["deposit", "Tiền cọc"]];
const action = (label: string, kind: ReportAction["kind"], query: URLSearchParams): ReportAction => ({ label, kind, query: query.toString() });
function section(key: string, title: string, fields: Fields, rows: ReportRow[], total?: ReportValue[]): ReportSection { return { key, title, columns: cols(fields), rows, ...(total ? { total } : {}) }; }
function checked(condition: boolean) { if (!condition) throw new MobileError("Số liệu báo cáo chưa khớp tổng. Tải lại để đối chiếu.", 503, "INVALID_REPORT_DATA"); }

export async function readMobileSalesReport(user: SessionUser, rawKind: string, raw: URLSearchParams): Promise<MobileSalesReport> {
  if (!isSalesReportKind(rawKind)) throw new MobileError("Báo cáo không tồn tại.", 404, "NOT_FOUND");
  const kind = rawKind, query = reportQuery(kind, raw), from = query.get("from")!, to = query.get("to")!, store = query.has("store_id") ? Number(query.get("store_id")) : undefined;
  return read(user, kind, async client => {
    const doc: MobileSalesReport = { kind, title: SALES_REPORTS.find(row => row.value === kind)!.label, notes: [], metrics: [], sections: [], canExport: false };
    if (kind === "actual") {
      const received = await rentalRevenue(client, from, to, store), estimate = await estimatedSales(client, from, to, store);
      const summary = await readSalesSummary(client, new URLSearchParams({ from, to, store: String(store || "all") }));
      checked(validRentalRevenue(received) && validEstimatedSales(estimate));
      doc.notes = ["Doanh số và công nợ theo hợp đồng bắt đầu thuê trong khoảng ngày và cơ sở đang chọn. Doanh thu theo ngày thu/hoàn thực tế, gồm cả hợp đồng bắt đầu trước kỳ.", "Doanh thu = thuê + gia hạn + trả muộn − hoàn trả sớm thực thu/hoàn trong kỳ. Không gồm cọc, phí sửa; chưa trừ chi phí.", "Công nợ gồm đang thuê, quá hạn, chờ tất toán, bảo lưu và nợ xấu; không gồm cọc. Nợ quá hạn hiển thị riêng với nợ xấu."];
      doc.metrics = [...metrics("Doanh số ước tính", estimate, [["sales", "Doanh số"], ["contracts", "Hợp đồng trong kỳ", "count"], ["active_contracts", "Đang thuê / chưa trả", "count"], ["finished_contracts", "Đã trả", "count"], ["vehicle_days", "Ngày·xe trong kỳ", "count"]]),
        ...metrics("Doanh thu thực thu", received.total, [["revenue", "Doanh thu"], ["rental", "Phí thuê đã thu"], ["renewal", "Gia hạn đã thu"], ["late", "Trả muộn đã thu"], ["early", "Đã hoàn do trả sớm"]]),
        ...metrics("Công nợ", summary.kpis, [["debt", "Tiền thuê còn thiếu"], ["debtContracts", "Hợp đồng còn thiếu tiền", "count"], ["overdueDebt", "Nợ quá hạn chưa thu đủ"], ["overdueContracts", "Hợp đồng quá hạn chưa thu đủ", "count"], ["badDebt", "Nợ xấu riêng"]])];
      if (received.unclassified_count) doc.notes.push(`Có ${received.unclassified_count} phiếu chưa phân loại (${received.unclassified_amount} đồng), chưa cộng doanh thu; cần đối chiếu Sổ quỹ trước chốt KPI.`);
    } else if (kind === "ledger") {
      const report = await revenueLedger(client, query); checked(validRevenueLedger(report));
      const opposite = new URLSearchParams(query); opposite.set("side", query.get("side") === "out" ? "in" : "out"); opposite.set("page", "1"); opposite.set("size", "1");
      const other = await revenueLedger(client, opposite); checked(validRevenueLedger(other));
      const income = query.get("side") === "out" ? other : report, expense = query.get("side") === "out" ? report : other;
      const fields: Fields = [["code", "Hợp đồng", "text"], ["id", "Mã phiếu", "text"], ["at", "Thời điểm", "datetime"], ["customer", "Khách", "text"], ["vehicles", "Biển số", "text"], ["store_name", "Cơ sở", "text"], ["categoryLabel", "Nghiệp vụ", "text"], ["methodLabel", "Hình thức", "text"], ["signedAmount", "Số thu (+) / chi (−)"], ["revenue", "Tính doanh thu"], ["staff_name", "NVKD", "text"], ["actor_name", "Người ghi nhận", "text"], ["start_at", "Bắt đầu thuê", "datetime"], ["end_at", "Kết thúc thuê", "datetime"], ["note", "Ghi chú", "text"]];
      doc.notes = ["Phiếu đã duyệt theo ngày thực thu/chi trong kỳ. Cọc không tính doanh thu; hoàn tiền thuê làm giảm doanh thu.", "Số tiền chưa tách tiền mặt / chuyển khoản được giữ riêng để đối chiếu, không tự phân bổ."];
      doc.metrics = metrics("Sổ thu / chi theo bộ lọc", { count: income.total + expense.total, contracts: Math.max(income.totals.contracts, expense.totals.contracts), income: income.totals.income, expense: expense.totals.expense, net: income.totals.income - expense.totals.expense, revenue: income.totals.revenue + expense.totals.revenue, deposit: income.totals.deposit, deposit_refund: expense.totals.deposit_refund }, [["count", "Tổng phiếu hai sổ", "count"], ["contracts", "Hợp đồng (tham chiếu hai sổ)", "count"], ["income", "Tổng thu"], ["expense", "Tổng chi"], ["net", "Thu − chi"], ["revenue", "Tính doanh thu"], ["deposit", "Thu cọc"], ["deposit_refund", "Hoàn cọc"]]);
      const rows = report.rows.map(row => ({ key: row.id, values: values({ ...row, categoryLabel: REVENUE_LEDGER_CATEGORIES[row.category], methodLabel: REVENUE_LEDGER_METHODS[row.method], signedAmount: row.type === "out" ? -row.amount : row.amount }, fields), action: action("Mở hợp đồng", "contract", new URLSearchParams({ id: String(row.order_id) })) }));
      const table = section("ledger", "Phiếu theo bộ lọc", fields, rows); table.paging = { page: report.page, size: report.page_size, total: report.total }; doc.sections.push(table);
      const methods: Fields = [["name", "Hình thức", "text"], ["count", "Phiếu", "count"], ["income", "Thu"], ["expense", "Chi"], ["revenue", "Doanh thu"]];
      doc.sections.push(section("methods", "Đối chiếu hình thức thanh toán", methods, Object.entries(report.totals.methods).map(([key, row]) => ({ key, values: values({ name: REVENUE_LEDGER_METHODS[key as keyof typeof REVENUE_LEDGER_METHODS], ...row }, methods) })))); doc.canExport = true;
    } else if (kind === "vehicles") {
      const report = await vehicleRevenue(client, query); checked(validRentalReport("vehicle-revenue", report, query));
      doc.notes = ["Lượt thuê bắt đầu trong kỳ. Doanh thu gồm phí thuê + gia hạn + điều chỉnh muộn/sớm, không gồm cọc và sửa chữa."];
      if (Array.isArray(report)) {
        const fields: Fields = [["code", "Hợp đồng", "text"], ["rent_at", "Bắt đầu", "datetime"], ["return_at", "Kết thúc", "datetime"], ...amounts];
        doc.title = "Chi tiết lượt thuê của xe"; doc.sections.push(section("rentals", "Các lượt thuê", fields, report.map(row => ({ key: String(row.id), values: values(row, fields), action: action("Mở hợp đồng", "contract", new URLSearchParams({ id: String(row.order_id) })) }))));
      } else {
        const fields: Fields = [["name", "Tên xe", "text"], ["license", "Biển số", "text"], ["store_name", "Cơ sở hiện tại", "text"], ["type", "Loại xe", "text"], ["year", "Năm sản xuất", "count"], ["rentals", "Lượt thuê", "count"], ...amounts];
        doc.metrics = metrics("Tổng toàn bộ bộ lọc", report, [["rentals", "Lượt thuê", "count"], ...amounts]);
        const table = section("vehicles", "Doanh thu từng xe", fields, report.rows.map((row: VehicleRevenueRow) => { const detail = new URLSearchParams(query); detail.set("vehicle_id", String(row.id)); return { key: String(row.id), values: values(row, fields), action: action("Xem lượt thuê", "vehicles", detail) }; }));
        table.paging = { page: report.page, size: report.size, total: report.total }; doc.sections.push(table); doc.canExport = true;
      }
    } else if (kind === "overview") {
      const report = await rentalOverview(client, query); checked(validRentalReport("rental-overview", report, query));
      const fields: Fields = [["name", query.get("view") === "days" ? "Ngày thu / chi" : "Cơ sở", query.get("view") === "days" ? "date" : "text"], ["revenue", "Doanh thu thuê xe"], ["income", "Tổng thu thực tế"], ["expense", "Tổng chi thực tế"], ["deposit_income", "Thu cọc"], ["renewal_income", "Thu gia hạn"], ["rental_income", "Thu phí thuê"], ["late_fee_income", "Thu trả muộn"], ["deposit_refund_expense", "Trả cọc"], ["rental_refund_expense", "Hoàn trả sớm"]];
      doc.notes = ["Thu/chi theo ngày thực tế của hợp đồng thuê xe. Chọn cơ sở để xem từng ngày.", "Thu sửa chữa/thu khác và chi khác nằm ngoài công thức thuê xe, xem Sổ quỹ để đối chiếu."];
      doc.metrics = metrics("Tổng theo bộ lọc", report.total, [["revenue", "Doanh thu thuê xe"], ["income", "Tổng thu thực tế"], ["expense", "Tổng chi thực tế"]]);
      const rows = report.rows.map(row => { const target = new URLSearchParams({ from, to, store_id: row.key, view: "days", detail: "1" }); return { key: row.key, values: values({ ...row, ...row.breakdown }, fields), ...(query.get("view") !== "days" && /^[1-9]\d*$/.test(row.key) ? { action: action("Xem từng ngày", "overview", target) } : {}) }; });
      doc.sections.push(section("overview", "Thu chi theo cơ sở / ngày", fields, rows, values({ ...report.total, ...report.total.breakdown }, fields))); doc.canExport = !query.has("detail");
    } else if (kind === "fleet") {
      const report = await ownedFleetRevenue(client, query); checked(validOwnedFleetReport(report, query));
      const amounts: Fields = [["vehicles", "Tổng xe", "count"], ["local_vehicles", "Tại cơ sở gốc", "count"], ["away_vehicles", "Ở cơ sở khác", "count"], ["rentals", "Lượt thuê", "count"], ["direct_revenue", "Trực tiếp cho khách thuê"], ["loan_revenue", "Cho cơ sở khác mượn"], ["unassigned_rentals", "Lượt chưa xác định cơ sở", "count"], ["unassigned_revenue", "Doanh thu chưa xác định cơ sở"], ["revenue", "Tổng doanh thu đội xe"]];
      doc.notes = ["Cơ sở chủ quản là cơ sở gốc của xe, giữ nguyên khi điều chuyển. Bộ lọc cơ sở tại báo cáo này chọn cơ sở chủ quản.", "Cùng cách tính Doanh thu từng xe; phân theo cơ sở lập hợp đồng tại thời điểm thuê, không theo nơi giữ xe hôm nay. Số xe là danh mục hiện tại."];
      doc.metrics = metrics("Đội xe chủ quản", report.total, amounts);
      if (report.view === "stores") {
        const fields: Fields = [["store_name", "Cơ sở chủ quản", "text"], ...amounts];
        doc.sections.push(section("fleet-stores", "Đội xe theo cơ sở", fields, report.rows.map(row => ({ key: String(row.store_id), values: values(row, fields), action: action(`Xem ${row.vehicles} xe`, "fleet", new URLSearchParams({ from, to, store_id: String(row.store_id), view: "vehicles" })) }))));
      } else {
        const fields: Fields = [["name", "Tên xe", "text"], ["license", "Biển số", "text"], ["current_store_name", "Cơ sở hiện tại", "text"], ...amounts];
        const table = section("fleet-vehicles", "Xe thuộc cơ sở chủ quản", fields, report.rows.map(row => ({ key: String(row.id), values: values(row, fields) }))); table.paging = { page: report.page, size: report.size, total: report.total.vehicles }; doc.sections.push(table);
      }
    } else if (kind === "contracts" || kind === "by-staff" || kind === "by-store") {
      const summary = await readSalesSummary(client, new URLSearchParams({ from, to, store: String(store || "all") }));
      doc.notes = ["Thống kê hợp đồng bắt đầu thuê trong kỳ; không gồm cọc, giữ xe/chờ nhận xe và đã hủy. Chốt KPI thực thu ở mục Doanh thu thực thu / NVKD."];
      if (kind === "contracts") doc.metrics = metrics("Hợp đồng bắt đầu trong kỳ", { ...summary.kpis, combinedOverdue: summary.kpis.overdueDebt + summary.kpis.badDebt }, [["revenue", "Tổng doanh số"], ["contracts", "Hợp đồng", "count"], ["paid", "Số tiền đã thu"], ["debt", "Công nợ"], ["debtContracts", "Hợp đồng thiếu tiền", "count"], ["combinedOverdue", "Nợ xấu quá hạn"], ["overdueDebt", "Nợ quá hạn"], ["overdueContracts", "Hợp đồng quá hạn", "count"], ["badDebt", "Nợ xấu riêng"]]);
      else {
        const data = kind === "by-staff" ? summary.sources : summary.stores;
        doc.sections.push(section("summary", doc.title, summaries, data.rows.map(row => ({ key: row.key || "unassigned", values: values(row, summaries), series: { labels: data.days, values: row.progress } })), values({ name: "Tổng", ...data.total }, summaries))); doc.canExport = true;
      }
    } else if (kind === "assigned") {
      const data = await staffSales(client, from, to, store), department = query.get("department");
      const fields: Fields = [["name", "Nhân viên", "text"], ["department", "Bộ phận", "text"], ["basis", "Cách tính", "text"], ["contracts", "Hợp đồng", "count"], ["customers", "Khách", "count"], ["new_customers", "Khách mới", "count"], ["revenue", "Doanh số"]];
      doc.notes = ["NVKD: tiền thuê thực thu, gồm gia hạn. TLS: tiền thuê hợp đồng mở mới đầu tiên; không tính thuê sở hữu. TLS tổng hợp thành một nhóm."];
      doc.sections.push(section("assigned", "NVKD / TLS được phân công", fields, data.rows.filter(row => !department || row.department === department).map((row, index) => ({ key: `${row.department}:${row.staff_id}:${index}`, values: values({ ...row, basis: row.department === "NVKD" ? "Tiền thuê thực thu, gồm gia hạn" : "Tiền thuê HĐ mở mới đầu tiên" }, fields) })))); doc.canExport = true;
    } else {
      const data = await newCustomersBySource(client, from, to, store);
      const filtered = filterNewCustomersBySource(data, { search: query.get("search") || "", source: query.get("source") || "", sourcePresence: (query.get("sourcePresence") || "") as "" | "with" | "without" });
      const fields: Fields = [["customer_name", "Khách", "text"], ["phone", "Số điện thoại", "text"], ["id_card", "CCCD / CMND", "text"], ["customer_source", "Nguồn khách", "text"], ["store_name", "Cơ sở", "text"], ["started_on", "Bắt đầu thuê lần đầu", "date"], ["contract_code", "Hợp đồng đầu tiên", "text"], ["contract_status", "Trạng thái hợp đồng", "text"]];
      doc.notes = ["Khách có hợp đồng thuê lần đầu bắt đầu trong kỳ đang chọn. Nguồn khách và cơ sở theo hợp đồng đầu tiên."];
      doc.metrics = metrics("Khách mới theo bộ lọc", filtered.totals, [["customers", "Khách mới", "count"], ["with_source", "Đã có nguồn", "count"], ["without_source", "Chưa ghi nguồn", "count"]]);
      if (query.has("detail")) { doc.metrics = []; doc.title = "Danh sách khách hàng mới"; }
      else doc.metrics = doc.metrics.map((metric, index) => { const target = new URLSearchParams(query); target.set("detail", "1"); if (index) target.set("sourcePresence", index === 1 ? "with" : "without"); return { ...metric, action: action("Xem danh sách", "new-customers", target) }; });
      doc.sources = data.sources.map(row => ({ value: row.name, label: `${row.name} (${row.customers})` }));
      const sourceFields: Fields = [["name", "Nguồn khách", "text"], ["customers", "Khách mới", "count"]];
      if (!query.has("detail")) {
        const sources: ReportRow[] = filtered.sources.map(row => ({ key: `source:${row.name}`, values: values(row, sourceFields), action: action("Xem danh sách nguồn này", "new-customers", new URLSearchParams({ ...Object.fromEntries(query), source: row.name, detail: "1" })) }));
        if (filtered.totals.without_source) sources.push({ key: "without", values: ["Chưa ghi nguồn", filtered.totals.without_source], action: action("Xem khách chưa ghi nguồn", "new-customers", new URLSearchParams({ ...Object.fromEntries(query), source: "", sourcePresence: "without", detail: "1" })) });
        doc.sections.push(section("sources", "Tổng hợp nguồn khách", sourceFields, sources));
      }
      doc.sections.push(section("customers", "Khách hàng mới", fields, filtered.rows.map(row => ({ key: String(row.customer_id), values: values({ ...row, customer_source: row.customer_source || "Chưa ghi nguồn", store_name: row.store_name || "Chưa có cơ sở", contract_status: CONTRACT_STATUSES.find(option => option.value === row.contract_status)?.label || row.contract_status || "—" }, fields), action: action("Mở hợp đồng đầu tiên", "contract", new URLSearchParams({ id: String(row.order_id) })) })))); doc.canExport = true;
    }
    const sectionPages = reportSectionPages(raw.get('section_pages'));
    const response = sectionPages ? paginateReportSections(doc, sectionPages) : doc;
    checked(isMobileSalesReport(response)); return response;
  });
}
