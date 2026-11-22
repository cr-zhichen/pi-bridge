# pi-bridge

pi-bridge 让 Claude 和 ChatGPT 网页版使用你电脑上的 [Pi](https://pi.dev) 运行命令、读写文件，以及调用 Pi 已安装的 Skills、扩展和 MCP 服务器。也可以把一部分任务交给电脑上配置的 Pi 模型执行。

它由两部分组成：部署在 Cloudflare Workers 上的服务端，提供网页版接入用的 MCP 地址；运行在电脑上的 `pi-bridge` 命令行，负责连接服务端并在本机执行。一个服务端可以供多人使用，每人可以连接多台电脑。

## 部署服务端

需要一个 Cloudflare 账号并启用 R2，免费套餐即可。两种方式任选其一。

### 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cr-zhichen/pi-bridge/tree/main/packages/server)

按页面提示连接 GitHub 并填写 `ADMIN_KEY`（登录管理页的密钥，请设置一串足够长的随机字符）。Cloudflare 会在你的 GitHub 账号下创建一个新仓库并完成部署。这个仓库不会随本项目自动更新，升级时需要手动合并改动；想方便升级，请使用下面的方式。

### Fork 后部署

1. [Fork 本仓库](https://github.com/cr-zhichen/pi-bridge/fork)。
2. 在 Cloudflare 控制台打开 **Workers & Pages → Create → Import a repository**，选择你的 Fork。
3. 在构建设置中把 **Root directory** 设为 `packages/server`，其余保持默认，部署。
4. 打开这个 Worker 的 **Settings → Variables and Secrets**，添加类型为 Secret 的 `ADMIN_KEY`。

升级时在 Fork 页面点击 **Sync fork → Update branch**，Cloudflare 会自动重新部署，用户和设备数据都会保留。

服务端用一个名为 `OAUTH_KV` 的 KV 命名空间保存网页版连接器的授权，部署时自动创建，不需要手动配置。

### 临时文件

部署后，在 Worker 的 **Bindings** 找到 `TRANSFER_FILES` 对应的存储桶，保持存储桶私有，并[设置对象生命周期规则](https://developers.cloudflare.com/r2/buckets/object-lifecycles/#dashboard)，将 `transfers/` 下的文件设为 1 天后删除。

### 创建用户

部署完成后，在浏览器打开 `https://<服务地址>/admin`，用 `ADMIN_KEY` 登录，为每位使用者创建用户。创建后页面会显示这位用户的用户名和初始密码，只显示一次。用户忘记密码时，在管理页重置密码。

用户用用户名和密码登录 `https://<服务地址>/account`，第一次登录需要修改密码，之后在账号页自己添加电脑、连接网页版 AI。管理员看不到用户的密钥。

从没有登录账号的旧版本升级时，已登录的电脑仍可连接。管理页会标出「未设置登录账号」，点「设置登录账号」生成用户名和初始密码。

| 配置项      | 作用             | 默认值       |
| ----------- | ---------------- | ------------ |
| `ADMIN_KEY` | 登录管理页的密钥 | 无，必须设置 |

## 连接电脑

电脑需要先安装 [Pi](https://pi.dev) 0.99 或更高版本，以及 [Node.js](https://nodejs.org) 22.19 或更高版本。pi-bridge 使用电脑上安装的 Pi，网页版能用的扩展、Skills 和 MCP 与终端里的 `pi` 相同。安装命令行：

```bash
npm install -g @zgccrui/pi-bridge
```

在账号页点「添加电脑」，生成登录命令并在电脑上运行，然后启动 pi-bridge：

```bash
pi-bridge login https://<服务地址> <密钥>
pi-bridge start
```

每台电脑用自己的密钥，丢失或不再使用时在账号页移除那一台即可。

`pi-bridge start` 在终端里运行，关闭终端即断开。需要开机后自动在后台运行时，改用 `pi-bridge service install`。运行 `pi-bridge status` 查看连接状态。

运行 `pi-bridge rename <电脑名称>` 修改电脑名称。

运行 `pi-bridge update` 更新到最新版本，开机自动运行的后台服务会随之重启。有新版本时，`pi-bridge status` 和运行日志中会提示。

## 接入 Claude / ChatGPT

连接器地址对每个人都一样，里面不含密钥：

```text
https://<服务地址>/mcp
```

- **Claude**：在侧边栏打开 **插件 → 连接器**，点击 **添加自定义连接器**，粘贴地址。身份验证选 **立即登录**，OAuth 客户端保持默认。
- **ChatGPT**：在侧边栏打开 **插件**，点击 **添加自定义 MCP 服务器**，连接选 **服务器 URL** 并粘贴地址，身份验证选 **OAuth**。

登录后选择允许连接器访问的电脑。之后在对话中告诉 AI 要操作的目录，例如“打开 ~/projects/blog，运行测试并修复失败的用例”。如果连接器可以访问多台电脑，再告诉它用哪一台。访问范围可在账号页修改。

客户端不支持 OAuth 时，可以在账号页展开「使用带密钥的地址」，选择电脑并生成地址。添加到客户端时，身份验证选择「无」。

> [!WARNING]
> 地址泄露后请在账号页吊销。升级前创建的连接器需要重新授权或更换地址。

## 委派任务给 Pi

在账号页的「我的电脑」中开启目标电脑的「Pi 委派」。之后可以在对话中说明使用条件，例如「修复这组测试，需要第二意见时可以用 Pi」。要指定模型或思考等级，直接在对话里说明。

可以请 AI 继续上一次委派。Pi 会在本机保存对话记录。

## 许可证

[MIT](LICENSE)
