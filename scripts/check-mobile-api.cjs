const assert = require("node:assert/strict");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const { NextRequest } = require("next/server");
const { load, root } = require("./lib/load-typescript.cjs");

async function run() {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    HIMOTO_MOBILE_ENABLED: process.env.HIMOTO_MOBILE_ENABLED,
    DATABASE_URL: process.env.DATABASE_URL,
    MANAGEMENT_SESSION_SECRET: process.env.MANAGEMENT_SESSION_SECRET,
  };
  Object.assign(process.env, {
    NODE_ENV: "production",
    HIMOTO_MOBILE_ENABLED: "true",
    DATABASE_URL: "postgresql://qa.invalid/test",
    MANAGEMENT_SESSION_SECRET: "mobile-test-secret-never-used-in-production",
  });
  const db = load(path.join(root, "lib/server/himoto-database"));
  const queryDescriptor = Object.getOwnPropertyDescriptor(
    db.ownerDatabase,
    "query",
  );
  const connectDescriptor = Object.getOwnPropertyDescriptor(
    db.himotoPool,
    "connect",
  );
  const webQueryDescriptor = Object.getOwnPropertyDescriptor(
    db.himotoPool,
    "query",
  );
  const statements = [];
  const sessions = new Map();
  const attempts = new Map();
  const checks = [];
  const password = "A fixture password, never a production credential";
  let account = {
    id: 7,
    name: "Mobile QA",
    email: "mobile@example.invalid",
    password: await bcrypt.hash(password, 4),
    status: "active",
    role: "staff",
    role_slug: "nhan-vien",
    access_role: "branch_staff",
    access_store_id: 23,
    scope_all: false,
    access_enabled: true,
    permissions: ["contracts.read", "customers.read"],
    management_password_version: 0,
  };
  const database = {
    query: async (sql, values = []) => {
      statements.push({ sql, values });
      if (sql.includes("INSERT INTO himoto.management_mobile_login_limits")) {
        const count = (attempts.get(values[0]) || 0) + 1;
        attempts.set(values[0], count);
        return { rows: [{ attempts: count }] };
      }
      if (sql.includes("INSERT INTO himoto.management_mobile_sessions")) {
        sessions.set(values[2], {
          id: values[0],
          user_id: values[1],
          password_version: values[3],
          expires_at: values[6],
        });
        return { rows: [] };
      }
      if (
        sql.includes(
          "SELECT id,user_id,password_version,expires_at FROM himoto.management_mobile_sessions",
        )
      ) {
        const session = sessions.get(values[0]);
        return {
          rows:
            session &&
            !session.revoked &&
            Date.parse(session.expires_at) > Date.now()
              ? [session]
              : [],
        };
      }
      if (sql.startsWith("UPDATE himoto.management_mobile_sessions")) {
        for (const session of sessions.values())
          if (session.id === values[0] && session.user_id === values[1])
            session.revoked = true;
        return { rows: [] };
      }
      if (sql.includes("FROM himoto.users"))
        return { rows: account ? [account] : [] };
      throw new Error("Unexpected fixture SQL");
    },
  };
  Object.defineProperty(db.ownerDatabase, "query", {
    configurable: true,
    value: database.query,
  });
  try {
    const mobile = load(path.join(root, "lib/server/mobile-session"));
    const handler = load(path.join(root, "app/api/mobile/v1/session/route"));
    const request = (method = "GET", token, body, extra = {}) =>
      new NextRequest("https://himoto.example/api/mobile/v1/session", {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...extra,
        },
        ...(body !== undefined
          ? { body: typeof body === "string" ? body : JSON.stringify(body) }
          : {}),
      });
    const credentials = {
      email: account.email,
      password,
      platform: "ios",
      deviceName: "QA iPhone",
    };
    let response = await handler.POST(request("POST", undefined, credentials));
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.match(response.headers.get("cache-control"), /no-store/);
    const session = await response.json();
    assert.match(session.token, /^hm1_[A-Za-z0-9_-]{43}$/);
    assert.equal(session.user.storeId, 23);
    assert.equal(session.user.allStores, false);
    assert(session.user.permissions.includes("vehicles.read"));
    assert(!session.user.permissions.includes("finance.read"));
    assert(!JSON.stringify(statements).includes(session.token));
    assert.equal(sessions.size, 1);
    assert.equal(
      (await handler.GET(request("GET", session.token))).status,
      200,
    );
    checks.push(
      "Native login issues an opaque 8-hour session, stores only its hash, and projects current grants without cookies",
    );

    assert.equal(
      (
        await handler.GET(
          request("GET", undefined, undefined, {
            cookie: `himoto_management_session=${session.token}`,
          }),
        )
      ).status,
      401,
    );
    for (const token of [
      "",
      "hm1_" + "x".repeat(43),
      session.token + "x",
      session.token + ".extra",
    ])
      assert.equal((await handler.GET(request("GET", token))).status, 401);
    assert.equal(
      (
        await handler.POST(
          request("POST", undefined, credentials, {
            origin: "https://hostile.example",
          }),
        )
      ).status,
      403,
    );
    process.env.HIMOTO_MOBILE_ENABLED = "false";
    assert.equal(
      (await handler.GET(request("GET", session.token))).status,
      503,
    );
    process.env.HIMOTO_MOBILE_ENABLED = "true";
    assert.throws(
      () =>
        mobile.assertMobileRequest(
          new NextRequest("http://himoto.example/api/mobile/v1/session"),
        ),
      (error) => error.status === 403,
    );
    checks.push(
      "Disabled feature, HTTP, browser origins, cookies and malformed/unrecognized bearer tokens fail closed",
    );

    assert.equal(
      (await handler.POST(request("POST", undefined, "{"))).status,
      400,
    );
    assert.equal(
      (await handler.POST(request("POST", undefined, " ".repeat(4097)))).status,
      413,
    );
    assert.equal(
      (
        await handler.POST(
          request("POST", undefined, { ...credentials, platform: "web" }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await handler.POST(
          request("POST", undefined, { ...credentials, password: "wrong" }),
        )
      ).status,
      401,
    );
    for (let i = 0; i < 10; i++)
      await mobile.consumeMobileLoginAttempt("throttle@example.invalid");
    await assert.rejects(
      mobile.consumeMobileLoginAttempt("THROTTLE@example.invalid"),
      (error) => error.status === 429,
    );
    assert(
      statements.some(({ sql }) =>
        sql.includes("ON CONFLICT (bucket_hash) DO UPDATE"),
      ),
    );
    checks.push(
      "Login bounds streamed bodies, rejects invalid credentials/platforms and uses an atomic shared database throttle",
    );

    account = { ...account, access_enabled: false };
    assert.equal(
      (await handler.GET(request("GET", session.token))).status,
      401,
    );
    account = {
      ...account,
      access_enabled: true,
      management_password_version: 1,
    };
    assert.equal(
      (await handler.GET(request("GET", session.token))).status,
      401,
    );
    account = {
      ...account,
      management_password_version: 0,
      permissions: ["customers.read"],
    };
    assert(
      !(
        await (await handler.GET(request("GET", session.token))).json()
      ).user.permissions.includes("contracts.read"),
    );
    const saved = sessions.get(mobile.tokenHash(session.token));
    saved.expires_at = new Date(Date.now() - 1).toISOString();
    assert.equal(
      (await handler.GET(request("GET", session.token))).status,
      401,
    );
    saved.expires_at = session.expiresAt;
    checks.push(
      "Every request rechecks account disabling, password changes, permissions and session expiry",
    );

    const catalogue = load(path.join(root, "lib/server/mobile-catalogue"));
    const table = load(path.join(root, "lib/server/management-table"));
    const { dataAccess } = load(path.join(root, "lib/server/access-context"));
    const originalRead = table.readManagementTable;
    const raw = {
      id: 11,
      code: "HD-QA",
      name: "QA",
      customer_name: "Fixture Customer",
      customer_phone: "0900000000",
      status: "renting",
      store_id: 23,
      store_name: "QA Branch",
      license: "QA-000",
      total_amount: 500000,
      paid_amount: 100000,
      draft_payload: "PRIVATE",
      customer_id_card: "PRIVATE",
      gps_latitude: 10,
    };
    const actor = {
      id: 7,
      name: account.name,
      email: account.email,
      role: "staff",
      role_slug: "nhan-vien",
      access_role: "branch_staff",
      store_id: 23,
      scope_all: false,
      permissions: ["contracts.read"],
    };
    let lastScope;
    let failRead = false;
    let released = 0;
    const transactions = [];
    const client = {
      query: async (sql) => {
        transactions.push(sql);
        return { rows: [] };
      },
      release: () => {
        released++;
      },
    };
    Object.defineProperty(db.himotoPool, "connect", {
      configurable: true,
      value: async () => client,
    });
    Object.defineProperty(db.himotoPool, "query", {
      configurable: true,
      value: async () => {
        lastScope = dataAccess.getStore();
        return { rows: [] };
      },
    });
    table.readManagementTable = async (_client, _kind, params) => {
      lastScope = dataAccess.getStore();
      assert.notEqual(params.get("all"), "1");
      if (failRead) throw Error("Fixture DB failure");
      return {
        rows: [raw],
        total: 1,
        page: 1,
        pages: 1,
        statusCounts: [["renting", 1]],
      };
    };
    try {
      const page = await catalogue.readMobilePage(
        actor,
        "contracts",
        new URLSearchParams("size=20"),
      );
      assert.equal(page.rows[0].name, raw.customer_name);
      assert.equal(lastScope.store_id, 23);
      assert.equal(lastScope.scope_all, false);
      assert.equal(lastScope.operation, "");
      for (const field of [
        "draft_payload",
        "customer_id_card",
        "gps_latitude",
        "password",
      ])
        assert(!JSON.stringify(page).includes(field));
      await catalogue.readMobilePage(actor, "vehicles", new URLSearchParams());
      assert.equal(lastScope.operation, "fleet_read");
      assert.equal(lastScope.scope_all, false);
      await assert.rejects(
        catalogue.readMobilePage({ ...actor, permissions: [] }, "contracts", new URLSearchParams()),
        (error) => error.status === 403,
      );
      await assert.rejects(
        catalogue.readMobileRecord(actor, "vehicles", "1 OR 1=1"),
        (error) => error.status === 400,
      );
      await assert.rejects(
        catalogue.readMobileRecord(actor, "vehicles", "999"),
        (error) => error.status === 404,
      );
      assert.throws(
        () => catalogue.catalogueKind("staff"),
        (error) => error.status === 404,
      );
      for (const query of [
        "all=1",
        "filter_id=1",
        "store=1&store=2",
        "status=x%27",
        "search=" + "x".repeat(121),
      ])
        assert.throws(
          () => catalogue.mobileTableParams(new URLSearchParams(query)),
          (error) => error.status === 400,
        );
      failRead = true;
      await assert.rejects(
        catalogue.readMobilePage(actor, "vehicles", new URLSearchParams()),
      );
      assert(transactions.includes("ROLLBACK"));
      assert.equal(released, 3);
    } finally {
      table.readManagementTable = originalRead;
    }
    checks.push(
      "Catalogue reads preserve branch scope and fleet policy, enforce grants, strip private fields, reject unbounded filters and roll back failed reads",
    );

    assert.equal(
      (await handler.DELETE(request("DELETE", session.token))).status,
      200,
    );
    assert.equal(
      (await handler.GET(request("GET", session.token))).status,
      401,
    );
    Object.defineProperty(db.ownerDatabase, "query", {
      configurable: true,
      value: async () => {
        throw Object.assign(
          new Error("private token and SQL must stay hidden"),
          { code: "42P01" },
        );
      },
    });
    response = await handler.GET(request("GET", session.token));
    assert.equal(response.status, 503);
    assert(!JSON.stringify(await response.json()).includes("private"));
    checks.push(
      "Logout revokes the server session; outages and missing migration return a sanitized retryable error",
    );

    const mobileRoot = path.resolve(root, "../mobile/src/lib");
    const api = load(path.join(mobileRoot, "api"));
    const codec = load(path.join(mobileRoot, "session-codec"));
    for (const value of [
      undefined,
      "http://example.com",
      "https://user:secret@example.com",
      "https://example.com/path",
      "https://example.com?token=secret",
      "file:///tmp",
    ])
      assert.throws(() => api.apiOrigin(value));
    assert.equal(
      api.apiOrigin("http://10.0.2.2:3000", true),
      "http://10.0.2.2:3000",
    );
    const encoded = JSON.stringify({
      ...session,
      origin: "https://himoto.example",
    });
    assert.equal(
      codec.decodeStoredSession(encoded, "https://himoto.example").token,
      session.token,
    );
    assert.equal(
      codec.decodeStoredSession(encoded, "https://another.example"),
      null,
    );
    assert.equal(
      codec.decodeStoredSession(
        encoded,
        "https://himoto.example",
        Date.parse(session.expiresAt),
      ),
      null,
    );
    assert.equal(
      codec.decodeStoredSession("{", "https://himoto.example"),
      null,
    );
    const fetch = global.fetch;
    let expired = 0;
    try {
      global.fetch = async (url, options) => {
        assert.match(url, /^https:\/\/himoto.example\/api\/mobile\/v1\//);
        assert.equal(options.headers.Authorization, `Bearer ${session.token}`);
        assert.equal(options.credentials, "omit");
        assert.equal(options.redirect, "error");
        return new Response(
          JSON.stringify({ message: "Expired", code: "SESSION_EXPIRED" }),
          { status: 401 },
        );
      };
      await assert.rejects(
        api
          .createApi("https://himoto.example", session.token, () => expired++)
          .session(),
        (error) => error.status === 401,
      );
      assert.equal(expired, 1);
      global.fetch = async () => {
        throw Error("network failure");
      };
      await assert.rejects(
        api.createApi("https://himoto.example").session(),
        (error) => error.code === "NETWORK",
      );
      global.fetch = async () =>
        new Response(
          JSON.stringify({ user: { id: 7 }, expiresAt: "invalid" }),
          { status: 200 },
        );
      await assert.rejects(
        api.createApi("https://himoto.example").session(),
        (error) => error.code === "INVALID_RESPONSE",
      );
      global.fetch = async () =>
        new Response(JSON.stringify({ rows: [{ id: 1 }], total: 1 }), {
          status: 200,
        });
      await assert.rejects(
        api
          .createApi("https://himoto.example")
          .catalogue("vehicles", "size=20"),
        (error) => error.code === "INVALID_RESPONSE",
      );
    } finally {
      global.fetch = fetch;
    }
    checks.push(
      "Mobile client isolates tokens by origin, rejects insecure endpoints, omits browser credentials, handles 401 and reports network failures",
    );

    // Slow native deletion followed by a new sign-in must preserve the new token.
    const fs = require("node:fs");
    const ts = require("typescript");
    let nativeValue = null;
    let finishDelete;
    const order = [];
    const secureStore = {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "device-only",
      getItemAsync: async () => nativeValue,
      setItemAsync: async (_key, value, options) => {
        assert.equal(options.keychainAccessible, "device-only");
        order.push("save");
        nativeValue = value;
      },
      deleteItemAsync: () =>
        new Promise((resolve) => {
          order.push("delete");
          finishDelete = () => {
            nativeValue = null;
            resolve();
          };
        }),
    };
    const storageModule = { exports: {} };
    const storageSource = ts.transpileModule(
      fs.readFileSync(path.join(mobileRoot, "session-store.ts"), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText;
    new Function("require", "module", "exports", storageSource)(
      (name) =>
        name === "expo-secure-store"
          ? secureStore
          : name === "react-native"
            ? { Platform: { OS: "ios" } }
            : name === "./session-codec"
              ? codec
              : (() => {
                  throw Error("Unexpected module");
                })(),
      storageModule,
      storageModule.exports,
    );
    const storage = storageModule.exports.sessionStore;
    const clearing = storage.clear();
    const saving = storage.save(session, "https://himoto.example");
    await Promise.resolve();
    assert.deepEqual(order, ["delete"]);
    finishDelete();
    await Promise.all([clearing, saving]);
    assert.deepEqual(order, ["delete", "save"]);
    assert.equal(
      (await storage.read("https://himoto.example")).token,
      session.token,
    );
    const apiClient = api.createApi("https://himoto.example", session.token);
    let staleExpired = 0;
    const unsubscribe = apiClient.onSessionExpired(() => staleExpired++);
    unsubscribe();
    try {
      global.fetch = async () => new Response("{}", { status: 401 });
      await assert.rejects(apiClient.session());
      assert.equal(staleExpired, 0);
    } finally {
      global.fetch = fetch;
    }
    checks.push(
      "Secure storage serializes a delayed delete before a new login and detached clients cannot fire stale expiry callbacks",
    );
    console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
  } finally {
    Object.defineProperty(db.ownerDatabase, "query", queryDescriptor);
    Object.defineProperty(db.himotoPool, "connect", connectDescriptor);
    Object.defineProperty(db.himotoPool, "query", webQueryDescriptor);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
