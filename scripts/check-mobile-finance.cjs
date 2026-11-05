const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { NextRequest } = require("next/server");
const { load, root } = require("./lib/load-typescript.cjs");
const api = load(path.join(root, "lib/server/mobile-finance"));
const domain = load(path.join(root, "lib/server/contract-payments"));
const db = load(path.join(root, "lib/server/himoto-database"));
const recovery = load(path.join(root, "lib/server/mobile-write-recovery"));
const { dataAccess } = load(path.join(root, "lib/server/access-context"));
const wire = load(path.resolve(root, "../shared/mobile-finance"));
const { createApi } = load(path.resolve(root, "../mobile/src/lib/api"));
const original = { read: domain.readPaymentContext, write: domain.recordContractPayment, fetch: global.fetch };
const descriptor = Object.getOwnPropertyDescriptor(db.himotoPool, "connect");
const user = { id: 7, role: "staff", access_role: "accounting", store_id: 23, scope_all: false, permissions: ["contracts.read", "finance.write"] };
const reader = { ...user, permissions: ["contracts.read", "finance.read"] };
const keys = Array.from({ length: 30 }, (_, i) => `${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`);
const checks = [], statements = [], calls = [];
const clone = (v) => structuredClone(v), rows = (r) => ({ rows: r, rowCount: r.length });
const context = () => ({ id: 101, code: "HD-QA-101", status: "renting", store_id: 23, revision: "100", total_amount: 500000, paid_amount: 100000, remaining: 400000,
  deposit_paid: 100000, deposit_refunded: 0, deposit_held: 100000, deposit_remaining: 100000, rental_refundable: 50000,
  company_paid_amount: 0, company_payment_count: 0, end_date: "2026-11-02T08:00:00+07:00", items: [],
  accounts: [{ id: 1, kind: "cash", store_id: 23, owner_type: "", label: "Két QA" }, { id: 1, kind: "bank", store_id: 23, owner_type: "personal", label: "Cá nhân QA" },
    { id: 1, kind: "bank", store_id: 24, owner_type: "company", label: "Công ty QA" }, { id: 2, kind: "bank", store_id: 24, owner_type: "personal", label: "Ngoài phạm vi" }], history: [] });
let state, connects = 0, failCommit = false;
function seed() { state = { context: context(), requests: new Map(), payments: new Map(), writes: 0 }; }
function connect() {
  connects++;
  const scope = clone(dataAccess.getStore());
  assert(scope && scope.operation === "");
  let current;
  return { release() {}, async query(sql, values = []) {
    statements.push({ sql, values: clone(values), scope });
    if (sql.startsWith("BEGIN")) { current = clone(state); return rows([]); }
    if (sql.startsWith("SET ") || sql === "ROLLBACK") return rows([]);
    if (sql === "COMMIT") { if (failCommit) { failCommit = false; throw Error("QA commit failed"); } state = current; return rows([]); }
    if (sql.includes("INSERT INTO himoto.management_mobile_requests")) {
      const key = values[0] + ":" + values[1];
      if (!current.requests.has(key)) current.requests.set(key, { operation: values[2], fingerprint: values[3], resource_id: null, resource_revision: null });
      return rows([]);
    }
    if (sql.includes("UPDATE himoto.management_mobile_requests")) {
      Object.assign(current.requests.get(values[0] + ":" + values[1]), { resource_id: values[2], resource_revision: values[3] }); return rows([]);
    }
    if (sql.includes("FROM himoto.management_mobile_requests")) {
      const key = values[0] + ":" + values[1], row = current.requests.get(key);
      if (!row) return rows([]);
      // PostgreSQL RLS also hides the joined payment after this resource leaves scope.
      const payment = scope.scope_all || scope.store_id === current.context.store_id ? current.payments.get(key) : undefined;
      return rows([{ ...row, transaction_id: payment?.transaction_id }]);
    }
    if (sql.startsWith("SELECT id FROM himoto.orders"))
      return rows(Number(values[0]) === current.context.id && (scope.scope_all || scope.store_id === current.context.store_id) ? [{ id: values[0] }] : []);
    if (sql === "QA READ") {
      if (values[0] !== 101 || (!scope.scope_all && scope.store_id !== current.context.store_id)) throw new domain.ContractPaymentError("Scoped missing", 404);
      const result = clone(current.context), options = values[1];
      if (options) { result.history_total = result.history.length; result.history_pages = options.size ? Math.max(1, Math.ceil(result.history.length / options.size)) : 1;
        result.history_page = Math.min(options.page, result.history_pages); result.history = options.size ? result.history.slice((result.history_page - 1) * options.size, result.history_page * options.size) : []; }
      return rows([result]);
    }
    if (sql === "QA RECORD") {
      const [id, actor, input, options] = values;
      calls.push(clone({ id, actor, input, options }));
      if (input.revision !== current.context.revision) throw new domain.ContractPaymentError("Stale financial revision", 409);
      const qualified = current.context.accounts.find((a) => a.id === input.account_id && (input.method === "cash" ? a.kind === "cash" : a.kind === "bank" && (input.method === "company_transfer" ? a.owner_type === "company" : a.owner_type !== "company")) && (input.method === "company_transfer" || a.store_id === 23));
      if (!qualified) throw new domain.ContractPaymentError("Invalid account", 409);
      const amount = Number(input.amount), c = current.context;
      if (input.purpose === "deposit") { c.deposit_paid += amount; c.deposit_held += amount; c.deposit_remaining -= amount; }
      else if (input.purpose === "deposit_refund") { c.deposit_refunded += amount; c.deposit_held -= amount; }
      else if (input.purpose === "rental_refund") { c.paid_amount -= amount; c.rental_refundable -= amount; }
      else { if (input.purpose === "extra") c.total_amount += amount; else if (c.remaining > 0 && amount > c.remaining) c.total_amount += amount - c.remaining; c.paid_amount += amount; }
      c.remaining = Math.max(c.total_amount - c.paid_amount, 0); c.revision = String(Number(c.revision) + 1);
      const transaction_id = 8001 + current.writes++;
      current.payments.set(actor + ":" + input.request_id, { transaction_id });
      c.history.unshift({ id: transaction_id, type: input.purpose?.endsWith("refund") ? "out" : "in", deposit: ["deposit", "deposit_refund"].includes(input.purpose), amount, paid_at: input.paid_at + ":00+07:00", note: input.note, actor: "QA", method: input.method, account: qualified.label, status: "approved", renewal: null });
      return rows([{ context: clone(c), transaction_id, replayed: false, company_transfer: input.method === "company_transfer" }]);
    }
    throw Error("Unexpected synthetic query: " + sql);
  } };
}
Object.defineProperty(db.himotoPool, "connect", { configurable: true, value: async () => connect() });
domain.readPaymentContext = async (client, id, options) => (await client.query("QA READ", [id, options])).rows[0];
domain.recordContractPayment = async (client, id, actor, input, options) => (await client.query("QA RECORD", [id, actor, input, options])).rows[0];
function request(body, key = keys[0], path = "/contracts/101/payments") {
  return new NextRequest("https://mobile-api.example.invalid/api/mobile/v1" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const input = { revision: "100", expected_total: 500000, expected_remaining: 400000, purpose: "debt", amount: "100000", method: "company_transfer", account_id: 1, paid_at: "2026-10-01T08:00", note: "  Thu QA  " };
const save = (body = input, key = keys[0], actor = user) => api.recordMobilePayment(actor, "101", request(body, key));
async function run() {
  seed();
  const prep = await api.readMobileFinance(user, "101", request(null, null, "/contracts/101/finance?page=1"));
  assert(wire.isMobileFinanceContext(prep));
  assert.equal(prep.canWrite, true); assert.equal(prep.accounts.length, 3);
  assert.equal(prep.accounts.filter((a) => a.id === 1).length, 3);
  assert(!JSON.stringify(prep).includes("owner_type"));
  assert(!JSON.stringify(prep).includes("items"));
  const readonly = await api.readMobileFinance(reader, "101", request(null)); assert.equal(readonly.canWrite, false);
  const before = connects;
  await assert.rejects(save(input, keys[0], reader), (e) => e.status === 403);
  await assert.rejects(api.readMobileFinance({ ...user, permissions: ["contracts.read", "contracts.finalize"] }, "101", request(null)), (e) => e.status === 403);
  await assert.rejects(api.readMobileFinance(user, "101", request(null, null, "/contracts/101/finance?page=1&page=2")), (e) => e.code === "INVALID_PAGE");
  await assert.rejects(save({ ...input, request_id: keys[1] }), (e) => e.code === "INVALID_PAYMENT");
  await assert.rejects(save({ ...input, store_id: 24 }), (e) => e.code === "INVALID_PAYMENT");
  await assert.rejects(save({ ...input, purpose: "renewal" }), (e) => e.code === "INVALID_PAYMENT");
  assert.equal(connects, before);
  checks.push("Scoped financial reads require finance grants; write-only operators can review and read-only operators cannot write; method-qualified accounts preserve colliding IDs and unknown/forged input fails before business DB use");

  const result = await save();
  assert.equal(result.transactionId, 8001); assert.equal(result.id, 101); assert.equal(result.replayed, false);
  assert.equal(calls[0].input.note, "Thu QA"); assert.equal(calls[0].input.purpose, undefined);
  assert.equal(calls[0].options.page, 1); assert.equal(calls[0].options.size, 0); assert(Number.isSafeInteger(calls[0].options.asOf));
  assert.equal((await save()).replayed, true); assert.equal(state.writes, 1);
  await assert.rejects(save({ ...input, amount: "100001" }), (e) => e.code === "REQUEST_KEY_REUSED");
  assert.equal((await api.readMobilePaymentReceipt(user, keys[0])).receipt.transactionId, 8001);
  assert.equal((await api.readMobilePaymentReceipt({ ...user, id: 8 }, keys[0])).receipt, null);
  await assert.rejects(api.readMobilePaymentReceipt({ ...user, store_id: 24 }, keys[0]), (e) => e.status === 403);
  checks.push("The domain payment and mobile receipt commit atomically; lost-response retry writes once, normalizes notes, returns the exact transaction and rechecks actor/current resource visibility");

  seed();
  await assert.rejects(save({ ...input, amount: "500000" }), (e) => e.code === "OVERPAYMENT_ACK_REQUIRED");
  assert.equal(state.writes, 0); assert.equal(state.requests.size, 0);
  await save({ ...input, amount: "500000", acknowledge_overpayment: true });
  assert.equal(state.context.total_amount, 600000); assert.equal(state.context.paid_amount, 600000);
  assert.deepEqual(wire.paymentImpact({ totalAmount: 500000, rentalRemaining: 400000 }, "debt", 500000), { overpayment: true, totalIncrease: 100000, totalAfter: 600000 });
  assert.deepEqual(wire.paymentImpact({ totalAmount: 500000, rentalRemaining: 0 }, "debt", 100000), { overpayment: true, totalIncrease: 0, totalAfter: 500000 });
  checks.push("Over-collection requires explicit acknowledgement and preserves the shared domain total-increase rule; already-paid contracts do not invent a second total increase");

  for (const [index, purpose] of ["deposit", "extra", "deposit_refund", "rental_refund"].entries()) {
    seed(); await save({ ...input, purpose, amount: "10000", method: "cash" }, keys[index + 1]);
    assert.equal(calls.at(-1).input.purpose, purpose); assert.equal(state.writes, 1);
    assert.equal(state.context.history[0].type, purpose.endsWith("refund") ? "out" : "in");
    if (purpose === "extra") assert.equal(state.context.total_amount, 510000);
    if (purpose === "deposit_refund") assert.equal(state.context.deposit_held, 90000);
  }
  seed(); state.context.completed_from_hold = true;
  const held = await api.readMobileFinance(user, "101", request(null));
  assert.deepEqual(held.purposes, ["deposit_refund", "rental_refund"]);
  await assert.rejects(save(), (e) => e.code === "PAYMENT_CONFLICT"); assert.equal(state.writes, 0);
  checks.push("Deposit collection, extra receipts and deposit/rental refunds retain their distinct purposes/directions; completion after hold blocks new debt/fees and retains permitted refunds");

  seed();
  await assert.rejects(save({ ...input, revision: "99" }), (e) => e.code === "PAYMENT_CONFLICT");
  await assert.rejects(save({ ...input, expected_remaining: 300000 }), (e) => e.code === "PAYMENT_CONFLICT");
  assert.equal(state.requests.size, 0); assert.equal(state.writes, 0);
  failCommit = true; await assert.rejects(save(), /commit failed/);
  assert.equal(state.requests.size, 0); assert.equal(state.writes, 0);
  const resolved = await recovery.resolveMobileWrite(user, keys[0], request({ operation: "payment.record:101" }));
  assert.equal(resolved.status, "cancelled");
  await assert.rejects(save(), (e) => e.code === "REQUEST_CANCELLED"); assert.equal(state.writes, 0);
  await assert.rejects(recovery.resolveMobileWrite({ ...user, permissions: ["contracts.read", "contracts.finalize"] }, keys[1], request({ operation: "payment.record:101" })), (e) => e.status === 403);
  seed(); await save();
  assert.equal((await recovery.resolveMobileWrite(user, keys[0], request({ operation: "payment.record:101" }))).status, "committed");
  assert.equal(state.writes, 1);
  checks.push("Revision/domain/commit errors roll back both receipts and money; financial reconciliation requires finance.write, blocks late cancelled requests and returns committed results without collecting twice");

  // Exercise the real shared history read model: aggregate values must not be
  // derived from the visible page. These are synthetic SQL responses, not a DB.
  const readQueries = [];
  let withPlan = false;
  const readDb = { async query(sql, values = []) {
    readQueries.push({ sql, values });
    if (sql.includes("SELECT o.id, COALESCE")) return rows([{ id: 101, code: "HD-QA-101", status: "renting", store_id: 23, revision: "100", total: withPlan ? "1000000" : "100000", rental_paid: withPlan ? "0" : "150000", deposit_amount: "150000", deposit_paid: "100000", deposit_refunded: "20000", draft_payload: { management_composer: { return_adjustments: [{ early_discount: 50000 }], ...(withPlan ? { installment_plan: { version: 1, start: "2026-10-01T08:00", end: "2026-12-01T08:00", interval: "month", amount: 1000000 } } : {}) } }, end_date: null }]);
    if (sql.includes("FROM himoto.banks")) return rows([]);
    if (sql.includes("SELECT count(*) AS total")) return rows([{ total: "40", company_paid: "70000", company_count: "2", rental_refunded: "30000" }]);
    if (sql.includes("SELECT t.id,t.status")) return rows([{ id: 8001, tx_status: "approved", type: "in", name: "order:payment", amount: 10000, paid_at: "2026-10-01T08:00:00+07:00", note: "", actor: "QA", method: "Cash", account: "Cash", cash_id: 1, bank_owner_type: null }]);
    if (sql.includes("SELECT d.id,d.vehicle_id")) return rows([]);
    throw Error("Unexpected read model SQL: " + sql);
  } };
  const paged = await original.read(readDb, 101, { page: 999, size: 25 });
  assert.equal(paged.history_page, 2); assert.equal(paged.history_pages, 2); assert.equal(paged.history_total, 40);
  assert.equal(paged.company_paid_amount, 70000); assert.equal(paged.company_payment_count, 2);
  assert.equal(paged.rental_refundable, 20000); assert.equal(paged.deposit_remaining, 50000);
  assert.deepEqual(readQueries.find((q) => q.sql.includes("SELECT t.id,t.status")).values, [101, 25, 25]);
  readQueries.length = 0;
  const bounded = await original.read(readDb, 101, { page: 1, size: 0 });
  assert.equal(bounded.history.length, 0); assert.equal(bounded.rental_refundable, 20000);
  assert(!readQueries.some((q) => q.sql.includes("SELECT t.id,t.status")));
  const legacy = await original.read(readDb, 101);
  assert.equal(legacy.rental_refundable, 50000); assert.equal(legacy.history_total, undefined);
  await assert.rejects(original.read(readDb, 101, { page: 0, size: 1000 }), /không hợp lệ/);
  withPlan = true;
  const frozen = { page: 1, size: 0, asOf: Date.parse("2026-11-01T07:59:59+07:00") };
  const beforeBoundary = await original.read(readDb, 101, frozen);
  const afterBoundary = await original.read(readDb, 101, { ...frozen, asOf: Date.parse("2026-11-01T08:00:00+07:00") });
  assert.equal(beforeBoundary.total_amount, 1000000); assert.equal(afterBoundary.total_amount, 2000000);
  assert.equal((await original.read(readDb, 101, frozen)).total_amount, beforeBoundary.total_amount);
  checks.push("A changed reviewed balance is rejected even with an unchanged xmin; the shared ownership read model freezes installment accrual at the server clock across a period boundary");
  checks.push("The real shared read model caps history queries, clamps pages, supports summary-only writes and computes company receipts/rental-refund limits across all history; default web reads retain their existing shape");

  const client = createApi("https://mobile-api.example.invalid", "hm1_" + "a".repeat(43));
  for (const bad of [{ ...prep, id: 102 }, { ...prep, history: { ...prep.history, rows: [{ id: 1 }] } }, { ...prep, accounts: [prep.accounts[0], prep.accounts[0]] }]) {
    global.fetch = async () => Response.json(bad);
    await assert.rejects(client.finance("101"), (e) => e.code === "INVALID_RESPONSE");
  }
  global.fetch = async () => Response.json({ id: 101, revision: "100", transactionId: 0, replayed: false });
  await assert.rejects(client.recordPayment("101", input, keys[0]), (e) => e.code === "INVALID_RESPONSE");
  global.fetch = async (url, options) => {
    assert.equal(url, "https://mobile-api.example.invalid/api/mobile/v1/contracts/101/payments");
    assert.equal(options.credentials, "omit"); assert.equal(options.redirect, "error");
    assert.equal(new Headers(options.headers).get("Idempotency-Key"), keys[0]);
    return Response.json({ id: 101, revision: "101", transactionId: 8001, replayed: false });
  };
  assert.equal((await client.recordPayment("101", input, keys[0])).transactionId, 8001);
  checks.push("The financial client rejects wrong contracts, malformed/duplicated history/accounts and invalid transaction acknowledgements; recording is origin-bound and retains the request UUID");

  const report = { passed: checks.length, checks, operationalWrites: 0, domainWrites: "synthetic wrapper; shared domain release suite is separate", completedAt: new Date().toISOString() };
  fs.mkdirSync(path.resolve(root, "../.backups"), { recursive: true });
  fs.writeFileSync(path.resolve(root, "../.backups/mobile-finance-api-results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  domain.readPaymentContext = original.read; domain.recordContractPayment = original.write; global.fetch = original.fetch;
  if (descriptor) Object.defineProperty(db.himotoPool, "connect", descriptor); else delete db.himotoPool.connect;
});
