# Rakazo × 无影：把你自己的云电脑接进 Rakazo

[English](README.en.md)

一个给 AI agent 用的 skill。装上以后，对你的 agent（Claude Code、Codex、Cursor 等）说一句
**「帮我把我的无影云电脑接到 Rakazo」**，它会一步步带你完成：准备云电脑、建最小权限的
AccessKey、拿到 MCP 网关、先自检、再填进 Rakazo 的 **设置 → 电脑**。

接好以后，你的 Bot 就在**你自己的**无影 Windows 云电脑上执行命令、读写文件、看屏幕、操作鼠标键盘，
你也可以在 Rakazo 里实时观看。连接保存在你的账号上，其他人读不到。

## 安装

任选一种：

```bash
npx skills add SuncNoob/rakazo-wuying-skill
```

```bash
git clone https://github.com/SuncNoob/rakazo-wuying-skill.git
cp -r rakazo-wuying-skill/skills/rakazo-wuying ~/.claude/skills/
```

其他 agent：把 `skills/rakazo-wuying` 放进它的 skills 目录，或者直接让它读
`skills/rakazo-wuying/SKILL.md`。

## 你需要准备

- 一个 Rakazo 账号，并且这个 Rakazo 在 **设置 → 电脑** 里能选 **Wuying**
- 一台已开通 **AI 云电脑**、已分配给终端用户的无影 **Windows** 云电脑
- 一个阿里云 RAM 用户的 AccessKey，只授予 [这 4 个权限](skills/rakazo-wuying/references/ram-policy.json)
- 在云电脑的 **MindCenter** 里打开 **MCP 公网服务**，拿到 MCP 网关配置（`mcpServers` JSON，含网关地址和 Bearer Token）

## 自检脚本

Rakazo 保存时失败只会提示「无法保存电脑设置」。skill 自带的检查脚本会按 Rakazo 的方式逐项检查，
并告诉你具体是哪一步出了问题、怎么修：

```bash
node skills/rakazo-wuying/scripts/check.mjs --env-file wuying.env
```

```text
✓ Desktop found: Running, Windows
✓ Screen login works
✓ MCP gateway answers
✓ Gateway serves the desktop tools
✓ The desktop runs commands through the gateway

Ready: enter these values in Rakazo → Settings → Computer → Wuying.
```

它会查询云电脑状态、签发一次屏幕登录码；云电脑在运行时，还会连接网关、列出工具，并执行一次
只读调用（读取 `USERPROFILE`）。不会开关机，也不会打印任何密钥。需要 Node.js 18+，无需安装依赖。

## 安全

- 密钥只写在你本地的 `wuying.env`（`chmod 600`）和 Rakazo 的表单里，不要发到聊天里，也不要提交到 Git。
- RAM 用户只给 `ecd:DescribeDesktops`、`ecd:StartDesktops`、`ecd:StopDesktops`、
  `appstream-center:GetAuthCode` 四个权限。
- 同一台云电脑上的所有 Bot 共用一个 Windows 账号，能看到彼此的文件和屏幕。只和互相信任的人共用。

## 开发

```bash
npm test
```

测试全部离线运行：签名用阿里云官方 SDK 生成的结果校验，网关和云 API 都是模拟的。

## 许可

MIT
