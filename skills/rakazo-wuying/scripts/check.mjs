#!/usr/bin/env node
// Checks a Wuying cloud computer the way Rakazo's Settings → Computer → Wuying does before saving,
// and says which part failed. No dependencies; Node 18+. Never prints secrets.
//
//   node check.mjs --env-file wuying.env
//
// Reads WUYING_ACCESS_KEY_ID, WUYING_ACCESS_KEY_SECRET, WUYING_REGION_ID (default cn-hangzhou),
// WUYING_DESKTOP_ID, WUYING_END_USER_ID, WUYING_MCP_URL and WUYING_MCP_TOKEN. WUYING_MCP_CONFIG may
// point at the gateway's MCP client JSON ({"mcpServers": {...}}) instead of the last two.
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";

const TIMEOUT_MS = 15_000;
const TOOL_PREFIX = "wuying-system-tool__";
/** Tools Rakazo cannot work without. */
export const REQUIRED_TOOLS = [
  "process_exec",
  "env_get",
  "fs_read",
  "fs_write",
  "fs_list",
  "fs_info",
  "fs_mkdir",
  "fs_delete",
  "screen_capture",
  "input_mouse",
  "input_keyboard",
  "input_text",
  "app_start",
];
/** Tools Rakazo uses for window and cursor details; it still runs without them. */
export const OPTIONAL_TOOLS = [
  "app_stop",
  "cursor_position",
  "window_list",
  "window_active",
  "window_update",
];

/** Alibaba Cloud RPC percent-encoding (RFC 3986). */
export function percentEncode(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Signs an Alibaba Cloud RPC request (signature version 1.0, HMAC-SHA1). */
export function signRpc(method, params, accessKeySecret) {
  const query = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
  const stringToSign = `${method}&${percentEncode("/")}&${percentEncode(query)}`;
  const signature = createHmac("sha1", `${accessKeySecret}&`).update(stringToSign).digest("base64");
  return `${query}&Signature=${percentEncode(signature)}`;
}

export async function callRpc(
  { endpoint, version, action, params },
  { accessKeyId, accessKeySecret },
  fetchImpl = fetch,
) {
  const body = signRpc(
    "POST",
    {
      ...params,
      Action: action,
      Version: version,
      Format: "JSON",
      AccessKeyId: accessKeyId,
      SignatureMethod: "HMAC-SHA1",
      SignatureVersion: "1.0",
      SignatureNonce: randomUUID(),
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    },
    accessKeySecret,
  );
  const response = await fetchImpl(`https://${endpoint}/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await response.json().catch(() => ({}));
  // Only the error code is kept: Alibaba Cloud messages can name the account and principal.
  if (!response.ok || data.Code) throw new ApiError(action, data.Code ?? `HTTP ${response.status}`);
  return data;
}

export class ApiError extends Error {
  constructor(action, code) {
    super(`${action}: ${code}`);
    this.action = action;
    this.code = code;
  }
}

const FIXES = [
  [/^InvalidAccessKeyId/, "The AccessKey ID is wrong or deleted. Copy it again from the RAM user."],
  [/^SignatureDoesNotMatch|^IncompleteSignature/, "The AccessKey secret does not match the ID."],
  [
    /^Forbidden|NoPermission|^NotAuthorized|AccessDenied/,
    "The RAM user is missing this permission. Attach the policy in references/ram-policy.json.",
  ],
  [/Region|InvalidEndpoint|ENOTFOUND/, "Check WUYING_REGION_ID, for example cn-hangzhou or cn-shanghai."],
  [/EndUser/, "Check the end user ID: it is the user name the desktop is assigned to."],
];

export function fixFor(code) {
  return FIXES.find(([pattern]) => pattern.test(code))?.[1];
}

/** Reads the gateway URL and bearer token out of an MCP client config, as Wuying delivers it. */
export function gatewayFromConfig(json) {
  const servers = json.mcpServers ?? json.servers ?? {};
  const entries = Object.values(servers).filter((server) => server && (server.url || server.serverUrl));
  if (entries.length !== 1) throw new Error("The MCP config must hold exactly one server with a url");
  const server = entries[0];
  const header = Object.entries(server.headers ?? {}).find(
    ([name]) => name.toLowerCase() === "authorization",
  )?.[1];
  const token = typeof header === "string" ? header.replace(/^Bearer\s+/i, "") : "";
  return { url: server.url ?? server.serverUrl, token };
}

function isPrivateHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (isIP(host) === 6) return host === "::1" || /^(fc|fd|fe80)/.test(host);
  return false;
}

/** Rakazo only saves a gateway on a public HTTPS address. */
export function gatewayUrlProblem(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return "The MCP gateway URL is not a URL.";
  }
  if (url.protocol !== "https:") return "The MCP gateway URL must start with https://.";
  if (isPrivateHost(url.hostname))
    return "The MCP gateway URL must be a public address, not one inside the desktop or your network.";
  return null;
}

/** Reads one JSON-RPC response from a Streamable HTTP reply, plain JSON or an SSE stream. */
export function parseRpcReply(text, contentType, id) {
  const messages = contentType.includes("text/event-stream")
    ? text
        .split(/\r?\n\r?\n/)
        .map((event) =>
          event
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n"),
        )
        .filter(Boolean)
        .flatMap((data) => {
          try {
            return [JSON.parse(data)];
          } catch {
            return [];
          }
        })
    : [JSON.parse(text)].flat();
  const reply = messages.find((message) => message.id === id);
  if (!reply) throw new Error("The gateway sent no reply");
  if (reply.error) throw new Error(`The gateway refused ${reply.error.code ?? "the request"}`);
  return reply.result;
}

export class Gateway {
  constructor({ url, token }, fetchImpl = fetch) {
    this.url = url;
    this.token = token;
    this.fetch = fetchImpl;
    this.id = 0;
  }

  async send(method, params, notification = false) {
    const id = notification ? undefined : ++this.id;
    const response = await this.fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${this.token}`,
        ...(this.session ? { "Mcp-Session-Id": this.session } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", method, ...(params ? { params } : {}), ...(id ? { id } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    this.session = response.headers.get("mcp-session-id") ?? this.session;
    if (response.status === 401 || response.status === 403) throw new Error("token");
    if (!response.ok && !(notification && response.status === 202))
      throw new Error(`HTTP ${response.status}`);
    if (notification) return undefined;
    return parseRpcReply(await response.text(), response.headers.get("content-type") ?? "", id);
  }

  async connect() {
    await this.send("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "rakazo-wuying-check", version: "1.0.0" },
    });
    await this.send("notifications/initialized", undefined, true);
  }

  async toolNames() {
    const names = [];
    let cursor;
    do {
      const result = await this.send("tools/list", cursor ? { cursor } : {});
      names.push(...(result.tools ?? []).map((tool) => tool.name));
      cursor = result.nextCursor;
    } while (cursor && names.length < 2000);
    return names;
  }

  callTool(name, args) {
    return this.send("tools/call", { name, arguments: args });
  }

  async close() {
    if (!this.session) return;
    await this.fetch(this.url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.token}`, "Mcp-Session-Id": this.session },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => undefined);
  }
}

export function parseEnvFile(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

export function readSettings(env) {
  const settings = {
    accessKeyId: env.WUYING_ACCESS_KEY_ID ?? "",
    accessKeySecret: env.WUYING_ACCESS_KEY_SECRET ?? "",
    regionId: env.WUYING_REGION_ID || "cn-hangzhou",
    desktopId: env.WUYING_DESKTOP_ID ?? "",
    endUserId: env.WUYING_END_USER_ID ?? "",
    mcpUrl: env.WUYING_MCP_URL ?? "",
    mcpToken: env.WUYING_MCP_TOKEN ?? "",
  };
  if (env.WUYING_MCP_CONFIG && !(settings.mcpUrl && settings.mcpToken)) {
    const gateway = gatewayFromConfig(JSON.parse(readFileSync(env.WUYING_MCP_CONFIG, "utf8")));
    settings.mcpUrl ||= gateway.url;
    settings.mcpToken ||= gateway.token;
  }
  return settings;
}

const NAMES = {
  accessKeyId: "WUYING_ACCESS_KEY_ID",
  accessKeySecret: "WUYING_ACCESS_KEY_SECRET",
  desktopId: "WUYING_DESKTOP_ID",
  endUserId: "WUYING_END_USER_ID",
  mcpUrl: "WUYING_MCP_URL",
  mcpToken: "WUYING_MCP_TOKEN",
};

/** Runs every check in order and reports each one. Returns true when Rakazo will accept it. */
export async function check(settings, { fetchImpl = fetch, log = console.log } = {}) {
  const pass = (text) => log(`✓ ${text}`);
  const fail = (text, fix) => {
    log(`✗ ${text}${fix ? `\n  → ${fix}` : ""}`);
    return false;
  };

  const missing = Object.keys(NAMES).filter((key) => !settings[key]);
  if (missing.length)
    return fail(`Missing ${missing.map((key) => NAMES[key]).join(", ")}`, "Add them to the env file.");
  if (!/^[a-z]+(-[a-z0-9]+)+$/.test(settings.regionId))
    return fail(`Region "${settings.regionId}" is not a region ID`, "Use one like cn-hangzhou.");
  const urlProblem = gatewayUrlProblem(settings.mcpUrl);
  if (urlProblem) return fail(urlProblem);

  const keys = { accessKeyId: settings.accessKeyId, accessKeySecret: settings.accessKeySecret };
  let desktop;
  try {
    const data = await callRpc(
      {
        endpoint: `ecd.${settings.regionId}.aliyuncs.com`,
        version: "2020-09-30",
        action: "DescribeDesktops",
        params: { RegionId: settings.regionId, "DesktopId.1": settings.desktopId },
      },
      keys,
      fetchImpl,
    );
    desktop = data.Desktops?.find((entry) => entry.DesktopId === settings.desktopId);
  } catch (error) {
    return fail(`Could not read the desktop (${error.code ?? error.cause?.code ?? error.message})`, fixFor(String(error.code ?? error.cause?.code ?? error.message)));
  }
  if (!desktop)
    return fail(
      `Desktop ${settings.desktopId} was not found in ${settings.regionId}`,
      "Check the desktop ID (it starts with ecd-) and that the region is the one it was created in.",
    );
  pass(`Desktop found: ${desktop.DesktopStatus}${desktop.OsType ? `, ${desktop.OsType}` : ""}`);
  if (desktop.OsType && !/windows/i.test(desktop.OsType))
    return fail("The desktop is not Windows", "Rakazo runs Wuying computers on Windows desktops only.");
  const users = desktop.EndUserIds ?? [];
  if (users.length && !users.includes(settings.endUserId))
    return fail(
      `The desktop is not assigned to end user "${settings.endUserId}"`,
      `Use the user it is assigned to, or assign it in the Wuying console. Assigned: ${users.join(", ")}`,
    );

  try {
    const data = await callRpc(
      {
        endpoint: "appstream-center.aliyuncs.com",
        version: "2021-02-18",
        action: "GetAuthCode",
        params: { EndUserId: settings.endUserId },
      },
      keys,
      fetchImpl,
    );
    if (!data.AuthModel?.AuthCode) return fail("Wuying issued no screen login code");
    pass("Screen login works");
  } catch (error) {
    return fail(`Could not issue a screen login (${error.code ?? error.message})`, fixFor(String(error.code ?? error.message)));
  }

  if (desktop.DesktopStatus !== "Running") {
    log(
      `! The desktop is ${desktop.DesktopStatus}, so the MCP gateway was not checked. Rakazo saves it anyway and ` +
        "starts the desktop when a bot needs it. Start it in the Wuying console and run this again to check the gateway too.",
    );
    return true;
  }

  const gateway = new Gateway({ url: settings.mcpUrl, token: settings.mcpToken }, fetchImpl);
  try {
    try {
      await gateway.connect();
    } catch (error) {
      if (error.message === "token")
        return fail("The MCP gateway refused the token", "Copy the token after \"Bearer \" in the gateway config again.");
      return fail(
        `Could not reach the MCP gateway (${error.cause?.code ?? error.message})`,
        "Check the URL is the full one from the gateway config, ending in /mcp, and that the desktop is running.",
      );
    }
    pass("MCP gateway answers");
    const names = new Set(await gateway.toolNames());
    const absent = REQUIRED_TOOLS.filter((tool) => !names.has(TOOL_PREFIX + tool));
    if (absent.length) {
      const bare = absent.filter((tool) => names.has(tool));
      return fail(
        `The gateway lacks ${absent.join(", ")}`,
        bare.length
          ? `It names them without the ${TOOL_PREFIX} prefix Rakazo calls. Ask for a gateway that serves wuying-system-tool.`
          : "Ask for a gateway that serves the wuying-system-tool tools.",
      );
    }
    const extra = OPTIONAL_TOOLS.filter((tool) => !names.has(TOOL_PREFIX + tool));
    pass(`Gateway serves the desktop tools${extra.length ? ` (without ${extra.join(", ")}; window details are limited)` : ""}`);
    const result = await gateway.callTool(`${TOOL_PREFIX}env_get`, { name: "USERPROFILE" });
    if (result?.isError) return fail("The desktop could not run a tool through the gateway");
    pass("The desktop runs commands through the gateway");
  } catch (error) {
    return fail(`The gateway stopped answering (${error.cause?.code ?? error.message})`);
  } finally {
    await gateway.close();
  }
  return true;
}

async function main(argv) {
  const at = argv.indexOf("--env-file");
  const fileEnv = at >= 0 ? parseEnvFile(readFileSync(argv[at + 1], "utf8")) : {};
  let settings;
  try {
    settings = readSettings({ ...fileEnv, ...process.env });
  } catch (error) {
    console.log(`✗ ${error.message}`);
    return 1;
  }
  const ok = await check(settings);
  console.log(ok ? "\nReady: enter these values in Rakazo → Settings → Computer → Wuying." : "\nNot ready yet.");
  return ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = await main(process.argv.slice(2));
