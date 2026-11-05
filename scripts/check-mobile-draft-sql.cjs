// Planning-only compatibility check for existing schema/functions. No ANALYZE,
// business rows, migrations or sequences are written; each plan is read-only.
const fs = require("node:fs");
const path = require("node:path");
require("@next/env").loadEnvConfig(process.cwd(), false, {
  info() {},
  error() {},
});
const { load, root } = require("./lib/load-typescript.cjs");
const pool = load(path.join(root, "lib/server/himoto-database")).ownerDatabase;
async function run() {
  const samples = JSON.parse(
    fs.readFileSync(
      path.resolve(root, "../.backups/mobile-draft-sql-proof.json"),
      "utf8",
    ),
  );
  const client = await pool.connect();
  const checked = [];
  try {
    for (const sample of samples) {
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL statement_timeout='15s'");
      if (!sample.owner) {
        await client.query(
          "SELECT set_config('himoto.actor_id','70001',true),set_config('himoto.store_id','23',true),set_config('himoto.scope_all','false',true),set_config('himoto.operation',$1,true)",
          [sample.scope.operation],
        );
        await client.query("SET LOCAL ROLE himoto_scoped");
      }
      await client.query("EXPLAIN (FORMAT JSON) " + sample.sql, sample.values);
      await client.query("ROLLBACK");
      checked.push(sample.name);
    }
    const result = {
      passed: checked.length,
      checks: checked,
      planningOnly: true,
      operationalWrites: 0,
    };
    fs.writeFileSync(
      path.resolve(root, "../.backups/mobile-draft-sql-results.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}
run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      "Mobile draft SQL planning failed:",
      error.code || error.name,
    );
    process.exit(1);
  });
