const assert = require("node:assert/strict");
const path = require("node:path");
const { NextRequest } = require("next/server");
const { load, root } = require("./lib/load-typescript.cjs");
const db = load(path.join(root, "lib/server/himoto-database"));
const domain = load(path.join(root, "lib/server/contract-drafts"));
const api = load(path.join(root, "lib/server/mobile-drafts"));
const lookups = load(path.join(root, "lib/server/mobile-draft-lookups"));
const shape = load(path.join(root, "lib/server/mobile-draft-shape"));
const wire = load(path.resolve(root, "../shared/mobile-draft-validation"));
const { dataAccess } = load(path.join(root, "lib/server/access-context"));
const user = {
  id: 7,
  name: "QA",
  email: "qa@example.invalid",
  role: "staff",
  access_role: "branch_staff",
  store_id: 23,
  scope_all: false,
  permissions: [
    "contracts.read",
    "contracts.draft",
    "customers.read",
    "vehicles.read",
  ],
};
const keys = [
  "8e1802d7-70b9-45b4-b93c-23c17cba3ed1",
  "8e1802d7-70b9-45b4-b93c-23c17cba3ed2",
  "8e1802d7-70b9-45b4-b93c-23c17cba3ed3",
];
const request = (body, key = keys[0]) =>
  new NextRequest("https://qa.example.invalid/api/mobile/v1/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
const clone = (value) => structuredClone(value);
const checks = [],
  records = new Map(),
  receipts = new Map(),
  statements = [];
let connects = 0,
  ownerConnects = 0,
  saves = 0;
const originalSave = domain.saveDatabaseDraft;
const originalScoped = Object.getOwnPropertyDescriptor(
  db.himotoPool,
  "connect",
);
const originalOwner = Object.getOwnPropertyDescriptor(
  db.ownerDatabase,
  "connect",
);
const customerRow = {
  id: 91,
  name: "QA customer",
  phone: "0900000000",
  address: "QA",
  id_card: "001234567890",
  customer_type: "vietnam",
  store_id: 24,
  store_name: "Other QA",
  status: "active",
  relatives: [],
  private_token: "never expose",
};

function connect(owner = false) {
  if (owner) ownerConnects++;
  else connects++;
  const scope = clone(dataAccess.getStore() || {});
  let pending;
  return {
    release() {},
    async query(sql, values = []) {
      statements.push({ sql, values: clone(values), scope, owner });
      if (/^BEGIN/.test(sql)) {
        pending = clone(receipts);
        return { rows: [], rowCount: 0 };
      }
      if (/^COMMIT/.test(sql)) {
        if (!owner) {
          receipts.clear();
          for (const [key, value] of pending) receipts.set(key, value);
        }
        return { rows: [], rowCount: 0 };
      }
      if (/^ROLLBACK|^SET /.test(sql)) return { rows: [], rowCount: 0 };
      const rows = (data) => ({ rows: data, rowCount: data.length });
      if (sql.includes("INSERT INTO himoto.management_mobile_requests")) {
        const key = values[0] + ":" + values[1];
        if (!pending.has(key))
          pending.set(key, {
            operation: values[2],
            fingerprint: values[3],
            resource_id: null,
          });
        return rows([]);
      }
      if (sql.includes("UPDATE himoto.management_mobile_requests")) {
        Object.assign(pending.get(values[0] + ":" + values[1]), {
          resource_id: values[2],
          resource_revision: values[3],
        });
        return rows([]);
      }
      if (sql.includes("FROM himoto.management_mobile_requests")) {
        const receipt = (pending || receipts).get(values[0] + ":" + values[1]);
        return rows(receipt ? [receipt] : []);
      }
      if (sql.includes("FROM himoto.management_contract_types"))
        return rows([
          {
            id: "daily",
            label: "Ngày",
            rental_type: "daily",
            term_months: null,
            active: true,
          },
          {
            id: "ownership",
            label: "Sở hữu",
            rental_type: "ownership",
            term_months: null,
            active: true,
          },
          {
            id: "monthly_3",
            label: "Cũ",
            rental_type: "monthly_3",
            term_months: 3,
            active: false,
          },
        ]);
      if (sql.includes("FROM himoto.store_directory"))
        return rows([
          { id: 23, store_name: "QA" },
          { id: 24, store_name: "Other QA" },
        ]);
      if (sql.includes("FROM himoto.stores WHERE status"))
        return rows([{ id: 23, store_name: "QA" }]);
      if (sql.includes("FROM himoto.customers c"))
        return rows(owner ? [customerRow] : []);
      if (sql.includes("FROM himoto.staff_profiles")) return rows([{id:501,full_name:"QA staff",position:"NVKD / TLS",store_id:24,phone:"never expose"}]);
      if (sql.includes("FROM himoto.vehicle_inventory() stock"))
        return rows(
          Array.from({ length: 21 }, (_, i) => ({
            id: 301 + i,
            name: "Xe QA",
            license: "QA-" + i,
            type: "xeso",
            status: "ready",
            store_id: 24,
            store_name: "Other QA",
            brand: "QA",
            color: "Đỏ",
            year: 2026,
            gps: "never expose",
          })),
        );
      if (sql.includes("SELECT id,status FROM himoto.vehicle_inventory"))
        return rows(values[0].map((id) => ({ id, status: "ready" })));
      if (sql.includes("CROSS JOIN LATERAL himoto.vehicle_window_conflicts"))
        return rows(
          Array.from({ length: 25 }, (_, i) => ({
            vehicle_id: 301,
            code: "Other-" + i,
            store_name: "Other QA",
            status: i === 24 ? "renting" : "deposit_contract",
            severity: i === 24 ? "hard" : "reservation_overlap",
            rent_at: "2026-11-01T00:00:00Z",
            return_at: "2026-11-03T00:00:00Z",
            manager_name: "never expose",
          })),
        );
      if (sql.includes("CROSS JOIN LATERAL jsonb_array_elements"))
        return rows(
          Array.from({ length: 26 }, (_, i) => ({
            vehicle_id: 301,
            order_id: 200 + i,
            code: "Draft-" + i,
            store_name: "QA",
            customer: "never expose",
            rent_at: "2026-11-01T08:00",
            return_at: "2026-11-02T08:00",
          })),
        );
      if (sql.startsWith("SELECT id FROM himoto.orders"))
        return rows(
          records.get(Number(values[0]))?.store_id === scope.store_id
            ? [{ id: Number(values[0]) }]
            : [],
        );
      if (sql.includes("FROM himoto.orders o")) {
        const row = records.get(Number(values[0]));
        return rows(row && row.store_id === scope.store_id ? [clone(row)] : []);
      }
      throw Error("Unexpected fixture SQL: " + sql.slice(0, 100));
    },
  };
}
Object.defineProperty(db.himotoPool, "connect", {
  configurable: true,
  value: async () => connect(),
});
Object.defineProperty(db.ownerDatabase, "connect", {
  configurable: true,
  value: async () => connect(true),
});
domain.saveDatabaseDraft = async (_client, id, input) => {
  saves++;
  const current = id === null ? null : records.get(id);
  if (id !== null && current?.draft_revision !== input.revision)
    throw new domain.DraftSaveError("Đã thay đổi", 409);
  id ??= 100;
  const version = String(current ? Number(current.draft_revision) + 1 : 100);
  const saved = {
    ...clone(input),
    draft: { ...clone(input.draft), paid_amount: "0" },
  };
  const row = {
    id,
    status: "draft",
    draft_revision: version,
    draft_reference: "NHAP-" + id,
    store_id: 23,
    store_name: "QA",
    rental_type: input.rental_type,
    notes: input.notes,
    draft_payload: { management_composer: saved },
    vehicles: [],
    created_at: "2026-11-01T00:00:00Z",
  };
  records.set(id, row);
  return row;
};

async function run() {
  const options = await api.readMobileDraftOptions(user);
  const directory=await lookups.readMobileDraftStaff(user);
  assert(wire.isMobileDraftStaff(directory));
  assert.deepEqual(directory.rows[0].roles,["representative","sales","telesales"]);
  assert(!JSON.stringify(directory).includes("phone"));
  const ownerBefore=ownerConnects;
  await assert.rejects(()=>lookups.readMobileDraftStaff({...user,permissions:["contracts.read"]}),e=>e.status===403);
  assert.equal(ownerConnects,ownerBefore);
  ownerConnects=0;
  checks.push("The staff directory requires drafting grants and exposes active attribution names/roles without HR contact fields");
  assert(wire.isMobileDraftOptions(options));
  assert.equal(options.initial.draft.staff_name, "QA");
  assert.deepEqual(
    options.stores.map((row) => row.id),
    [23],
  );
  assert.deepEqual(
    options.vehicleStores.map((row) => row.id),
    [23, 24],
  );
  assert(options.types.some((row) => row.id === "ownership"));
  assert.equal(
    options.types.find((row) => row.id === "monthly_3").active,
    false,
  );
  const input = clone(options.initial);
  assert.equal(shape.localRentalTime("2026-02-31T08:00"), false);
  assert.equal(shape.localRentalTime("2026-11-01T08:00"), true);
  assert.throws(
    () =>
      shape.parseMobileDraft({
        ...input,
        draft: { ...input.draft, start_date: "2026-02-31T08:00" },
      }),
    (e) => e.code === "INVALID_DRAFT",
  );
  for (const bad of [
    { ...input, arbitrary: true },
    { ...input, status: "renting" },
    { ...input, draft: { ...input.draft, collections: [] } },
    {
      ...input,
      draft: {
        ...input.draft,
        customer: { ...input.draft.customer, private_url: "x" },
      },
    },
  ])
    assert.throws(() => shape.parseMobileDraft(bad));
  checks.push(
    "Draft options retain scoped revenue stores, shared stock stores and all configured contract types; invalid dates, schema injection and forged receipts are rejected",
  );

  const before = connects;
  await assert.rejects(
    () =>
      api.writeMobileDraft(
        { ...user, permissions: ["contracts.read"] },
        request(input),
        null,
      ),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () =>
      api.writeMobileDraft(
        user,
        request({ ...input, draft: { ...input.draft, store_id: "24" } }),
        null,
      ),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => api.writeMobileDraft(user, request(input, "bad"), null),
    (e) => e.code === "INVALID_REQUEST_KEY",
  );
  await assert.rejects(
    () => api.writeMobileDraft(user, request(input), 100),
    (e) => e.code === "REVISION_REQUIRED",
  );
  assert.equal(connects, before);
  assert.equal(saves, 0);
  const first = await api.writeMobileDraft(user, request(input), null);
  const retry = await api.writeMobileDraft(user, request(input), null);
  assert.deepEqual(first, { id: 100, revision: "100", replayed: false });
  assert.equal(retry.replayed, true);
  assert.equal(saves, 1);
  await assert.rejects(
    () =>
      api.writeMobileDraft(
        user,
        request({ ...input, notes: "different" }),
        null,
      ),
    (e) => e.code === "REQUEST_KEY_REUSED",
  );
  assert.equal(saves, 1);
  const delegatedSave = domain.saveDatabaseDraft;
  try {
    domain.saveDatabaseDraft = async () => ({ id: 100, draft_revision: null });
    await assert.rejects(
      () => api.writeMobileDraft(user, request(input, keys[2]), null),
      (e) => e.code === "INVALID_WRITE_RECEIPT",
    );
    assert(!receipts.has("7:" + keys[2]));
  } finally {
    domain.saveDatabaseDraft = delegatedSave;
  }
  checks.push(
    "Permissions, branch binding and revisions fail before DB use; lost-response retries save once and invalid acknowledgements roll back",
  );

  const profile = await api.readMobileDraft(user, 100);
  records.get(100).store_id = 24;
  await assert.rejects(
    () => api.writeMobileDraft(user, request(input), null),
    (e) => e.status === 403,
  );
  records.get(100).store_id = 23;
  assert(wire.isMobileDraftProfile(profile));
  const edited = { ...profile.input, notes: "Updated", revision: "99" };
  await assert.rejects(
    () => api.writeMobileDraft(user, request(edited, keys[1]), 100),
    (e) => e.status === 409 && e.code === "DRAFT_CONFLICT",
  );
  assert(!receipts.has("7:" + keys[1]));
  edited.revision = "100";
  const updated = await api.writeMobileDraft(
    user,
    request(edited, keys[1]),
    100,
  );
  assert.equal(updated.revision, "101");
  const after = saves;
  await api.writeMobileDraft(user, request(edited, keys[1]), 100);
  assert.equal(saves, after);
  assert.equal(
    (await api.readMobileDraftReceipt(user, keys[0])).receipt.id,
    100,
  );
  assert.equal(
    (await api.readMobileDraftReceipt({ ...user, id: 8 }, keys[0])).receipt,
    null,
  );
  await assert.rejects(
    () => api.readMobileDraftReceipt({ ...user, store_id: 24 }, keys[0]),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => api.readMobileDraft({ ...user, store_id: 24 }, 100),
    (e) => e.status === 404,
  );
  checks.push(
    "Saved drafts reopen with their revision; stale edits roll back their key and receipts remain actor/store scoped",
  );

  const complex = clone(input);
  Object.assign(complex.draft, {
    ownership: true,
    ownership_term_months: "12",
    document_requirements: {
      phone: true,
      id_card: true,
      address: false,
      representative: true,
      relatives: 1,
    },
    extra_charges: [{ name: "QA fee", amount: "100", method: "cash" }],
    custom_installments: [{ due_at: "2026-11-01T08:00", amount: "500000" }],
    backfill: { note: "QA history" },
  });
  complex.rental_type = "ownership";
  const parsed = shape.parseMobileDraft(complex);
  assert.deepEqual(
    parsed.draft.custom_installments,
    complex.draft.custom_installments,
  );
  assert(wire.isMobileDraftInput(parsed));
  assert.throws(
    () =>
      shape.mobileDraftDocument({ ...complex.draft, future_web_field: true }),
    (e) => e.code === "DATA_REVIEW_REQUIRED",
  );
  const row = records.get(100);
  row.draft_payload.management_composer.draft.future_web_field = true;
  await assert.rejects(
    () => api.readMobileDraft(user, 100),
    (e) => e.code === "DATA_REVIEW_REQUIRED",
  );
  delete row.draft_payload.management_composer.draft.future_web_field;
  checks.push(
    "Ownership terms, custom installments, requirements and optional document fields survive round trips; unknown saved fields block unsafe editing",
  );

  const inv = await lookups.readMobileDraftInventory(
    user,
    new URLSearchParams("search=QA-301&page=2&store=24"),
  );
  assert(wire.isMobileDraftInventory(inv));
  assert.equal(inv.rows.length, 20);
  assert.equal(inv.hasMore, true);
  assert(!JSON.stringify(inv).includes("gps"));
  const inventorySQL = statements.findLast((row) =>
    row.sql.includes("FROM himoto.vehicle_inventory() stock"),
  );
  assert.equal(inventorySQL.scope.operation, "fleet_read");
  assert.equal(inventorySQL.scope.scope_all, false);
  assert.equal(inventorySQL.values[3], 20);
  await assert.rejects(() =>
    lookups.readMobileDraftInventory(user, new URLSearchParams("all=1")),
  );
  await assert.rejects(
    () =>
      lookups.readMobileDraftInventory(
        { ...user, permissions: ["contracts.read"] },
        new URLSearchParams(),
      ),
    (e) => e.status === 403,
  );
  checks.push(
    "The stock picker is paginated, preserves the fleet policy without scope_all, and returns only explicit vehicle fields",
  );

  const availability = await lookups.readMobileDraftAvailability(
    user,
    request({
      vehicleIds: [301, 301],
      startsAt: "2026-11-01T08:00",
      endsAt: "2026-11-02T08:00",
    }),
  );
  assert(wire.isMobileVehicleAvailability(availability));
  const available = availability.vehicles[0];
  assert.equal(available.hasHardBlocker, false);
  assert.equal(available.reservationOverlap, true);
  assert.equal(available.blockersTotal, 24);
  assert.equal(available.blockers.length, 20);
  assert.equal(available.draftsTotal, 26);
  assert.equal(available.drafts.length, 20);
  assert(!JSON.stringify(availability).includes("never expose"));
  const conflictSQL = statements.findLast((row) =>
    row.sql.includes("CROSS JOIN LATERAL himoto.vehicle_window_conflicts"),
  );
  assert.equal(conflictSQL.values[2], "2026-11-01T08:00:00+07:00");
  await assert.rejects(() =>
    lookups.readMobileDraftAvailability(
      user,
      request({
        vehicleIds: [301],
        startsAt: "2026-11-02T08:00",
        endsAt: "2026-11-01T08:00",
      }),
    ),
  );
  await assert.rejects(
    () =>
      lookups.readMobileDraftAvailability(
        { ...user, store_id: 24 },
        request({
          vehicleIds: [301],
          startsAt: "2026-11-01T08:00",
          endsAt: "2026-11-02T08:00",
          draftId: 100,
        }),
      ),
    (e) => e.status === 404,
  );
  checks.push(
    "Availability keeps hard rentals, deposit overlaps and soft drafts distinct, retains full counts beyond capped details, and excludes unrelated identities",
  );

  const scoped = await lookups.lookupMobileDraftCustomer(
    user,
    request({ id: 91 }),
  );
  assert.equal(scoped.rows.length, 0);
  assert.equal(ownerConnects, 0);
  const found = await lookups.lookupMobileDraftCustomer(
    user,
    request({ query: "0900000000" }),
  );
  assert(wire.isMobileDraftCustomers(found));
  assert.equal(found.rows[0].storeId, 24);
  assert(!JSON.stringify(found).includes("private_token"));
  assert.equal(ownerConnects, 1);
  await assert.rejects(() =>
    lookups.lookupMobileDraftCustomer(
      user,
      request({ query: "name".slice(0, 3) }),
    ),
  );
  await assert.rejects(
    () =>
      lookups.lookupMobileDraftCustomer(
        { ...user, permissions: ["contracts.read"] },
        request({ query: "0900000000" }),
      ),
    (e) => e.status === 403,
  );
  assert.equal(ownerConnects, 1);
  checks.push(
    "Numeric customer selection stays scoped; exact cross-branch lookup requires customer/draft grants and uses a bounded read-only owner transaction",
  );

  const client = load(path.resolve(root, "../mobile/src/lib/api"));
  const originalFetch = global.fetch;
  try {
    const network = client.createApi(
      "https://qa.example.invalid",
      "hm1_fixture",
    );
    global.fetch = async () =>
      new Response(
        JSON.stringify({ ...availability, startsAt: "2026-10-31T08:00" }),
      );
    await assert.rejects(
      () =>
        network.draftAvailability({
          vehicleIds: [301],
          startsAt: availability.startsAt,
          endsAt: availability.endsAt,
        }),
      (e) => e.code === "INVALID_RESPONSE",
    );
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          message: "Check",
          code: "INVALID_DRAFT",
          fields: { end_date: "After start" },
        }),
        { status: 400 },
      );
    await assert.rejects(
      () => network.saveDraft(null, input, keys[2]),
      (e) => e.fields.end_date === "After start",
    );
    assert(!wire.isMobileDraftProfile({ ...profile, revision: "99" }));
    assert(
      !wire.isMobileDraftInput({
        ...input,
        draft: { ...input.draft, vehicles: [{}] },
      }),
    );
  } finally {
    global.fetch = originalFetch;
  }
  checks.push(
    "The mobile client rejects mismatched availability windows, malformed drafts/revisions and preserves structured field errors",
  );
  assert(
    statements
      .filter((row) => !row.owner)
      .every((row) => row.scope.scope_all === false),
  );
  if (process.argv.includes("--sql-proof")) {
    const fs = require("node:fs");
    const selected = [
      ["staff-directory", (row) => row.owner && row.sql.includes("FROM himoto.staff_profiles")],
      [
        "draft",
        (row) =>
          row.sql.includes("FROM himoto.orders o") &&
          !row.sql.includes("CROSS JOIN LATERAL jsonb_array_elements"),
      ],
      [
        "inventory",
        (row) => row.sql.includes("FROM himoto.vehicle_inventory() stock"),
      ],
      [
        "availability",
        (row) =>
          row.sql.includes(
            "CROSS JOIN LATERAL himoto.vehicle_window_conflicts",
          ),
      ],
      [
        "soft-drafts",
        (row) => row.sql.includes("CROSS JOIN LATERAL jsonb_array_elements"),
      ],
      [
        "exact-customer",
        (row) => row.owner && row.sql.includes("FROM himoto.customers c"),
      ],
    ].map(([name, predicate]) => ({ name, ...statements.find(predicate) }));
    assert(selected.every((row) => row.sql));
    fs.mkdirSync(path.resolve(root, "../.backups"), { recursive: true });
    fs.writeFileSync(
      path.resolve(root, "../.backups/mobile-draft-sql-proof.json"),
      JSON.stringify(selected, null, 2),
    );
  }
  const result = { passed: checks.length, checks, operationalWrites: 0 };
  const fs = require("node:fs");
  fs.mkdirSync(path.resolve(root, "../.backups"), { recursive: true });
  fs.writeFileSync(
    path.resolve(root, "../.backups/mobile-drafts-api-results.json"),
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
    domain.saveDatabaseDraft = originalSave;
    Object.defineProperty(db.himotoPool, "connect", originalScoped);
    Object.defineProperty(db.ownerDatabase, "connect", originalOwner);
  });
