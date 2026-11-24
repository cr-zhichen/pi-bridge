# pi-bridge

pi-bridge 让 Claude、ChatGPT 和 Gemini 网页版使用你电脑上的 [Pi](https://pi.dev) 运行命令、读写文件，以及调用 Pi 已安装的 Skills、扩展和 MCP 服务器。也可以把一部分任务委派给本机配置的 Pi 模型执行，或通过临时链接传输本机文件。

它由两部分组成：部署在 Cloudflare Workers 上的服务端，提供网页版接入用的 MCP 地址；运行在电脑上的 `pi-bridge` 命令行，负责连接服务端并在本机执行。一个服务端可以供多人使用，每人可以连接多台电脑。如果管理员已经为你创建好账号，可以直接从[连接电脑](#连接电脑)开始。

## 部署服务端

需要一个 Cloudflare 账号并在控制台先启用 R2，免费套餐即可。推荐使用「Fork 后部署」，方便后续升级；只想快速体验可以使用「一键部署」。

### Fork 后部署

1. [Fork 本仓库](https://github.com/cr-zhichen/pi-bridge/fork)。
2. 在 Cloudflare 控制台打开 **Workers & Pages → Create → Import a repository**，选择你的 Fork。
3. 在构建设置中把 **Root directory** 设为 `packages/server`，其余保持默认，部署。
4. 打开这个 Worker 的 **Settings → Variables and Secrets**，添加类型为 Secret 的 `ADMIN_KEY`。

升级时在 Fork 页面点击 **Sync fork → Update branch**，Cloudflare 会自动重新部署，用户和设备数据都会保留。

### 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cr-zhichen/pi-bridge/tree/main/packages/server)

按页面提示连接 GitHub 并填写 `ADMIN_KEY`，Cloudflare 会在你的 GitHub 账号下创建一个独立仓库并完成部署。这个仓库不会随上游自动更新，后续升级需要手动合并改动。

| 配置项               | 作用                                               | 默认值       |
| -------------------- | -------------------------------------------------- | ------------ |
| `ADMIN_KEY`          | 登录管理页 `/admin` 的密钥，请设置足够长的随机字符 | 无，必须设置 |
| `EMAIL_FROM`         | 发件地址，留空时关闭邮件功能                       | 空           |
| `ALLOW_REGISTRATION` | 设为 `true` 开放自助注册，需要先设置 `EMAIL_FROM`  | `false`      |

### 临时文件

pi-bridge 支持在对话中把本机文件上传为临时下载链接（最大 50 MB，24 小时后自动失效）。部署后，建议在 Worker 的 **Bindings** 找到自动创建的 R2 存储桶 `TRANSFER_FILES`，保持存储桶私有，并[设置对象生命周期规则](https://developers.cloudflare.com/r2/buckets/object-lifecycles/#dashboard)，将前缀 `transfers/` 下的对象设为 1 天后删除，避免过期文件占用空间。

### 用户注册

向任意收件人发信需要 Workers Paid。

1. 在 Cloudflare 启用 [Email Sending](https://developers.cloudflare.com/email-service/get-started/send-emails/) 并验证发信域名。
2. 取消 `packages/server/wrangler.jsonc` 中 `send_email` 的注释并重新部署。
3. 在 Worker 的 **Settings → Variables and Secrets** 中设置 `EMAIL_FROM`。

设为 `ALLOW_REGISTRATION=true` 后，使用者可在登录页点击「注册账号」，验证邮箱后登录。已有账号的用户可在账号页绑定邮箱。绑定后可用邮箱登录，也可从登录页找回密码。

### 手动创建用户

部署完成后，在浏览器打开 `https://<服务地址>/admin`（`<服务地址>` 为 Worker 的访问地址，例如 `*.workers.dev` 或自定义域名），用 `ADMIN_KEY` 登录，填写用户名创建用户，邮箱可选。创建后页面会显示登录地址、用户名和初始密码，只显示一次。管理员可在用户列表修改或解除邮箱绑定，也可为用户重置密码。

用户打开 `https://<服务地址>` 登录并修改初始密码（至少 10 位）后，会进入账号页，之后在账号页自行添加电脑、连接网页版 AI。管理员看不到用户的密钥。

停止为某个用户提供服务时，可在管理页选择「删除用户」。此操作无法恢复，用户的设备连接、授权和临时文件链接会失效。

## 连接电脑

电脑需要先安装 [Pi](https://pi.dev) 0.99 或更高版本，以及 [Node.js](https://nodejs.org) 22.19 或更高版本。pi-bridge 使用电脑上安装的 Pi，网页版能用的扩展、Skills 和 MCP 与终端里的 `pi` 相同。

登录账号页 `https://<服务地址>`，在「我的电脑」点「添加电脑」（电脑名称可留空），按页面生成的命令依次安装、登录并启动：

```bash
npm install -g @zgccrui/pi-bridge
pi-bridge login https://<服务地址> <密钥>
pi-bridge start
```

每台电脑使用独立密钥，连接成功后账号页会显示在线；电脑丢失或不再使用时，在账号页移除那一台即可。

`pi-bridge start` 在终端前台运行，关闭终端即断开。需要开机后自动在后台运行时，改用 `pi-bridge service install`（设置后会立即启动），取消用 `pi-bridge service uninstall`。

常用命令：`pi-bridge status` 查看连接状态和版本，`pi-bridge rename <电脑名称>` 修改电脑名称，`pi-bridge update` 更新到最新版本（已启用的后台服务会自动重启）。有新版本时，`pi-bridge status` 和运行日志中也会提示。

## 接入网页版 AI

连接至少一台电脑后，打开账号页的「连接网页版 AI」，选择对应的标签页并按页面提示添加连接器。

跳转登录后，选择允许连接器访问的电脑，也可以勾选「允许访问全部电脑」（包含以后添加的电脑）。访问范围可在账号页的「已授权的应用」中随时修改或撤销。

接入完成后，在对话中告诉 AI 要操作的目录和任务即可，例如“打开 ~/projects/blog，运行测试并修复失败的用例”。如果连接器可以访问多台电脑，再告诉它用哪一台。AI 会读取目录中的项目说明（如 `AGENTS.md`），并按需调用本机 Pi 的 Skills、扩展和 MCP；需要把本机文件传到对话里时，也可以让 AI 生成临时下载链接（用完后可让 AI 立即删除）。

客户端不支持 OAuth 时，可以在账号页展开「不支持 OAuth？使用带密钥的地址」，填写名称并选择电脑后生成专属地址（只显示一次）。添加到客户端时，身份验证选择「无」或「无需登录」。

> [!WARNING]
> 带密钥的地址等同于访问凭证，泄露后请立即在账号页删除。

## 委派任务给 Pi

如果本机 Pi 已配置可用模型，可以把一部分任务委派给本机 Pi 执行。在账号页的「我的电脑」中开启目标电脑的「Pi 委派」，之后在对话中说明使用条件即可，例如「修复这组测试，需要第二意见时可以用 Pi」。要指定模型或思考等级，直接在对话里说明。

换到新对话后，可以请 AI 在原电脑的原目录查找最近的 Pi 委派，再选一条继续。

## 许可证

[MIT](LICENSE)
