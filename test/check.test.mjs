import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OPTIONAL_TOOLS,
  REQUIRED_TOOLS,
  check,
  gatewayFromConfig,
  gatewayUrlProblem,
  parseEnvFile,
  parseRpcReply,
  percentEncode,
  signRpc,
} from "../skills/rakazo-wuying/scripts/check.mjs";

const SECRET = "test-secret-value";
const TOKEN = "test-gateway-token";
const settings = {
  accessKeyId: "test-key-id",
  accessKeySecret: SECRET,
  regionId: "cn-hangzhou",
  desktopId: "ecd-test",
  endUserId: "alice",
  mcpUrl: "https://gw-test.cn-hangzhou.example.com:8019/mcp",
  mcpToken: TOKEN,
};
const ALL_TOOLS = [...REQUIRED_TOOLS, ...OPTIONAL_TOOLS].map((tool) => `wuying-system-tool__${tool}`);

/** A fake Alibaba Cloud and MCP gateway. */
function fakeCloud({ status = "Running", users = ["alice"], tools = ALL_TOOLS, rpcError, sse = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const target = new URL(url);
    if (target.hostname.endsWith("aliyuncs.com")) {
      const form = new URLSearchParams(init.body);
      calls.push(form.get("Action"));
      assert.ok(form.get("Signature"));
      if (rpcError?.[form.get("Action")])
        return Response.json({ Code: rpcError[form.get("Action")], Message: "account 123 denied" }, { status: 403 });
      if (form.get("Action") === "DescribeDesktops") {
        assert.equal(target.hostname, "ecd.cn-hangzhou.aliyuncs.com");
        return Response.json({
          Desktops: [{ DesktopId: form.get("DesktopId.1"), DesktopStatus: status, OsType: "Windows", EndUserIds: users }],
        });
      }
      return Response.json({ AuthModel: { AuthCode: "code" } });
    }
    if (init.method === "DELETE") return new Response(null, { status: 200 });
    if (init.headers.Authorization !== `Bearer ${TOKEN}`) return new Response("no", { status: 401 });
    const message = JSON.parse(init.body);
    calls.push(message.method);
    if (!("id" in message)) return new Response(null, { status: 202 });
    const result =
      message.method === "initialize"
        ? { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "fake" } }
        : message.method === "tools/list"
          ? { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) }
          : { content: [{ type: "text", text: "C:\\Users\\alice" }] };
    const reply = JSON.stringify({ jsonrpc: "2.0", id: message.id, result });
    return sse
      ? new Response(`event: message\ndata: ${reply}\n\n`, {
          headers: { "content-type": "text/event-stream", "mcp-session-id": "s1" },
        })
      : new Response(reply, { headers: { "content-type": "application/json", "mcp-session-id": "s1" } });
  };
  return { fetchImpl, calls };
}

async function run(options, overrides = {}) {
  const cloud = fakeCloud(options);
  const lines = [];
  const ok = await check({ ...settings, ...overrides }, { fetchImpl: cloud.fetchImpl, log: (line) => lines.push(line) });
  const output = lines.join("\n");
  assert.ok(!output.includes(SECRET) && !output.includes(TOKEN), "never prints a secret");
  return { ok, output, calls: cloud.calls };
}

test("signs requests the way Alibaba Cloud's SDK does", () => {
  // Expected values were produced by @alicloud/openapi-core's getRPCSignature.
  const params = {
    AccessKeyId: "testid",
    Action: "DescribeDesktops",
    Format: "JSON",
    RegionId: "cn-hangzhou",
    "DesktopId.1": "ecd-test*(x)!'~ 中",
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: "3ee8c1b8-83d3-44af-a94f-4e0ad82fd6cf",
    SignatureVersion: "1.0",
    Timestamp: "2016-02-23T12:46:24Z",
    Version: "2020-09-30",
  };
  const signature = (method) => decodeURIComponent(signRpc(method, params, "testsecret").split("&Signature=")[1]);
  assert.equal(signature("POST"), "THeCYMZKjPGSP8WVfocCZLfgr5s=");
  assert.equal(signature("GET"), "vnC1rBHnQGCL4yN5i+UtRjyglA4=");
  assert.equal(percentEncode("a b*~!'()"), "a%20b%2A~%21%27%28%29");
});

test("passes a running desktop with a working gateway", async () => {
  const { ok, output, calls } = await run();
  assert.equal(ok, true);
  assert.match(output, /Desktop found: Running, Windows/);
  assert.match(output, /runs commands through the gateway/);
  assert.deepEqual(calls, ["DescribeDesktops", "GetAuthCode", "initialize", "notifications/initialized", "tools/list", "tools/call"]);
});

test("reads gateway replies sent as an event stream", async () => {
  assert.equal((await run({ sse: true })).ok, true);
});

test("passes a stopped desktop without touching the gateway", async () => {
  const { ok, output, calls } = await run({ status: "Stopped" });
  assert.equal(ok, true);
  assert.match(output, /gateway was not checked/);
  assert.ok(!calls.includes("initialize"));
});

test("names a missing permission without echoing the cloud's message", async () => {
  const { ok, output } = await run({ rpcError: { GetAuthCode: "Forbidden.RAM" } });
  assert.equal(ok, false);
  assert.match(output, /screen login \(Forbidden\.RAM\)/);
  assert.match(output, /ram-policy\.json/);
  assert.ok(!output.includes("account 123"));
});

test("flags an end user the desktop is not assigned to", async () => {
  const { ok, output, calls } = await run({ users: ["bob"] });
  assert.equal(ok, false);
  assert.match(output, /not assigned to end user "alice"/);
  assert.ok(!calls.includes("GetAuthCode"));
});

test("flags a wrong token and missing tools", async () => {
  assert.match((await run({}, { mcpToken: "other" })).output, /refused the token/);
  const missing = await run({ tools: ALL_TOOLS.filter((name) => !name.endsWith("process_exec")) });
  assert.equal(missing.ok, false);
  assert.match(missing.output, /lacks process_exec/);
  const bare = await run({ tools: [...REQUIRED_TOOLS, ...OPTIONAL_TOOLS] });
  assert.match(bare.output, /without the wuying-system-tool__ prefix/);
});

test("rejects a gateway Rakazo would not save", async () => {
  assert.match(gatewayUrlProblem("http://gw.example.com/mcp"), /https/);
  assert.match(gatewayUrlProblem("https://192.168.1.5/mcp"), /public/);
  assert.match(gatewayUrlProblem("https://localhost:8019/mcp"), /public/);
  assert.equal(gatewayUrlProblem(settings.mcpUrl), null);
  const { ok, calls } = await run({}, { regionId: "Hangzhou" });
  assert.equal(ok, false);
  assert.deepEqual(calls, []);
});

test("reads the gateway config Wuying delivers", () => {
  assert.deepEqual(
    gatewayFromConfig({
      mcpServers: { desk: { url: "https://gw.example.com/mcp", headers: { Authorization: "Bearer abc" } } },
    }),
    { url: "https://gw.example.com/mcp", token: "abc" },
  );
  assert.throws(() => gatewayFromConfig({ mcpServers: {} }), /exactly one/);
});

test("parses env files and event streams", () => {
  assert.deepEqual(parseEnvFile("# note\nexport A=1\nB = \"two words\"\nC='x'\n"), { A: "1", B: "two words", C: "x" });
  assert.deepEqual(
    parseRpcReply('data: {"jsonrpc":"2.0","method":"ping"}\n\ndata: {"jsonrpc":"2.0","id":2,"result":{"ok":true}}\n\n', "text/event-stream", 2),
    { ok: true },
  );
  assert.throws(() => parseRpcReply('{"jsonrpc":"2.0","id":1,"error":{"code":-32601}}', "application/json", 1), /refused -32601/);
});
