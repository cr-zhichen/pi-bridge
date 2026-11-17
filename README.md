# pi-bridge

pi-bridge 让 Claude 和 ChatGPT 网页版调用你电脑上的 [Pi](https://pi.dev)：运行命令、读写文件，以及使用 Pi 已安装的 Skills、扩展和 MCP 服务器。模型仍是网页版里的那个，本机不额外调用模型。

它由两部分组成：部署在 Cloudflare Workers 上的服务端，提供网页版接入用的 MCP 地址；运行在电脑上的 `pi-bridge` 命令行，负责连接服务端并在本机执行。

> [!WARNING]
> 项目仍在开发中，以下功能尚未可用。

## 部署服务端

需要 Cloudflare 账号，并在本机安装 [mise](https://mise.jdx.dev)。

```bash
mise install
pnpm install
cd packages/server
pnpm exec wrangler secret put ADMIN_KEY   # 设置管理员密钥
cd ../..
mise run deploy
```

部署完成后，用管理员密钥登录 `https://<服务地址>/admin`，为每位使用者创建用户。每位用户会得到一串密钥。

| 配置项      | 作用             | 默认值       |
| ----------- | ---------------- | ------------ |
| `ADMIN_KEY` | 登录管理页的密钥 | 无，必须设置 |

## 连接电脑

电脑需要先安装 Pi。

```bash
pi-bridge login https://<服务地址> <用户密钥>
pi-bridge service install   # 开机后自动在后台运行
```

只想临时使用时，运行 `pi-bridge start`，关闭终端即断开。

## 接入 Claude / ChatGPT

在网页版中添加自定义连接器，地址填写：

```text
https://<服务地址>/<用户密钥>/mcp
```

认证方式选择「无」。之后在对话中告诉 AI 要操作的目录即可。

> [!WARNING]
> 这个地址包含你的密钥，拿到它就能在你的电脑上执行命令。不要分享，泄露后请在管理页重置密钥。
