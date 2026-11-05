const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { NextRequest } = require("next/server");
const { load, root } = require("./lib/load-typescript.cjs");
const api = load(path.join(root, "lib/server/mobile-contracts"));
const db = load(path.join(root, "lib/server/himoto-database"));
const finalize = load(path.join(root, "lib/server/contract-finalize"));
const handover = load(path.join(root, "lib/server/contract-handover"));
const payments = load(path.join(root, "lib/server/contract-payments"));
const notifications = load(
  path.join(root, "lib/server/contract-notifications"),
);
const { dataAccess } = load(path.join(root, "lib/server/access-context"));
const wire = load(path.resolve(root, "../shared/mobile-contract-validation"));
const form = load(path.resolve(root, "../shared/mobile-draft-validation"));
const template = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/mobile-draft.json"), "utf8"),
);
const clone = (v) => structuredClone(v),
  checks = [],
  statements = [];
const user = {
  id: 7,
  name: "QA",
  role: "staff",
  access_role: "branch_staff",
  store_id: 23,
  scope_all: false,
  permissions: ["contracts.read", "contracts.finalize"],
};
const manager = { ...user, access_role: "branch_manager" };
const keys = Array.from(
  { length: 8 },
  (_, i) => `0000000${i}-0000-4000-8000-000000000000`,
);
let state = { orders: new Map(), receipts: new Map(), collections: 0 },
  connects = 0,
  calls = 0;
const descriptor = Object.getOwnPropertyDescriptor(db.himotoPool, "connect");
const original = {
  finalize: finalize.finalizeContractDraft,
  handover: handover.handoverReservation,
  context: payments.readPaymentContext,
  queue: notifications.queueContractNotification,
};
const originalFetch = global.fetch;
function seed(id = 100, rentalType = "daily") {
  const input = clone(template),
    d = input.draft;
  Object.assign(d, {
    customer_id: 1,
    store_id: "23",
    vehicle_store_id: "23",
    total_amount: "1000000",
    unit_price: "500000",
  });
  Object.assign(d.customer, {
    name: "QA Customer",
    phone: "0901122334",
    customer_type: "vietnam",
  });
  Object.assign(d.vehicles[0], {
    id: "301",
    name: "QA Vehicle",
    license: "QA-301",
    rent_at: d.start_date,
    return_at: d.end_date,
  });
  const row = {
    id,
    order_status: "draft",
    store_id: 23,
    customer_id: 1,
    order_type: rentalType,
    contract_number: "",
    draft_reference: "NHAP-" + id,
    revision: "100",
    draft_payload: {
      management_composer: { ...input, rental_type: rentalType },
    },
  };
  state.orders.set(id, row);
  return row;
}
function connection() {
  connects++;
  const scope = clone(dataAccess.getStore());
  let current;
  const rows = (v) => ({ rows: v, rowCount: v.length });
  const client = {
    release() {},
    async query(sql, values = []) {
      statements.push({ sql, values: clone(values), scope });
      if (/^BEGIN/.test(sql)) {
        current = clone(state);
        return rows([]);
      }
      if (/^COMMIT/.test(sql)) {
        state = current;
        return rows([]);
      }
      if (/^ROLLBACK|^SET /.test(sql)) return rows([]);
      if (sql.includes("INSERT INTO himoto.management_mobile_requests")) {
        const key = values[0] + ":" + values[1];
        if (!current.receipts.has(key))
          current.receipts.set(key, {
            operation: values[2],
            fingerprint: values[3],
            resource_id: null,
          });
        return rows([]);
      }
      if (sql.includes("UPDATE himoto.management_mobile_requests")) {
        Object.assign(current.receipts.get(values[0] + ":" + values[1]), {
          resource_id: values[2],
          resource_revision: values[3],
        });
        return rows([]);
      }
      if (sql.includes("FROM himoto.management_mobile_requests")) {
        const row = current.receipts.get(values[0] + ":" + values[1]);
        return rows(row ? [row] : []);
      }
      if (sql.includes("FROM himoto.orders WHERE id=")) {
        const row = current.orders.get(Number(values[0]));
        return rows(
          row && (scope.scope_all || row.store_id === scope.store_id)
            ? [clone(row)]
            : [],
        );
      }
      if (sql.includes("FROM himoto.store_directory"))
        return rows([
          { id: 23, store_name: "QA" },
          { id: 24, store_name: "Other" },
        ]);
      if (sql.includes("FROM himoto.vehicle_inventory"))
        return rows(
          values[0]
            .filter((id) => id === 301)
            .map((id) => ({ id, status: "ready" })),
        );
      if (sql === "QA CONTEXT") {
        const order = current.orders.get(values[0]);
        return rows([
          {
            id: order.id,
            code: order.contract_number || order.draft_reference,
            status: order.order_status,
            revision: order.revision,
            paid_amount: 0,
            deposit_paid: 0,
            accounts: [
              {
                id: 1,
                kind: "bank",
                owner_type: "personal",
                label: "Private QA",
              },
              { id: 1, kind: "cash", owner_type: "", label: "Cash QA" },
              {
                id: 1,
                kind: "bank",
                owner_type: "company",
                label: "Company QA",
              },
            ],
            history: [{ note: "never expose" }],
          },
        ]);
      }
      if (sql === "QA ACTION") {
        const [id, action, input] = values,
          order = current.orders.get(id);
        if (action === "finalize") {
          if (order.order_status !== "draft")
            throw new finalize.ContractFinalizeError("Already issued", 409);
          if (input.receipts.some((row) => row.account_id !== 1))
            throw new finalize.ContractFinalizeError("Invalid account", 400);
          if (input.acknowledge_reservation_overlap !== true && order.overlap)
            throw new finalize.ContractFinalizeError(
              "Reservation overlap",
              409,
              "reservation_overlap",
            );
          order.order_status = input.reservation
            ? "deposit_contract"
            : "renting";
          current.collections += input.receipts.length;
          order.contract_number = "QA-ISSUED-" + id;
          order.draft_payload.management_composer.finalized = {
            contract_number: order.contract_number,
          };
          if (input.reservation)
            order.draft_payload.management_composer.reservation = {
              at: "2026-11-01",
            };
        } else {
          if (order.order_status !== "deposit_contract")
            throw new finalize.ContractFinalizeError(
              "Already handed over",
              409,
            );
          order.order_status = "renting";
          order.draft_payload.management_composer.handover = {
            actor_id: scope.id,
          };
        }
        order.revision = String(Number(order.revision) + 1);
        return rows([]);
      }
      throw Error("Unexpected fixture SQL: " + sql.slice(0, 90));
    },
  };
  return client;
}
Object.defineProperty(db.himotoPool, "connect", {
  configurable: true,
  value: async () => connection(),
});
finalize.finalizeContractDraft = async (client, id, actor, input) => {
  calls++;
  assert.equal(actor, user.id);
  await client.query("QA ACTION", [id, "finalize", input]);
  return {};
};
handover.handoverReservation = async (client, id, actor, revision) => {
  calls++;
  assert.equal(actor, user.id);
  await client.query("QA ACTION", [id, "handover", { revision }]);
  return {};
};
payments.readPaymentContext = async (client, id) =>
  (await client.query("QA CONTEXT", [id])).rows[0];
const queued = [];
notifications.queueContractNotification = async (...args) => {
  queued.push(args.slice(1));
};
const request = (body, key = keys[0]) =>
  new NextRequest(
    "https://qa.example.invalid/api/mobile/v1/contracts/100/finalize",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(body),
    },
  );
const input = {
  revision: "100",
  receipts: [
    {
      purpose: "rental",
      amount: "200000",
      method: "company_transfer",
      account_id: 1,
      paid_at: "2026-10-01T08:00",
    },
  ],
};
async function run() {
  seed();
  const prep = await api.readMobileContractPreparation(user, 100);
  assert(wire.isMobileContractPreparation(prep));
  assert.equal(prep.canFinalize, true);
  assert.deepEqual(prep.issues.rental, {});
  assert.deepEqual(
    prep.accounts.map((row) => row.method),
    ["transfer", "cash", "company_transfer"],
  );
  assert(!JSON.stringify(prep).includes("never expose"));
  assert(
    !wire.isMobileContractPreparation({
      ...prep,
      accounts: [{ ...prep.accounts[0], method: "unknown" }],
    }),
  );
  assert(!wire.isMobileContractPreparation({ ...prep, revision: "0" }));
  const n = connects;
  await assert.rejects(
    api.readMobileContractPreparation(
      { ...user, permissions: ["contracts.read"] },
      100,
    ),
    (e) => e.status === 403,
  );
  assert.equal(connects, n);
  checks.push(
    "A finalize-only operator can review a scoped draft and method-qualified accounts without receiving payment history; missing grants fail before DB use",
  );
  const row = state.orders.get(100),
    d = row.draft_payload.management_composer.draft;
  state.orders.get(100).customer_id = 2;
  await assert.rejects(
    api.readMobileContractPreparation(user, 100),
    (error) => error.code === "DATA_REVIEW_REQUIRED",
  );
  await assert.rejects(
    api.writeMobileContractAction(user, request(input), 100, "finalize"),
    (error) => error.code === "DATA_REVIEW_REQUIRED",
  );
  assert.equal(state.receipts.size, 0);
  state.orders.get(100).customer_id = 1;
  d.vehicles[0].return_at = "2026-12-01T08:00";
  assert.equal(
    (
      await api.readMobileContractPreparation(user, 100)
    ).issues.rental.vehicle_times.includes("thời gian"),
    true,
  );
  const before = calls;
  await assert.rejects(
    api.writeMobileContractAction(user, request(input), 100, "finalize"),
    (e) => e.code === "DRAFT_INCOMPLETE",
  );
  assert.equal(calls, before);
  assert.equal(state.receipts.size, 0);
  const old = clone(d);
  state.orders.get(100).draft_payload.management_composer.draft =
    form.alignDraftWindow(d);
  assert.equal(old.vehicles[0].return_at, "2026-12-01T08:00");
  assert.deepEqual(
    {
      ...form.alignDraftWindow(d).vehicles[0],
      rent_at: old.vehicles[0].rent_at,
      return_at: old.vehicles[0].return_at,
    },
    old.vehicles[0],
  );
  checks.push(
    "Mismatched legacy line windows block mobile issuance until explicit alignment; alignment changes only line times and preserves the source snapshot",
  );
  const ack = await api.writeMobileContractAction(
    user,
    request(input),
    100,
    "finalize",
  );
  assert.equal(ack.revision, "101");
  assert.equal(state.collections, 1);
  assert.equal(
    (await api.writeMobileContractAction(user, request(input), 100, "finalize"))
      .replayed,
    true,
  );
  assert.equal(state.collections, 1);
  await assert.rejects(
    api.writeMobileContractAction(
      user,
      request({ ...input, receipts: [] }),
      100,
      "finalize",
    ),
    (e) => e.code === "REQUEST_KEY_REUSED",
  );
  assert.equal(state.collections, 1);
  const receipt = await api.readMobileContractReceipt(user, keys[0]);
  assert.equal(receipt.receipt.id, 100);
  assert.equal(
    (await api.readMobileContractReceipt({ ...user, id: 8 }, keys[0])).receipt,
    null,
  );
  state.orders.get(100).store_id = 24;
  await assert.rejects(
    api.readMobileContractReceipt(user, keys[0]),
    (e) => e.status === 404,
  );
  await assert.rejects(
    api.writeMobileContractAction(user, request(input), 100, "finalize"),
    (e) => e.status === 404,
  );
  state.orders.get(100).store_id = 23;
  checks.push(
    "Issued money and the mobile receipt commit together; lost-response replay writes once and receipt/replay reads recheck actor and current branch visibility",
  );
  seed(101, "ownership");
  state.orders.get(101).draft_payload.management_composer.rental_type = "daily";
  await assert.rejects(
    api.writeMobileContractAction(
      user,
      request(input, keys[1]),
      101,
      "finalize",
    ),
    (e) => e.status === 403,
  );
  assert.equal(
    (await api.readMobileContractPreparation(user, 101)).canFinalize,
    false,
  );
  await api.writeMobileContractAction(
    manager,
    request(input, keys[1]),
    101,
    "finalize",
  );
  checks.push(
    "Ownership approval uses the existing role policy even with explicit finalize grants; an authorized branch manager can approve",
  );
  seed(102);
  const currentCalls = calls;
  await assert.rejects(
    api.writeMobileContractAction(
      user,
      request({ ...input, revision: "99" }, keys[2]),
      102,
      "finalize",
    ),
    (e) => e.code === "CONTRACT_CHANGED",
  );
  await assert.rejects(
    api.writeMobileContractAction(
      user,
      request(
        { ...input, receipts: [{ ...input.receipts[0], account_id: 999 }] },
        keys[2],
      ),
      102,
      "finalize",
    ),
    (e) => e.status === 400,
  );
  assert.equal(state.orders.get(102).order_status, "draft");
  assert(!state.receipts.has("7:" + keys[2]));
  assert.equal(calls, currentCalls + 1);
  const existing = connects;
  await assert.rejects(
    api.writeMobileContractAction(
      user,
      request({
        ...input,
        receipts: [{ ...input.receipts[0], paid_at: "0000-01-01T00:00" }],
      }),
      102,
      "finalize",
    ),
    (e) => e.status === 400,
  );
  assert.equal(connects, existing);
  checks.push(
    "Stale revisions and domain failures leave no committed receipt or money; malformed bodies are rejected before acquiring a business connection",
  );
  seed(103);
  state.orders.get(103).overlap = true;
  await assert.rejects(
    api.writeMobileContractAction(
      user,
      request(input, keys[3]),
      103,
      "finalize",
    ),
    (e) => e.code === "reservation_overlap",
  );
  await api.writeMobileContractAction(
    user,
    request(
      { ...input, reservation: true, acknowledge_reservation_overlap: true },
      keys[3],
    ),
    103,
    "finalize",
  );
  const paid = state.collections;
  await api.writeMobileContractAction(
    user,
    request({ revision: "101" }, keys[4]),
    103,
    "handover",
  );
  assert.equal(
    (
      await api.writeMobileContractAction(
        user,
        request({ revision: "101" }, keys[4]),
        103,
        "handover",
      )
    ).replayed,
    true,
  );
  assert.equal(state.collections, paid);
  checks.push(
    "Overlap acknowledgement is explicit; reservation and handover use the shared services, and handover retries never collect the advance again",
  );
  await api.queueMobileContractEvent(user, 103, "finalize");
  await api.queueMobileContractEvent(user, 103, "handover");
  assert.deepEqual(
    queued.map((row) => [row[1], row[2]]),
    [
      ["reservation", "finalize:103:QA-ISSUED-103"],
      ["handover", "handover:103"],
    ],
  );
  notifications.queueContractNotification = async () => {
    throw Error("fixture queue unavailable");
  };
  const savedState = clone(state);
  await api.queueMobileContractEvent(user, 103, "handover");
  assert.deepEqual(state, savedState);
  assert(
    statements.every(
      (row) => row.scope.scope_all === false && row.scope.operation === "",
    ),
  );
  checks.push(
    "Manual notification outbox work runs separately with deterministic event keys; its failure cannot roll back an issued contract or broaden scope",
  );
  const clientModule = load(path.resolve(root, "../mobile/src/lib/api"));
  const client = clientModule.createApi(
    "https://qa.example.invalid",
    "hm1_" + "a".repeat(43),
  );
  global.fetch = async () => Response.json({ ...prep, id: 101 });
  await assert.rejects(
    client.contractPreparation("100"),
    (error) => error.code === "INVALID_RESPONSE",
  );
  global.fetch = async () =>
    Response.json({ id: 101, revision: "101", replayed: false });
  await assert.rejects(
    client.contractAction("100", "finalize", input, keys[0]),
    (error) => error.code === "INVALID_RESPONSE",
  );
  global.fetch = async (_url, options) => {
    assert.equal(options.credentials, "omit");
    assert.equal(new Headers(options.headers).get("Idempotency-Key"), keys[0]);
    return Response.json({ id: 100, revision: "101", replayed: false });
  };
  assert.equal(
    (await client.contractAction("100", "finalize", input, keys[0])).id,
    100,
  );
  checks.push(
    "Financial client decoding rejects another contract's preparation/acknowledgement and sends an origin-bound bearer request with its original idempotency key",
  );
  const result = {
    passed: checks.length,
    checks,
    operationalWrites: 0,
    domainWrites:
      "stubbed; shared business suites verify the domain separately",
  };
  fs.mkdirSync(path.resolve(root, "../.backups"), { recursive: true });
  fs.writeFileSync(
    path.resolve(root, "../.backups/mobile-contract-actions-results.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
}
run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch = originalFetch;
    Object.defineProperty(db.himotoPool, "connect", descriptor);
    finalize.finalizeContractDraft = original.finalize;
    handover.handoverReservation = original.handover;
    payments.readPaymentContext = original.context;
    notifications.queueContractNotification = original.queue;
  });
