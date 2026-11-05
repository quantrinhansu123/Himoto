const assert = require("node:assert/strict");
const path = require("node:path");
const { NextRequest } = require("next/server");
const { load, root } = require("./lib/load-typescript.cjs");

async function run() {
  const service = load(path.join(root, "lib/server/customer-writes"));
  const mobile = load(path.join(root, "lib/server/mobile-customers"));
  const { dataAccess } = load(path.join(root, "lib/server/access-context"));
  const db = load(path.join(root, "lib/server/himoto-database"));
  const descriptors = Object.fromEntries(
    ["connect", "query"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(db.himotoPool, key),
    ]),
  );
  const user = {
    id: 7,
    name: "QA",
    email: "qa@example.invalid",
    role: "staff",
    access_role: "branch_staff",
    store_id: 23,
    scope_all: false,
    permissions: ["customers.read", "customers.write"],
  };
  const input = {
    name: "Khách QA",
    phone: "0900000000",
    email: "qa@example.invalid",
    address: "Địa chỉ QA",
    id_card: "001234567890",
    customer_type: "vietnam",
    nationality: "",
    contact_channel: "",
    contact_detail: "",
    store_id: 23,
    status: "active",
    warning_note: "",
    driver_license_number: "",
    driver_license_issued_on: "",
    id_card_issued_on: "",
    id_card_issued_by: "",
    relatives: [],
  };
  const keys = [
    "18e8999f-498d-4874-8d2d-43ee4fe30bf8",
    "18e8999f-498d-4874-8d2d-43ee4fe30bf9",
    "18e8999f-498d-4874-8d2d-43ee4fe30bfa",
  ];
  const request = (body, key = keys[0]) =>
    new NextRequest("https://qa.example.invalid/api/mobile/v1/customers", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { "idempotency-key": key } : {}),
      },
      body: JSON.stringify(body),
    });
  let requests = new Map(),
    customers = new Map(),
    statements = [],
    writes = 0,
    snapshot = null,
    connected = 0;
  function visible(row) {
    const scope = dataAccess.getStore();
    return row && (scope.scope_all || row.store_id === scope.store_id);
  }
  async function query(sql, values = []) {
    const scope = dataAccess.getStore();
    assert(scope, "Every business query needs an explicit actor context");
    assert.equal(scope.operation, "");
    statements.push(sql);
    if (sql === "BEGIN") {
      snapshot = structuredClone({ requests, customers });
      return { rows: [], rowCount: 0 };
    }
    if (sql === "COMMIT") {
      snapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (sql === "ROLLBACK") {
      if (snapshot) {
        requests = snapshot.requests;
        customers = snapshot.customers;
        snapshot = null;
      }
      return { rows: [], rowCount: 0 };
    }
    if (
      sql.startsWith("SET LOCAL") ||
      sql.startsWith("LOCK TABLE") ||
      sql.startsWith("SELECT pg_advisory")
    )
      return { rows: [], rowCount: 0 };
    if (sql.startsWith("INSERT INTO himoto.management_mobile_requests")) {
      const key = `${values[0]}:${values[1]}`;
      if (!requests.has(key))
        requests.set(key, {
          operation: values[2],
          fingerprint: values[3],
          resource_id: null,
          resource_revision: null,
        });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("FROM himoto.management_mobile_requests")) {
      const row = requests.get(`${values[0]}:${values[1]}`);
      const rows =
        row && (!sql.includes("IS NOT NULL") || row.resource_id != null)
          ? [row]
          : [];
      return { rows, rowCount: rows.length };
    }
    if (sql.startsWith("UPDATE himoto.management_mobile_requests")) {
      Object.assign(requests.get(`${values[0]}:${values[1]}`), {
        resource_id: values[2],
        resource_revision: values[3],
      });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("find_customer_duplicate")) {
      const duplicate = [...customers.values()].find(
        (row) =>
          row.id_card &&
          row.id_card === (sql.includes("$2,''") ? values[1] : values[0]) &&
          row.id !== values[0],
      );
      return {
        rows: duplicate ? [{ id: duplicate.id }] : [],
        rowCount: duplicate ? 1 : 0,
      };
    }
    if (sql.startsWith("INSERT INTO himoto.customers")) {
      writes++;
      const row = {
        id: 100 + customers.size,
        name: values[0],
        phone: values[1],
        email: values[2],
        address: values[3],
        id_card: values[4],
        status: values[5],
        store_id: values[6],
        warning: values[7],
        driver_license_number: values[8],
        driver_license_issued_on: values[9],
        relatives: JSON.parse(values[10]),
        id_card_issued_on: values[11],
        id_card_issued_by: values[12],
        customer_type: values[13],
        nationality: values[14],
        contact_channel: values[15],
        contact_detail: values[16],
        customer_revision: "100",
        revision: "100",
        private_draft: "must not escape",
      };
      customers.set(row.id, row);
      return { rows: [row], rowCount: 1 };
    }
    if (sql.startsWith("UPDATE himoto.customers")) {
      const row = customers.get(values[0]);
      if (!visible(row)) return { rows: [], rowCount: 0 };
      writes++;
      Object.assign(row, {
        name: values[1],
        phone: values[2],
        address: values[3],
        id_card: values[4],
        status: values[5],
        warning: values[6],
        store_id: values[7],
        customer_revision: "101",
        revision: "101",
      });
      if (values[19]) row.email = values[20];
      return { rows: [row], rowCount: 1 };
    }
    if (sql.includes("FROM himoto.customers")) {
      const row = customers.get(values[0]),
        rows = visible(row) ? [row] : [];
      return { rows, rowCount: rows.length };
    }
    throw new Error("Unhandled fixture SQL");
  }
  const client = {
    query,
    release() {
      assert.equal(snapshot, null, "All transactions must commit or roll back");
    },
  };
  Object.defineProperty(db.himotoPool, "connect", {
    configurable: true,
    value: async () => {
      connected++;
      return client;
    },
  });
  Object.defineProperty(db.himotoPool, "query", {
    configurable: true,
    value: query,
  });
  const checks = [];
  try {
    assert.equal(
      service.parseCustomerWrite(input, "create").idCard,
      input.id_card,
    );
    assert.equal(
      service.parseCustomerWrite(
        {
          ...input,
          phone: "",
          id_card: "",
          address: "",
          status: "draft",
          allow_incomplete: true,
        },
        "create",
      ).status,
      "draft",
    );
    assert.throws(() =>
      service.parseCustomerWrite({ ...input, relatives: null }, "update"),
    );
    assert.throws(() =>
      service.parseCustomerWrite(
        { ...input, id_card_issued_on: "2025-02-30" },
        "create",
      ),
    );
    assert.throws(() =>
      service.parseCustomerWrite({ ...input, phone: "abc" }, "create"),
    );
    assert.throws(() =>
      service.parseCustomerWrite(
        { ...input, customer_type: "foreign", phone: "", contact_detail: "" },
        "create",
      ),
    );
    assert.equal(
      service.parseCustomerWrite(
        {
          ...input,
          customer_type: "foreign",
          id_card: "P-QA",
          phone: "",
          contact_detail: "qa@example.invalid",
        },
        "create",
      ).customerType,
      "foreign",
    );
    checks.push(
      "Shared validation covers domestic/foreign/incomplete profiles, dates and invalid relative payloads",
    );

    const receipt = await mobile.writeMobileCustomer(
      user,
      request(input),
      null,
    );
    assert.deepEqual(receipt, { id: 100, revision: "100", replayed: false });
    const retry = await mobile.writeMobileCustomer(user, request(input), null);
    assert.deepEqual(retry, { id: 100, revision: "100", replayed: true });
    assert.equal(writes, 1);
    await assert.rejects(
      () =>
        mobile.writeMobileCustomer(
          user,
          request({ ...input, name: "Changed" }),
          null,
        ),
      (e) => e.status === 409 && e.code === "REQUEST_KEY_REUSED",
    );
    assert.equal(writes, 1);
    assert.equal(customers.size, 1);
    checks.push(
      "A lost-response retry returns the original receipt without a second customer; key reuse with different content rolls back",
    );

    const before = connected;
    await assert.rejects(
      () =>
        mobile.writeMobileCustomer(
          {
            ...user,
            access_role: "headquarters_sales",
            permissions: ["customers.read"],
          },
          request(input),
          null,
        ),
      (e) => e.status === 403,
    );
    await assert.rejects(
      () =>
        mobile.writeMobileCustomer(
          user,
          request({ ...input, store_id: 24 }),
          null,
        ),
      (e) => e.status === 403,
    );
    await assert.rejects(
      () => mobile.writeMobileCustomer(user, request(input, null), null),
      (e) => e.code === "INVALID_REQUEST_KEY",
    );
    await assert.rejects(
      () =>
        mobile.writeMobileCustomer(
          user,
          request({ ...input, unexpected: "field" }),
          null,
        ),
      (e) => e.status === 400,
    );
    await assert.rejects(
      () =>
        mobile.writeMobileCustomer(
          user,
          request({ ...input, name: "x".repeat(40000) }),
          null,
        ),
      (e) => e.status === 413,
    );
    assert.equal(connected, before);
    checks.push(
      "Read-only grants, forged stores, missing keys, unknown fields and oversized bodies fail before any business connection",
    );

    await assert.rejects(
      () =>
        mobile.writeMobileCustomer(
          user,
          request({ ...input, revision: "99" }, keys[1]),
          100,
        ),
      (e) => e.status === 409 && e.code === "CUSTOMER_CONFLICT",
    );
    assert.equal(writes, 1);
    assert(!requests.has(`${user.id}:${keys[1]}`));
    const updated = await mobile.writeMobileCustomer(
      user,
      request(
        {
          ...input,
          name: "Updated",
          email: "new@example.invalid",
          revision: "100",
        },
        keys[1],
      ),
      100,
    );
    assert.equal(updated.revision, "101");
    assert.equal(customers.get(100).email, "new@example.invalid");
    assert.equal(
      (
        await mobile.writeMobileCustomer(
          user,
          request(
            {
              ...input,
              name: "Updated",
              email: "new@example.invalid",
              revision: "100",
            },
            keys[1],
          ),
          100,
        )
      ).replayed,
      true,
    );
    assert.equal(writes, 2);
    checks.push(
      "Stale revisions preserve data and roll back the request key; updates save email and retry without applying twice",
    );

    await assert.rejects(
      () => mobile.writeMobileCustomer(user, request(input, keys[2]), null),
      (e) => e.status === 409 && e.code === "CUSTOMER_EXISTS",
    );
    assert.equal(customers.size, 1);
    assert(!requests.has(`${user.id}:${keys[2]}`));
    assert(
      statements.some((sql) => sql.includes("LOCK TABLE himoto.customers")),
    );
    checks.push(
      "New intents with an existing identity use the existing duplicate checks and leave no partial receipt",
    );

    const profile = await mobile.readMobileCustomer(user, 100);
    assert.equal(profile.id_card, input.id_card);
    assert.equal(profile.revision, "101");
    assert(!("private_draft" in profile));
    await assert.rejects(
      () =>
        mobile.readMobileCustomer(
          {
            ...user,
            access_role: "headquarters_sales",
            permissions: ["customers.read"],
          },
          100,
        ),
      (e) => e.status === 403,
    );
    await assert.rejects(
      () => mobile.readMobileCustomer({ ...user, store_id: 24 }, 100),
      (e) => e.status === 404,
    );
    assert.equal(
      (await mobile.readMobileCustomerReceipt(user, keys[0])).receipt.id,
      100,
    );
    assert.equal(
      (await mobile.readMobileCustomerReceipt({ ...user, id: 8 }, keys[0]))
        .receipt,
      null,
    );
    checks.push(
      "Editing exposes only its explicit profile fields; read-only and other-store users cannot read it or another actor’s receipt",
    );

    const fs = require("node:fs"),
      ts = require("typescript");
    const mobileRoot = path.resolve(root, "../mobile/src/lib");
    const values = new Map();
    const secure = {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
      getItemAsync: async (key) => values.get(key) || null,
      setItemAsync: async (key, value, options) => {
        assert.equal(options.keychainAccessible, "device-only");
        values.set(key, value);
      },
      deleteItemAsync: async (key) => {
        values.delete(key);
      },
    };
    function pendingStore() {
      const module = { exports: {} };
      const source = ts.transpileModule(
        fs.readFileSync(path.join(mobileRoot, "pending-writes.ts"), "utf8"),
        {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
          },
        },
      ).outputText;
      new Function("require", "module", "exports", source)(
        (name) =>
          name === "expo-secure-store"
            ? secure
            : name === "react-native"
              ? { Platform: { OS: "android" } }
              : (() => {
                  throw Error("Unexpected import");
                })(),
        module,
        module.exports,
      );
      return module.exports.pendingWrites;
    }
    const scope = {
      origin: "https://qa.example.invalid",
      userId: 7,
      storeId: 23,
      allStores: false,
    };
    let store = pendingStore(),
      generated = 0;
    const reserved = await Promise.all([
      store.reserve(scope, "customer.create", () => {
        generated++;
        return keys[0];
      }),
      store.reserve(scope, "customer.create", () => {
        generated++;
        return keys[1];
      }),
    ]);
    assert.deepEqual(reserved, [keys[0], keys[0]]);
    assert.equal(generated, 1);
    store = pendingStore();
    assert.equal(await store.lookup(scope, "customer.create"), keys[0]);
    await store.reserve(scope, "draft.create", () => keys[1]);
    store = pendingStore();
    assert.equal(await store.lookup(scope, "draft.create"), keys[1]);
    await store.complete(scope, "draft.create", keys[1]);
    await store.reserve(scope, "contract.finalize:100", () => keys[1]);
    store = pendingStore();
    assert.equal(await store.lookup(scope, "contract.finalize:100"), keys[1]);
    await store.complete(scope, "contract.finalize:100", keys[1]);
    await store.reserve(scope, "payment.record:101", () => keys[1]);
    store = pendingStore();
    assert.equal(await store.lookup(scope, "payment.record:101"), keys[1]);
    await store.complete(scope, "payment.record:101", keys[1]);
    assert.equal(
      await store.lookup({ ...scope, userId: 8 }, "customer.create"),
      null,
    );
    assert.equal(
      await store.lookup({ ...scope, storeId: 24 }, "customer.create"),
      null,
    );
    assert.equal(
      await store.lookup(
        { ...scope, origin: "https://other.example.invalid" },
        "customer.create",
      ),
      null,
    );
    await store.reserve(
      { ...scope, userId: 8 },
      "customer.create",
      () => keys[1],
    );
    store = pendingStore();
    assert.equal(await store.lookup(scope, "customer.create"), keys[0]);
    assert.equal(
      await store.lookup({ ...scope, userId: 8 }, "customer.create"),
      keys[1],
    );
    assert.deepEqual(await store.list(scope), [{ operation: "customer.create", key: keys[0] }]);
    assert.deepEqual(await store.list({ ...scope, userId: 8 }), [{ operation: "customer.create", key: keys[1] }]);
    assert.deepEqual(await store.list({ ...scope, storeId: 24 }), []);
    const raw = [...values.values()][0];
    assert(!raw.includes(input.name));
    assert(!raw.includes(input.phone));
    assert(!raw.includes("hm1_"));
    checks.push(
      "Pending write keys survive a simulated native process restart, contain no form/token data and are isolated by actor, origin and store scope",
    );

    const late = store.reserve(scope, "customer.update:100", () => keys[1]);
    const rejected = assert.rejects(late, /Phiên làm việc/);
    store.detach();
    await rejected;
    assert.equal(await store.lookup(scope, "customer.create"), keys[0]);
    await store.complete(scope, "customer.create", keys[0]);
    await store.reserve(scope, "customer.create", () => keys[2]);
    await store.complete(scope, "customer.create", keys[0]);
    assert.equal(await store.lookup(scope, "customer.create"), keys[2]);
    await store.complete(scope, "customer.create", keys[2]);
    assert.equal(await store.lookup(scope, "customer.create"), null);
    assert.equal(
      await store.lookup({ ...scope, userId: 8 }, "customer.create"),
      keys[1],
    );
    checks.push(
      "Sign-out cancels queued reservations while preserving actor-isolated recovery across reauthentication; delayed completion cannot delete a newer request",
    );

    values.clear();
    values.set(
      "himoto.mobile.pending-writes.v1",
      JSON.stringify({ ...scope, requests: { "draft.create": keys[0] } }),
    );
    store = pendingStore();
    assert.equal(await store.lookup(scope, "draft.create"), keys[0]);
    assert.equal(values.has("himoto.mobile.pending-writes.v1"), false);
    for (let i = 1; i < 8; i++) {
      await store.reserve(
        { ...scope, userId: 7 + i },
        "draft.create",
        () => `0000000${i}-0000-4000-8000-000000000000`,
      );
    }
    assert([...values.values()].every((raw) => Buffer.byteLength(raw) < 2048));
    await assert.rejects(
      store.reserve({ ...scope, userId: 100 }, "draft.create", () => keys[2]),
      /nhiều lần lưu/,
    );
    assert.equal(await store.lookup(scope, "draft.create"), keys[0]);
    values.delete("himoto.mobile.pending-writes.v2." + keys[0]);
    let generatedAfterCorruption = false;
    await assert.rejects(
      store.reserve(scope, "draft.create", () => {
        generatedAfterCorruption = true;
        return keys[2];
      }),
      /Không đọc được/,
    );
    assert.equal(generatedAfterCorruption, false);
    checks.push(
      "Legacy pending IDs migrate without loss; eight outstanding requests remain bounded in small Keychain entries and corrupt metadata blocks a new write",
    );

    const form = load(path.join(mobileRoot, "customer-form"));
    const blank = form.emptyCustomer(23);
    assert.equal(blank.status, "active");
    assert.equal(form.emptyCustomer(23, true).status, "draft");
    assert.equal(
      form.customerErrors(blank, true).name,
      "Nhập họ và tên khách hàng.",
    );
    assert.deepEqual(
      form.customerErrors({ ...blank, name: "Quick draft", status: "draft" }, true),
      {},
    );
    const completeErrors = form.customerErrors(
      { ...blank, name: "Complete", status: "active" },
      true,
    );
    assert(
      completeErrors.phone && completeErrors.address && completeErrors.id_card,
    );
    assert(
      form.customerErrors(
        { ...blank, name: "Foreign", customer_type: "foreign" },
        true,
      ).contact_detail,
    );
    const validators = load(path.join(mobileRoot, "response-validation"));
    assert(validators.isCustomerProfile(profile));
    assert(!validators.isCustomerProfile({ ...profile, revision: "invalid" }));
    assert(validators.isWriteReceipt(updated));
    assert(!validators.isWriteReceipt({ ...updated, id: -1 }));
    checks.push(
      "Form validation differentiates incomplete/complete/foreign profiles; malformed profile versions and write receipts are rejected",
    );

    console.log(
      JSON.stringify(
        { passed: checks.length, checks, operationalWrites: 0 },
        null,
        2,
      ),
    );
  } finally {
    for (const [key, descriptor] of Object.entries(descriptors))
      Object.defineProperty(db.himotoPool, key, descriptor);
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
