const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("@next/env").loadEnvConfig(process.cwd(), false, {
  info() {},
  error() {},
});
const { load, root } = require("./lib/load-typescript.cjs");
const pool = load(path.join(root, "lib/server/himoto-database")).ownerDatabase;

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='20s'",
    );
    await client.query(
      "CREATE SCHEMA qa_mobile_write_scope; CREATE TABLE qa_mobile_write_scope.users(id bigint PRIMARY KEY); INSERT INTO qa_mobile_write_scope.users VALUES(70001),(70002)",
    );
    const migration = fs
      .readFileSync(
        path.resolve(__dirname, "../docs/sql/2026-10-31-mobile-writes.sql"),
        "utf8",
      )
      .replaceAll(
        "himoto.management_mobile_requests",
        "qa_mobile_write_scope.management_mobile_requests",
      )
      .replaceAll("himoto.users", "qa_mobile_write_scope.users")
      .replace(/^BEGIN;|^COMMIT;/gm, "");
    await client.query(migration);
    await client.query(migration);
    await client.query(
      "GRANT USAGE ON SCHEMA qa_mobile_write_scope TO himoto_scoped",
    );
    await client.query(`INSERT INTO qa_mobile_write_scope.management_mobile_requests(user_id,request_id,operation,fingerprint,resource_id,resource_revision)
      VALUES(70001,'18e8999f-498d-4874-8d2d-43ee4fe30bf8','customer.create',repeat('a',64),100,'100'),
            (70002,'18e8999f-498d-4874-8d2d-43ee4fe30bf9','customer.create',repeat('b',64),101,'101')`);
    await client.query("SELECT set_config('himoto.actor_id','70001',true)");
    await client.query("SET LOCAL ROLE himoto_scoped");
    assert.deepEqual(
      (
        await client.query(
          "SELECT user_id::int AS user_id FROM qa_mobile_write_scope.management_mobile_requests",
        )
      ).rows,
      [{ user_id: 70001 }],
    );
    assert.equal(
      (
        await client.query(
          "UPDATE qa_mobile_write_scope.management_mobile_requests SET resource_id=999 WHERE user_id=70002",
        )
      ).rowCount,
      0,
    );
    await client.query("SAVEPOINT deny_other_actor");
    await assert.rejects(
      () =>
        client.query(`INSERT INTO qa_mobile_write_scope.management_mobile_requests(user_id,request_id,operation,fingerprint)
      VALUES(70002,'18e8999f-498d-4874-8d2d-43ee4fe30bfa','customer.create',repeat('c',64))`),
      (error) => error.code === "42501",
    );
    await client.query("ROLLBACK TO SAVEPOINT deny_other_actor");
    await client.query(`INSERT INTO qa_mobile_write_scope.management_mobile_requests(user_id,request_id,operation,fingerprint)
      VALUES(70001,'18e8999f-498d-4874-8d2d-43ee4fe30bfa','customer.create',repeat('c',64))`);
    await client.query("SELECT set_config('himoto.actor_id','',true)");
    assert.equal(
      (
        await client.query(
          "SELECT * FROM qa_mobile_write_scope.management_mobile_requests",
        )
      ).rowCount,
      0,
    );
    await client.query("RESET ROLE");
    assert.equal(
      (
        await client.query(
          "SELECT has_table_privilege('anon','qa_mobile_write_scope.management_mobile_requests','SELECT') AS allowed",
        )
      ).rows[0].allowed,
      false,
    );
    await client.query("ROLLBACK");
    console.log(
      JSON.stringify(
        {
          passed: 4,
          checks: [
            "Migration is repeatable in an isolated schema",
            "Actor RLS hides other actors and rejects cross-actor inserts/updates",
            "Missing actor sees no request receipts; anonymous role has no SELECT grant",
            "All schema/test writes rolled back; no operational rows or sequences changed",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}
run().then(() => process.exit(0)).catch((error) => {
  console.error(
    "Mobile request RLS check failed:",
    error.code || error.name,
    error.message,
  );
  process.exit(1);
});
