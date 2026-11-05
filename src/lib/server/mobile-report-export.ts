import "server-only";
import type { SessionUser } from "./management-session";
import { reportQuery, withMobileReportData } from "./mobile-reports";
import { isSalesReportKind } from "../../../shared/mobile-reports";
import type { MobileFileExport } from "../../../shared/mobile-export";
import { MobileError } from "./mobile-session";
import { vehicleRevenue, rentalOverview } from "./rental-reports";
import { revenueLedger } from "./revenue-ledger";
import { readSalesSummary } from "./page-summaries";
import { staffSales } from "./staff-sales";
import { newCustomersBySource } from "./new-customers-by-source";
import { filterNewCustomersBySource } from "@/lib/management/new-customers-by-source";
import { CONTRACT_STATUSES } from "@/lib/management/config";
import { csvCell } from "@/lib/management/table-utils";
import { buildRevenueLedgerWorkbook } from "@/lib/management/revenue-ledger-workbook";
import { validRevenueLedger } from "@/lib/management/revenue-ledger";
import { validRentalReport, type VehicleRevenueRow } from "@/lib/management/rental-reports";

export async function exportMobileSalesReport(user: SessionUser, rawKind: string, raw: URLSearchParams): Promise<MobileFileExport> {
  if (!isSalesReportKind(rawKind)) throw new MobileError("Báo cáo không tồn tại.", 404);
  const kind = rawKind, query = reportQuery(kind, raw), from = query.get("from")!, to = query.get("to")!, store = query.has("store_id") ? Number(query.get("store_id")) : undefined;
  if (["actual", "fleet", "contracts"].includes(kind) || query.has("vehicle_id") || kind === "overview" && query.has("detail")) throw new MobileError("Mục báo cáo này không có chức năng xuất file.");
  if (kind === "ledger") {
    const { income, expense } = await withMobileReportData(user, kind, async client => {
      const scope = new URLSearchParams(query); scope.set("all", "1"); scope.set("page", "1");
      scope.set("side", "in"); const income = await revenueLedger(client, scope);
      scope.set("side", "out"); const expense = await revenueLedger(client, scope);
      if (!validRevenueLedger(income) || !validRevenueLedger(expense)) throw new MobileError("Tổng phiếu chưa khớp để xuất file.", 503);
      return { income, expense };
    });
    const bytes = await buildRevenueLedgerWorkbook(from, to, income, expense);
    return { filename: `HIMOTO-so-thu-chi-${from}-${to}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", contentBase64: Buffer.from(new Uint8Array(bytes)).toString("base64"), rowCount: income.total + expense.total };
  }
  const output = await withMobileReportData(user, kind, async client => {
    let lines: (string | number)[][], count: number, name: string;
    if (kind === "vehicles") {
      const all = new URLSearchParams(query); all.set("mode", "all");
      const report = await vehicleRevenue(client, all);
      if (Array.isArray(report) || !validRentalReport("vehicle-revenue", report, all)) throw new MobileError("Số liệu xe chưa khớp để xuất file.", 503);
      lines = [["Tên xe", "Biển số", "Cơ sở hiện tại", "Lượt thuê", "Phí thuê", "Gia hạn", "Điều chỉnh muộn / sớm", "Doanh thu"], ...report.rows.map((row: VehicleRevenueRow) => [row.name, row.license, row.store_name, row.rentals, row.rental, row.renewal, row.adjustment, row.revenue]), ["Tổng", "", "", report.rentals, report.rental, report.renewal, report.adjustment, report.revenue]];
      count = report.total; name = "doanh-thu-tung-xe";
    } else if (kind === "overview") {
      const report = await rentalOverview(client, query);
      if (!validRentalReport("rental-overview", report, query)) throw new MobileError("Số liệu cơ sở chưa khớp để xuất file.", 503);
      const columns = ["deposit_income", "renewal_income", "rental_income", "late_fee_income", "deposit_refund_expense", "rental_refund_expense"] as const;
      lines = [[query.get("view") === "days" ? "Ngày" : "Cơ sở", "Doanh thu thuê xe", "Tổng thu thực tế", "Tổng chi thực tế", "Thu cọc", "Thu gia hạn", "Thu phí thuê", "Thu trả muộn", "Trả cọc", "Hoàn trả sớm"], ...[...report.rows, report.total].map(row => [row.name, row.revenue, row.income, row.expense, ...columns.map(key => row.breakdown[key])])];
      count = report.rows.length; name = `bao-cao-theo-co-so-${query.get("view") || "stores"}`;
    } else if (kind === "by-staff" || kind === "by-store") {
      const summary = await readSalesSummary(client, new URLSearchParams({ from, to, store: String(store || "all") })), data = kind === "by-staff" ? summary.sources : summary.stores;
      lines = [[kind === "by-staff" ? "NVKD ghi nhận doanh số" : "Cơ sở (Nguồn / doanh thu)", "Hợp đồng", "Khách", "Tiền thuê", "Đã thu tiền thuê", "Tiền cọc"], ...data.rows.map(row => [row.name, row.contracts, row.customers, row.rent, row.paid, row.deposit]), ["Tổng", data.total.contracts, data.total.customers, data.total.rent, data.total.paid, data.total.deposit]];
      count = data.rows.length; name = kind === "by-staff" ? "doanh-so-nvkd" : "doanh-thu-co-so";
    } else if (kind === "assigned") {
      const data = await staffSales(client, from, to, store), rows = data.rows.filter(row => !query.get("department") || row.department === query.get("department"));
      lines = [["Nhân viên", "Bộ phận", "Cách tính", "Hợp đồng", "Khách", "Khách mới", "Doanh số"], ...rows.map(row => [row.name, row.department, row.department === "NVKD" ? "Tiền thuê thực thu, gồm gia hạn" : "Tiền thuê HĐ mở mới đầu tiên", row.contracts, row.customers, row.new_customers, row.revenue])];
      count = rows.length; name = "doanh-so";
    } else if (kind === "new-customers") {
      const data = await newCustomersBySource(client, from, to, store), filtered = filterNewCustomersBySource(data, { search: query.get("search") || "", source: query.get("source") || "", sourcePresence: (query.get("sourcePresence") || "") as "" | "with" | "without" });
      lines = [["Khách hàng", "Điện thoại", "CCCD", "Nguồn khách", "Cơ sở nguồn / doanh thu", "Ngày thuê lần đầu", "Mã HĐ đầu", "Trạng thái HĐ"], ...filtered.rows.map(row => [row.customer_name, row.phone, row.id_card, row.customer_source || "Chưa ghi nguồn", row.store_name || "Chưa có cơ sở", row.started_on, row.contract_code, CONTRACT_STATUSES.find(option => option.value === row.contract_status)?.label || row.contract_status || "—"])];
      count = filtered.rows.length; name = "khach-moi-nguon";
    } else throw new MobileError("Mục báo cáo này không hỗ trợ xuất CSV.");
    return { lines, count, name };
  });
  return { filename: `himoto-${output.name}-${from}-${to}.csv`, mimeType: "text/csv", content: "\uFEFF" + output.lines.map(row => row.map(value => csvCell(String(value))).join(",")).join("\r\n"), rowCount: output.count };
}
