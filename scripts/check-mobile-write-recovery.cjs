const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { NextRequest } = require("next/server");
const { load, root } = require("./lib/load-typescript.cjs");
const { resolveMobileWrite } = load(path.join(root, "lib/server/mobile-write-recovery"));
const { idempotentMobileWrite } = load(path.join(root, "lib/server/mobile-writes"));
const { withMobileData } = load(path.join(root, "lib/server/mobile-context"));
const { dataAccess } = load(path.join(root, "lib/server/access-context"));
const db = load(path.join(root, "lib/server/himoto-database"));
const user = { id: 7, role: "staff", access_role: "branch_staff", store_id: 23, scope_all: false,
  permissions: ["customers.read", "customers.write", "contracts.read", "contracts.draft", "contracts.finalize"] };
const keys = Array.from({ length: 16 }, (_, i) => `${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`);
const requests = new Map(), locks = new Map(), checks = [];
let connects = 0, writes = 0, failCommit = false;
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const response = (rows) => ({ rows, rowCount: rows.length });
// Model PostgreSQL's unique-key wait and transaction visibility; no network or
// operational DB is used. Actual PostgreSQL concurrency remains a staging gate.
function connection() {
  connects++;
  const scope = structuredClone(dataAccess.getStore());
  assert(scope && scope.operation === "" && scope.scope_all === false);
  let lockedKey, unlock, row, changed = false, effects = 0;
  function release() {
    if (unlock) { locks.delete(lockedKey); unlock(); unlock = null; }
  }
  return {
    release,
    async query(sql, values = []) {
      if (sql.startsWith("BEGIN") || sql.startsWith("SET LOCAL")) return response([]);
      if (sql === "ROLLBACK") { release(); return response([]); }
      if (sql === "COMMIT") {
        if (failCommit) { failCommit = false; throw new Error("QA commit unavailable"); }
        if (changed) requests.set(lockedKey, structuredClone(row));
        writes += effects;
        release(); return response([]);
      }
      if (sql.includes("INSERT INTO himoto.management_mobile_requests")) {
        assert.equal(values[0], scope.id);
        lockedKey = `${values[0]}:${values[1]}`;
        while (locks.has(lockedKey)) await locks.get(lockedKey);
        const gate = deferred(); unlock = gate.resolve; locks.set(lockedKey, gate.promise);
        row = structuredClone(requests.get(lockedKey)) || { operation: values[2], fingerprint: values[3], resource_id: null, resource_revision: null };
        changed = true;
        return response([]);
      }
      if (sql.includes("FROM himoto.management_mobile_requests")) {
        assert(sql.includes("FOR UPDATE"), "Resolution must lock the same row as business writes");
        assert.equal(values[0], scope.id);
        return response(row ? [structuredClone(row)] : []);
      }
      if (sql.startsWith("UPDATE himoto.management_mobile_requests")) {
        Object.assign(row, { resource_id: values[2], resource_revision: values[3] });
        return response([]);
      }
      if (sql.startsWith("SELECT id FROM himoto.")) return response(scope.store_id === 23 ? [{ id: values[0] }] : []);
      if (sql === "QA BUSINESS WRITE") { effects++; return response([]); }
      throw new Error(`Unhandled synthetic SQL: ${sql}`);
    },
  };
}
const descriptor = Object.getOwnPropertyDescriptor(db.himotoPool, "connect");
Object.defineProperty(db.himotoPool, "connect", { configurable: true, value: async () => connection() });
function request(operation, extra = {}) {
  return new NextRequest("https://mobile-api.example.invalid/api/mobile/v1/write-requests/key/resolve", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation, ...extra }),
  });
}
const resolve = (key, operation = "draft.create", actor = user) => resolveMobileWrite(actor, key, request(operation));
async function write(key, operation = "draft.create", enter, finish, fail = false) {
  return withMobileData(user, "", async () => {
    const client = await db.himotoPool.connect();
    try {
      await client.query("BEGIN");
      const receipt = await idempotentMobileWrite(client, user.id, key, operation, { qa: true }, async () => {
        enter?.resolve();
        if (finish) await finish.promise;
        if (fail) throw new Error("QA domain failure");
        await client.query("QA BUSINESS WRITE");
        return { id: 101, revision: "123" };
      });
      await client.query("COMMIT");
      return receipt;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  });
}
async function run() {
  const cancelled = await resolve(keys[0]);
  assert.equal(cancelled.status, "cancelled");
  await assert.rejects(write(keys[0]), (e) => e.code === "REQUEST_CANCELLED");
  assert.equal(writes, 0);
  assert.deepEqual(await resolve(keys[0]), cancelled);
  checks.push("Cancellation wins before a delayed write: the tombstone survives retry/lost acknowledgement and permanently blocks the old key without business writes");

  const entered = deferred(), finish = deferred();
  const first = write(keys[1], "contract.finalize:101", entered, finish);
  await entered.promise;
  const second = resolve(keys[1], "contract.finalize:101");
  await new Promise((r) => setImmediate(r));
  assert(locks.has(`7:${keys[1]}`));
  finish.resolve();
  const [original, recovered] = await Promise.all([first, second]);
  assert.equal(recovered.status, "committed");
  assert.equal(recovered.receipt.id, original.id);
  assert.equal(writes, 1);
  assert.equal(requests.get(`7:${keys[1]}`).operation, "contract.finalize:101");
  checks.push("An in-flight business transaction wins first: resolution waits for its receipt and returns the committed result without cancelling or collecting twice");

  const enteredFail = deferred(), finishFail = deferred();
  const failing = assert.rejects(write(keys[2], "draft.create", enteredFail, finishFail, true), /domain failure/);
  await enteredFail.promise;
  const afterRollback = resolve(keys[2]);
  finishFail.resolve(); await failing;
  assert.equal((await afterRollback).status, "cancelled");
  await assert.rejects(write(keys[2]), (e) => e.code === "REQUEST_CANCELLED");
  assert.equal(writes, 1);
  checks.push("A failing writer rolls back before resolution; cancellation then blocks every retry with the same key");

  await assert.rejects(resolve(keys[1], "contract.finalize:101", { ...user, store_id: 24 }), (e) => e.status === 403);
  assert.equal((await resolve(keys[1], "contract.finalize:101")).status, "committed");
  assert.equal((await resolve(keys[1], "contract.finalize:101", { ...user, id: 8 })).status, "cancelled");
  await assert.rejects(resolve(keys[1], "customer.create"), (e) => e.code === "REQUEST_KEY_REUSED");
  const before = connects;
  await assert.rejects(resolve(keys[3], "draft.create", { ...user, permissions: ["contracts.read"] }), (e) => e.status === 403);
  await assert.rejects(resolve(keys[3], "finance.create"), (e) => e.code === "INVALID_OPERATION");
  await assert.rejects(resolve("not-a-uuid"), (e) => e.code === "INVALID_REQUEST_KEY");
  await assert.rejects(resolveMobileWrite(user, keys[3], request("draft.create", { token: "forbidden" })), (e) => e.code === "INVALID_OPERATION");
  assert.equal(connects, before);
  checks.push("Resolution retains actor-specific RLS/current resource visibility, rejects mismatched operations, missing grants, invalid keys and injected bodies before business DB use");

  failCommit = true;
  await assert.rejects(resolve(keys[3]), /commit unavailable/);
  assert(!requests.has(`7:${keys[3]}`));
  assert.equal((await resolve(keys[3])).status, "cancelled");
  for (const [index, operation] of ["customer.create", "customer.update:101", "draft.update:101", "contract.handover:101"].entries()) {
    assert.equal((await resolve(keys[index + 4], operation)).status, "cancelled");
    await assert.rejects(write(keys[index + 4], operation), (e) => e.code === "REQUEST_CANCELLED");
  }
  for (const [index, operation] of ["customer.create", "customer.update:101", "draft.create", "draft.update:101", "contract.handover:101"].entries()) {
    await write(keys[index + 8], operation);
    const result = await resolve(keys[index + 8], operation);
    assert.equal(result.status, "committed");
    assert.equal(result.receipt.id, 101);
    assert.equal(result.receipt.replayed, true);
  }
  checks.push("Commit failures retain no partial tombstone; every supported customer/draft/contract operation can be resolved and delayed writes remain blocked");

  const { createApi } = load(path.resolve(root, "../mobile/src/lib/api"));
  const api = createApi("https://mobile-api.example.invalid", "hm1_" + "a".repeat(43));
  const originalFetch = global.fetch;
  try {
    for (const bad of [{ ...cancelled, key: keys[1] }, { ...cancelled, operation: "customer.create" }, { ...cancelled, receipt: { id: 101, revision: "1", replayed: true } }, { ...cancelled, status: "unknown" }]) {
      global.fetch = async () => Response.json(bad);
      await assert.rejects(api.resolveWrite(keys[0], "draft.create"), (e) => e.code === "INVALID_RESPONSE");
    }
    global.fetch = async (url, options) => {
      assert.equal(url, `https://mobile-api.example.invalid/api/mobile/v1/write-requests/${keys[0]}/resolve`);
      assert.equal(options.method, "POST");
      assert.equal(options.redirect, "error");
      assert.deepEqual(JSON.parse(options.body), { operation: "draft.create" });
      assert(options.headers.Authorization.startsWith("Bearer hm1_"));
      return Response.json(cancelled);
    };
    assert.deepEqual(await api.resolveWrite(keys[0], "draft.create"), cancelled);
    global.fetch = async () => Response.json({ ...recovered, receipt: { ...recovered.receipt, id: 102 } });
    await assert.rejects(api.resolveWrite(keys[1], "contract.finalize:101"), (e) => e.code === "INVALID_RESPONSE");
  } finally { global.fetch = originalFetch; }
  checks.push("Client resolution is origin-bound and rejects another key/operation/resource, contradictory cancellation receipts and unknown response states");

  const result = { passed: checks.length, checks, operationalWrites: 0, databaseConcurrency: "synthetic unique-key/transaction lock model; staging PostgreSQL race test required" };
  fs.mkdirSync(path.resolve(root, "../.backups"), { recursive: true });
  fs.writeFileSync(path.resolve(root, "../.backups/mobile-write-recovery-results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (descriptor) Object.defineProperty(db.himotoPool, "connect", descriptor);
  else delete db.himotoPool.connect;
});
