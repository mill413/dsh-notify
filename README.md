# @mill413/dsh-notify

DSH Web 通知插件（`platform: web`，node 半承载设置与自定义通知接口）。

离开电脑去干别的事时，DSH 的 Agent 什么时候跑完、什么时候卡在等你审批，都只能在浏览器里看到。本插件把这两类事件同时接到两个出口：浏览器原生的系统通知（任务完成弹一条，等待你处理弹一条，点通知直接跳回对应会话），以及你自定义的 HTTP 接口（URL、方法、请求头、请求体都自己填，例如 relay 的通知服务，由它推送到手机）。

## 功能

- **任务完成通知**：主 Agent 的 `running` 从 `true` 变 `false` 时发送系统通知，标题是该会话的名字。子会话（subagent）自己结束不单独通知——它所属的那一轮结束时父会话会报一次，避免同一轮任务弹两条。
- **等待处理通知**：Agent 需要你审批操作、回答问题或确认方案时发送通知（含子代理发起的请求，否则整轮会卡住而无人知晓）。已存在的请求不会重复提醒，换成新的请求（key 变化）会再提醒一次。
- **仅在前台之外提醒**（默认开）：页面可见且有焦点时不打扰，切标签页、最小化或窗口失焦时才弹。
- **推送到自定义接口**（默认关，填好 URL 再开）：把上面两条触发命中的通知同时发给你配置的 HTTP 接口。请求在 node 半发出，因此浏览器关掉、电脑休眠也照发。
- **设置卡片**：在 **设置 → 插件 → dsh-notify** 里有「桌面通知」卡片：总开关、两个触发开关、免打扰开关、浏览器授权状态与请求按钮、测试通知按钮，以及自定义接口的地址、方法、请求头、请求体模板与「测试推送」按钮。

## 数据来源

浏览器半只订阅 `ctx.uiSession.sessionStatus`——宿主已经为每个会话维护了运行状态和「当前最高优先级的待交互请求」，所以插件不需要 retain 任何会话、不订阅事件流、也不做 DOM 抓取。状态快照的差分规则在 `src/client/notify-core.ts`，与 DOM 无关，由 `tests/notify-core.test.ts` 直接覆盖。

首次快照只建立基线，因此刷新页面不会把关闭期间已经完成的任务重新提醒一遍。

## 自定义通知接口

第二条出口走 node 半：它订阅宿主的 `agent/status`（完成）与 `approval/request` / `user-questions/request`（等待处理），然后按你配置的 URL、方法、请求头、请求体发一次请求。

| 配置 | 说明 |
| --- | --- |
| 接口地址 | 完整的 http(s) 地址，含路径（例如通知服务的 `http://127.0.0.1:20710/api/send`）。留空或不是 http(s) 时整条通道不发。 |
| 请求方法 | `POST` / `PUT` / `PATCH` / `GET`。`GET` 不携带请求体。 |
| 请求头 | 逐条原样发送，名称为空的行不发。带请求体且没自定义内容类型时自动补 `application/json`。 |
| 请求体模板 | 支持变量替换；能解析成 JSON 的模板按 JSON 转义后发送，其他按纯文本替换。 |

模板变量：

| 变量 | 值 |
| --- | --- |
| `{{title}}` | 会话名（测试推送时是「DSH 测试推送」） |
| `{{body}}` | 默认文案：`任务已完成` / `等待你的审批` / `等待你的回答`，子代理加「（子代理）」 |
| `{{event}}` | `complete` / `approval` / `question` / `test` |
| `{{level}}` | `default`（完成、测试）或 `high`（等待处理） |
| `{{group}}` | 固定 `dsh`，便于接收端过滤 |
| `{{sessionId}}` | 会话 ID |
| `{{time}}` | 触发时间（ISO 8601） |

未知变量保持原样（写错不会把请求体截断成空）。

- 默认模板 `{"title":"{{title}}","body":"{{body}}","level":"{{level}}","group":"{{group}}"}` 直接对准 relay 通知服务的 `/api/send`：地址填 `http://127.0.0.1:20710/api/send`，再加一行请求头 `Authorization: Bearer notify_…`。该服务的发送令牌在它界面的「发送令牌」页创建，令牌名会记为来源。
- **请求头里的凭据以明文存在 profile 的 `cordis.patch.yml`（0600）**——这是 settings 存插件配置的既定位置，卡片上随时能改。
- 两个触发条件沿用卡片上原有的开关；「仅在前台之外提醒」只约束浏览器通知，不影响这条通道（发送端不在页面里）。
- 默认正文是固定的中文（node 半没有 locale 通道，浏览器的语言偏好只投影给客户端）；想要别的措辞就改模板。
- 投递历史在通知服务的 `/notify` 界面里看，插件不重复记录。

## 浏览器限制

系统通知属于安全上下文能力：

- `http://127.0.0.1:3081`（localhost）可以正常授权；
- Launcher 的局域网明文地址（`http://<lan-ip>:3080`）**不能**授权，卡片会显示「非安全上下文」并给出提示；
- Chrome on Android 只接受 ServiceWorker 通知，构造 `Notification` 会失败，插件会返回「发送失败」而不是抛错。

权限由浏览器持有，随时可能在站点设置里被改成「拒绝」。卡片每次窗口重新获得焦点都会重读一次权限状态。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm run verify   # 两个 tsconfig 的类型检查
pnpm test         # notify-core 的差分规则、接口模板与请求构造、prefs 取值规则
pnpm run build    # tsc 出 node 半 + esbuild 出 lib/client.js
```

依赖全部来自 npm，固定为经验证的宿主版本 `0.2.0-rc.2`；不引用 harness checkout。

## 安装

```sh
npm pack
"$DSH_LAUNCHER_DSH_COMMAND" plugin --profile web add /absolute/path/to/mill413-dsh-notify-0.3.0.tgz
systemctl --user restart dsh-web.service
```

## 打包内容

`files` 只包含 `lib`、`src`、`cordis.patch.yml`、`README.md`、`LICENSE`。宿主提供的共享包（Cordis、DSH SDK、React、UI primitives）声明在 `peerDependencies`，不打进插件 bundle。
