# Rakazo × Wuying: connect your own cloud computer to Rakazo

[简体中文](README.md)

A skill for AI agents. Install it, then tell your agent (Claude Code, Codex, Cursor and others)
**"connect my Wuying cloud computer to Rakazo"**. It walks you through preparing the desktop, a
least-privilege AccessKey, the MCP gateway, a self-check, and Rakazo's **Settings → Computer**.

Once connected, your bots run commands, use files, see the screen and use the mouse and keyboard on
**your own** Wuying Windows cloud computer, and you can watch it live in Rakazo. The connection is
saved to your account; no one else can read it.

## Install

Either:

```bash
npx skills add SuncNoob/rakazo-wuying-skill
```

```bash
git clone https://github.com/SuncNoob/rakazo-wuying-skill.git
cp -r rakazo-wuying-skill/skills/rakazo-wuying ~/.claude/skills/
```

For other agents, put `skills/rakazo-wuying` in their skills folder, or ask them to read
`skills/rakazo-wuying/SKILL.md`.

## You need

- A Rakazo account on a Rakazo whose **Settings → Computer** offers **Wuying**
- A Wuying **Windows AI cloud computer** assigned to an end user
- An AccessKey for a RAM user with only [these four actions](skills/rakazo-wuying/references/ram-policy.json)
- **MCP public service** turned on in the desktop's **MindCenter**, which gives the gateway's
  `mcpServers` config with its URL and bearer token

## The check script

When saving fails, Rakazo only says it could not save the computer settings. The bundled script runs
the same checks and says which one failed and how to fix it:

```bash
node skills/rakazo-wuying/scripts/check.mjs --env-file wuying.env
```

It reads the desktop's state and issues one screen login. If the desktop is running, it also
connects to the gateway, lists its tools and makes one read-only call (reading `USERPROFILE`). It
never starts or stops the desktop and never prints a secret. It needs Node.js 18+ and installs
nothing.

## Security

- Secrets go only into your local `wuying.env` (`chmod 600`) and Rakazo's form, never into chat or
  Git.
- The RAM user gets only `ecd:DescribeDesktops`, `ecd:StartDesktops`, `ecd:StopDesktops` and
  `appstream-center:GetAuthCode`.
- Every bot on one desktop shares its Windows account, files and screen. Share a desktop only with
  people who trust each other.

## Development

```bash
npm test
```

Tests run offline. Signing is checked against values from Alibaba Cloud's official SDK, and the
gateway and cloud APIs are faked.

## License

MIT
