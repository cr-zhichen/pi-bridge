# pi-bridge

pi-bridge 让 Claude 和 ChatGPT 网页版调用你电脑上的 [Pi](https://pi.dev)：运行命令、读写文件，以及使用 Pi 已安装的 Skills、扩展和 MCP 服务器。模型仍是网页版里的那个，本机不额外调用模型。

它由两部分组成：部署在 Cloudflare Workers 上的服务端，提供网页版接入用的 MCP 地址；运行在电脑上的 `pi-bridge` 命令行，负责连接服务端并在本机执行。一个服务端可以供多人使用，每人可以连接多台电脑。

## 部署服务端

需要一个 Cloudflare 账号，免费套餐即可。两种方式任选其一。

### 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cr-zhichen/pi-bridge/tree/main/packages/server)

按页面提示连接 GitHub 并填写 `ADMIN_KEY`（登录管理页的密钥，请设置一串足够长的随机字符）。Cloudflare 会在你的 GitHub 账号下创建一个新仓库并完成部署。这个仓库不会随本项目自动更新，升级时需要手动合并改动；想方便升级，请使用下面的方式。

### Fork 后部署

1. [Fork 本仓库](https://github.com/cr-zhichen/pi-bridge/fork)。
2. 在 Cloudflare 控制台打开 **Workers & Pages → Create → Import a repository**，选择你的 Fork。
3. 在构建设置中把 **Root directory** 设为 `packages/server`，其余保持默认，部署。
4. 打开这个 Worker 的 **Settings → Variables and Secrets**，添加类型为 Secret 的 `ADMIN_KEY`。

升级时在 Fork 页面点击 **Sync fork → Update branch**，Cloudflare 会自动重新部署，用户和设备数据都会保留。

### 创建用户

部署完成后，在浏览器打开 `https://<服务地址>/admin`，用 `ADMIN_KEY` 登录，为每位使用者创建用户。创建后页面会显示这位用户的登录命令和网页版连接器地址，只显示一次。

| 配置项      | 作用             | 默认值       |
| ----------- | ---------------- | ------------ |
| `ADMIN_KEY` | 登录管理页的密钥 | 无，必须设置 |

## 连接电脑

电脑需要先安装 [Pi](https://pi.dev) 0.99 或更高版本，以及 [Node.js](https://nodejs.org) 22.19 或更高版本。pi-bridge 使用电脑上安装的 Pi，网页版能用的扩展、Skills 和 MCP 与终端里的 `pi` 相同。安装命令行：

```bash
npm install -g @zgccrui/pi-bridge
```

用管理员给你的密钥登录，并设置开机后自动在后台运行。第一次登录时会询问电脑名称，网页版 AI 在你有多台电脑在线时按这个名称选择：

```bash
pi-bridge login https://<服务地址> <密钥>
pi-bridge service install
```

只想临时使用时，运行 `pi-bridge start`，关闭终端即断开。运行 `pi-bridge status` 查看连接状态和网页版连接器地址。

运行 `pi-bridge rename <电脑名称>` 修改电脑名称。

运行 `pi-bridge update` 更新到最新版本，开机自动运行的后台服务会随之重启。有新版本时，`pi-bridge status` 和运行日志中会提示。

## 接入 Claude / ChatGPT

在网页版中添加自定义连接器，地址填写：

```text
https://<服务地址>/<密钥>/mcp
```

认证方式选择「无」。之后在对话中告诉 AI 要操作的目录即可，例如“打开 ~/projects/blog，运行测试并修复失败的用例”。连接了多台电脑时，再告诉它用哪一台。

> [!WARNING]
> 这个地址包含你的密钥，拿到它就能在你的电脑上执行命令。不要分享，泄露后请让管理员在管理页重置密钥。

## 许可证

[MIT](LICENSE)
