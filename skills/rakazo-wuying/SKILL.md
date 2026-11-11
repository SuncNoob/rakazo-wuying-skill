---
name: rakazo-wuying
description: Connect a person's own Wuying (无影) Windows cloud computer to their Rakazo account so their bots work on it. Use when someone wants Rakazo bots on "my own Wuying", "我自己的无影云电脑", asks how to fill Rakazo's Settings → Computer → Wuying form (desktop ID, end user ID, AccessKey, gateway URL and token), gets "Could not save computer settings / 无法保存电脑设置" there, or needs the RAM permissions for it.
---

# Connect your own Wuying computer to Rakazo

Goal: the person's bots run commands, use files, see the screen and use the mouse and keyboard on
**their own** Wuying Windows cloud computer, and they can watch it in Rakazo. It is set per account
in **Settings → Computer** (设置 → 电脑) and nobody else can read the saved keys.

Talk to the person in their language. Rakazo's UI is often in Chinese; the Chinese labels are given
in brackets.

## Rules for secrets

- Never ask for the AccessKey secret or the gateway token in chat, and never print, log or commit
  them. They go into a local file only the person reads (step 4) and into Rakazo's form, which
  they fill in themselves.
- If the person pastes a secret into chat anyway, use it only for the check, then tell them to
  rotate it once it works (a new AccessKey in RAM, a new gateway token from Wuying).
- The RAM user gets exactly the four actions in `references/ram-policy.json`, nothing more.

## Step 1 · Can this Rakazo take your own computer?

Ask for the Rakazo address they use (for example `https://rakazo.com.cn`), then have them open it,
click their avatar at the bottom-left, then **Settings** (设置), then **Computer** (电脑).

- They see **New computers run on** (新电脑运行于), with **Wuying**: continue. Admins see the
  deployment's form first and expand **My computers** (我的电脑) below it. That lower form is
  theirs; the upper one changes every account's computers, so leave it alone.
- No Computer section, or saving says the deployment cannot use account computer settings: the
  Rakazo operator has to turn it on. On a self-hosted Rakazo that means `COMPUTER_SETTINGS_ENABLED=true`
  on the API and a `SANDBOX_PROVIDER` other than `desktop` or `fake`. Stop here until that's done.

Tell them up front what they get: bots on their **shared computer** (the default, 团队电脑) move to
their desktop the next time it starts. Bots switched to **their own computer** (拥有专属电脑的 Bot)
keep using the deployment's computers.

## Step 2 · The Wuying desktop

In the Wuying console (无影云电脑控制台) they need:

1. A **Windows** cloud computer. Note its **desktop ID** (starts with `ecd-`) and its **region**
   (for example `cn-hangzhou`, `cn-shanghai`; it is shown with the desktop).
2. The desktop **assigned to an end user** (终端用户), for example a convenience account (便捷账号).
   Note the **end user ID**, the user name it is assigned to. Screen logins are issued for this user.

## Step 3 · An AccessKey that can only do this

In RAM (访问控制, ram.console.aliyun.com):

1. Create a RAM user with **OpenAPI access** (OpenAPI 调用访问) and save its AccessKey ID and secret.
2. Create a custom policy (创建权限策略 → 脚本编辑) from `references/ram-policy.json`, and grant
   it to that user. It allows only reading the desktop, starting and stopping it, and issuing a
   screen login.

Use a RAM user, never the account's main AccessKey.

## Step 4 · The desktop's MCP gateway

Wuying delivers each desktop's MCP gateway as a client config like this:

```json
{
  "mcpServers": {
    "<name>": {
      "url": "https://gw-<id>.<region>.aigclinks.com:8019/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

The **gateway URL** is the `url`. The **gateway token** is what follows `Bearer `. The gateway must
serve the `wuying-system-tool` tools; the check below confirms it. If they don't have a config,
they get it from whoever provisioned the desktop or their Wuying contact; it can't be made
from the console steps above.

## Step 5 · Check everything before Rakazo does

Rakazo checks the same things on Save but only says it could not save. This check says which part
is wrong. It needs Node.js 18+ and no install.

Have the person create `wuying.env` next to them, readable only by them (`chmod 600 wuying.env`),
and fill it in **in their own editor**:

```bash
WUYING_DESKTOP_ID=ecd-...
WUYING_END_USER_ID=...
WUYING_REGION_ID=cn-hangzhou
WUYING_ACCESS_KEY_ID=...
WUYING_ACCESS_KEY_SECRET=...
WUYING_MCP_URL=https://...
WUYING_MCP_TOKEN=...
```

Instead of the last two, `WUYING_MCP_CONFIG=/path/to/mcp.json` reads the gateway config file as is.
Then run the script that ships with this skill:

```bash
node <this skill's folder>/scripts/check.mjs --env-file wuying.env
```

It reads the desktop, issues a screen login, and, when the desktop is running, connects to the
gateway, lists its tools and runs one harmless call (reads `USERPROFILE`). It prints ✓ or ✗ per
step with the fix, and never prints a secret. Fix and rerun until it says **Ready**.

| ✗ says | Fix |
| --- | --- |
| `SignatureDoesNotMatch` / `InvalidAccessKeyId` | Recopy the AccessKey ID and secret from the RAM user |
| `Forbidden.RAM` or another permission code | Grant `references/ram-policy.json` to the RAM user |
| Desktop not found | Wrong desktop ID, or the region is not the one it was created in |
| `ENOTFOUND` | The region ID is misspelled |
| Not assigned to end user | Use the user it is assigned to, or assign it in the Wuying console |
| Gateway refused the token | Recopy the token after `Bearer ` |
| Could not reach the gateway | Use the full URL from the config, ending in `/mcp`; the desktop must be running |
| Gateway lacks tools | The gateway doesn't serve `wuying-system-tool`; ask for one that does |
| Desktop is Stopped, gateway not checked | Fine to save; start the desktop and rerun to check the gateway too |

## Step 6 · Save it in Rakazo

The person enters these themselves in **Settings → Computer** (设置 → 电脑; admins: under **My
computers** 我的电脑). Choose **Wuying**, then:

| Field (中文) | Value |
| --- | --- |
| Desktop ID (桌面 ID) | `WUYING_DESKTOP_ID` |
| End user ID (终端用户 ID) | `WUYING_END_USER_ID` |
| Region (区域) | `WUYING_REGION_ID`; blank means `cn-hangzhou` |
| Access key ID (访问密钥 ID) | `WUYING_ACCESS_KEY_ID` |
| Access key secret (访问密钥 Secret) | `WUYING_ACCESS_KEY_SECRET` |
| Gateway URL (网关 URL) | `WUYING_MCP_URL`, the URL only |
| Gateway token (网关令牌) | `WUYING_MCP_TOKEN`, without `Bearer ` |

Then **Save** (保存). **Saved** (已保存) means it passed. If it says **Could not save computer
settings** (无法保存电脑设置), rerun step 5; whatever it flags is the cause.

After saving, the secret fields show only **Saved**. To change other fields later, leave them blank.
A new gateway URL needs every key entered again. Choosing **Default** (默认) deletes the saved
connection. Delete `wuying.env` once it is saved, or keep it somewhere private for later checks.

## Step 7 · See it work

1. Open a bot that uses the shared computer, then its **Computer** (电脑) tab. A computer already
   running moves to the desktop the next time it starts. To move it now, choose **Stop computer**
   (停止电脑) in the panel's **…** menu; it starts on the new desktop when the bot next needs it.
2. The panel shows the Windows desktop. Ask the bot something like "run `whoami` on your computer
   and take a screenshot".

## Good to know

- **The desktop is shared.** Every bot computer on it uses the same Windows account, files, screen
  and saved logins. Each computer gets its own folder, `%USERPROFILE%\rakazo\<home>`. Share a
  desktop only with people who may see each other's work.
- **One screen viewer at a time.** Opening the panel in a second browser or the Wuying client signs
  the other one out.
- **Power.** Rakazo starts the desktop when a bot needs it and stops it only when no computer on it
  is running.
- Commands run in PowerShell with UTF-8 output. Windows-key shortcuts are not available.
