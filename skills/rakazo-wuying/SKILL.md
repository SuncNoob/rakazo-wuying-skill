---
name: rakazo-wuying
description: Get someone started on Rakazo and connect their own Wuying (无影) Windows cloud computer, step by step - sign-up, a model API key through an OpenAI-compatible gateway, then Wuying. Use when someone wants to start using Rakazo, set up its model key or token, run Rakazo bots on "my own Wuying" / "我自己的无影云电脑", fill Settings → Computer → Wuying (desktop ID, end user ID, AccessKey, gateway URL and token), gets "Could not save computer settings / 无法保存电脑设置", or needs the RAM permissions or the MindCenter MCP gateway (MCP 公网服务).
---

# Rakazo with your own Wuying computer

Goal: the person has a Rakazo account with a working model, and their bots run commands, use
files, see the screen and use the mouse and keyboard on **their own** Wuying Windows cloud
computer, which they can watch in Rakazo.

Talk to the person in their language. Rakazo's UI is often in Chinese; the Chinese labels are given
in brackets. Go one step at a time and wait for them to finish each before the next.

## Rules for secrets

- Never ask for an API key, AccessKey secret or gateway token in chat, and never print, log or
  commit one. They go into Rakazo's forms, which the person fills in themselves, and the Wuying
  ones also into a local file only they read (W5).
- If the person pastes a secret into chat anyway, use it only for what it was for, then tell them
  to rotate it once things work.
- The RAM user gets exactly the four actions in `references/ram-policy.json`, nothing more.

## Start by asking

Ask these one at a time:

1. **"Do you already have a Rakazo account?" (已经注册 Rakazo 了吗？)** Also ask which Rakazo
   address they use, for example `https://rakazo.com.cn`.
   - No → **A · Sign up**. Sign-up ends in the model step, so skip question 2.
   - Yes → question 2.
2. **"Do you want to set up a model API key?" (要不要配置模型的 API 密钥？)** Only needed if they
   haven't connected a model, or want to change it.
   - Yes → **B · Model API key**.
3. **"Do you want to connect your own Wuying cloud computer?" (要不要接入你自己的无影云电脑？)**
   - Yes → **C · Wuying**. No → done; they can come back to this any time.

## A · Sign up

1. Open `<Rakazo address>/sign-up`. On **Create your Rakazo** (创建你的 Rakazo), fill in **Name**
   (你的名字), **Email** (邮箱) and **Password** (密码), then **Create account** (创建账户). If it
   says **Check your email** (请查看邮箱), they confirm from the email first.
2. A short survey may follow; any answers are fine.
3. **Connect a model** (连接模型) comes next. Do it as in **B**, from step 2, then **Continue**
   (继续). Rakazo then creates their first bot and opens its chat.

Then ask question 3.

## B · Model API key

Rakazo works with any **OpenAI-compatible** model gateway. Suggest one they can pay for easily:

| Gateway | Server URL | Key from |
| --- | --- | --- |
| Alibaba Cloud Model Studio (阿里云百炼), mainland China | `https://dashscope.aliyuncs.com/compatible-mode/v1` | Model Studio console → API-KEY |
| Model Studio, international | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | Model Studio console → API Key |
| OpenRouter | `https://openrouter.ai/api/v1` | openrouter.ai → Keys |

Any other OpenAI-compatible gateway (a company's own, or another provider) works the same way.

1. Outside sign-up: avatar at the bottom-left → **Settings** (设置) → **Models** (模型).
2. **Provider** (提供方): choose **OpenAI-compatible**.
3. **OpenAI-compatible server URL** (OpenAI 兼容服务器 URL): the gateway's address. Rakazo adds
   `/v1` if it is missing.
4. **API key** (API 密钥): they paste their key here themselves.
5. **Find models** (查找模型), then pick a **Model** (模型) from the list; **Other model…**
   (其他模型…) takes an exact model ID if it isn't listed. Prefer a capable chat model that
   supports tool calls and images, since bots act through tools and read screenshots.
6. **Continue** (继续) or save. Rakazo tests the key and model before it accepts them.

If **Find models** fails: a wrong URL (check the table), a key from a different region or gateway,
or a key without model access or credit.

## C · Wuying

Results: every bot on their **shared computer** (the default, 团队电脑) moves to their desktop the
next time it starts. Bots switched to **their own computer** (拥有专属电脑的 Bot) keep using the
deployment's computers. Nobody else can read the saved keys.

### W1 · Can this Rakazo take your own computer?

Avatar at the bottom-left → **Settings** (设置) → **Computer** (电脑).

- They see **New computers run on** (新电脑运行于), with **Wuying**: continue. Admins see the
  deployment's form first and expand **My computers** (我的电脑) below it. That lower form is
  theirs; the upper one changes every account's computers, so leave it alone.
- No Computer section, or saving says the deployment cannot use account computer settings: the
  Rakazo operator has to turn it on. On a self-hosted Rakazo that means `COMPUTER_SETTINGS_ENABLED=true`
  on the API and a `SANDBOX_PROVIDER` other than `desktop` or `fake`. Stop here until that's done.

### W2 · The Wuying desktop

In the Wuying console (无影云电脑控制台) they need:

1. A **Windows AI cloud computer** (AI 云电脑); an ordinary cloud computer has no MCP gateway.
   Note its **desktop ID** (starts with `ecd-`) and its **region**
   (for example `cn-hangzhou`, `cn-shanghai`; it is shown with the desktop).
2. The desktop **assigned to an end user** (终端用户), for example a convenience account (便捷账号).
   Note the **end user ID**, the user name it is assigned to. Screen logins are issued for this user.

### W3 · An AccessKey that can only do this

In RAM (访问控制, ram.console.aliyun.com):

1. Create a RAM user with **OpenAPI access** (OpenAPI 调用访问) and save its AccessKey ID and secret.
2. Create a custom policy (创建权限策略 → 脚本编辑) from `references/ram-policy.json`, and grant
   it to that user. It allows only reading the desktop, starting and stopping it, and issuing a
   screen login.

Use a RAM user, never the account's main AccessKey.

### W4 · The desktop's MCP gateway

On the AI cloud computer, open **MindCenter** and turn on **MCP public service** (MCP 公网服务).
That gives the desktop's MCP gateway, as a client config like this:

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
serve the `wuying-system-tool` tools; the check below confirms it. If MindCenter is missing,
the desktop is not an AI cloud computer yet; open AI cloud computer for it first.

### W5 · Check everything before Rakazo does

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
| Could not reach the gateway | MCP public service must be on in MindCenter, the desktop running, and the URL the full one ending in `/mcp` |
| Gateway lacks tools | The gateway doesn't serve `wuying-system-tool`; check it is the MindCenter gateway of an AI cloud computer |
| Desktop is Stopped, gateway not checked | Fine to save; start the desktop and rerun to check the gateway too |

### W6 · Save it in Rakazo

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
settings** (无法保存电脑设置), rerun W5; whatever it flags is the cause.

After saving, the secret fields show only **Saved**. To change other fields later, leave them blank.
A new gateway URL needs every key entered again. Choosing **Default** (默认) deletes the saved
connection. Delete `wuying.env` once it is saved, or keep it somewhere private for later checks.

### W7 · See it work

1. Open a bot that uses the shared computer, then its **Computer** (电脑) tab. A computer already
   running moves to the desktop the next time it starts. To move it now, choose **Stop computer**
   (停止电脑) in the panel's **…** menu; it starts on the new desktop when the bot next needs it.
2. The panel shows the Windows desktop. Ask the bot something like "run `whoami` on your computer
   and take a screenshot".

### Good to know

- **The desktop is shared.** Every bot computer on it uses the same Windows account, files, screen
  and saved logins. Each computer gets its own folder, `%USERPROFILE%\rakazo\<home>`. Share a
  desktop only with people who may see each other's work.
- **One screen viewer at a time.** Opening the panel in a second browser or the Wuying client signs
  the other one out.
- **Power.** Rakazo starts the desktop when a bot needs it and stops it only when no computer on it
  is running.
- Commands run in PowerShell with UTF-8 output. Windows-key shortcuts are not available.
