# @mill413/dsh-notify

DSH Web 桌面通知插件（`platform: web`，含一个只承载设置的 node 半）。

离开电脑去干别的事时，DSH 的 Agent 什么时候跑完、什么时候卡在等你审批，都只能在浏览器里看到。本插件把这两类事件接到浏览器原生的系统通知上：任务完成弹一条，等待你处理弹一条，点通知直接跳回对应会话。

## 功能

- **任务完成通知**：主 Agent 的 `running` 从 `true` 变 `false` 时发送系统通知，标题是该会话的名字。子会话（subagent）自己结束不单独通知——它所属的那一轮结束时父会话会报一次，避免同一轮任务弹两条。
- **等待处理通知**：Agent 需要你审批操作、回答问题或确认方案时发送通知（含子代理发起的请求，否则整轮会卡住而无人知晓）。已存在的请求不会重复提醒，换成新的请求（key 变化）会再提醒一次。
- **仅在前台之外提醒**（默认开）：页面可见且有焦点时不打扰，切标签页、最小化或窗口失焦时才弹。
- **设置卡片**：在 **设置 → 插件 → dsh-notify** 里有「桌面通知」卡片：总开关、两个触发开关、免打扰开关、浏览器授权状态与请求按钮、测试通知按钮。

## 数据来源

浏览器半只订阅 `ctx.uiSession.sessionStatus`——宿主已经为每个会话维护了运行状态和「当前最高优先级的待交互请求」，所以插件不需要 retain 任何会话、不订阅事件流、也不做 DOM 抓取。状态快照的差分规则在 `src/client/notify-core.ts`，与 DOM 无关，由 `tests/notify-core.test.ts` 直接覆盖。

首次快照只建立基线，因此刷新页面不会把关闭期间已经完成的任务重新提醒一遍。

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
pnpm test         # notify-core 的差分规则
pnpm run build    # tsc 出 node 半 + esbuild 出 lib/client.js
```

依赖全部来自 npm，固定为经验证的宿主版本 `0.1.7-rc.2`；不引用 harness checkout。

## 安装

```sh
npm pack
"$DSH_LAUNCHER_DSH_COMMAND" plugin --profile web add /absolute/path/to/mill413-dsh-notify-0.1.0.tgz
systemctl --user restart dsh-web.service
```

## 打包内容

`files` 只包含 `lib`、`src`、`cordis.patch.yml`、`README.md`、`LICENSE`。宿主提供的共享包（Cordis、DSH SDK、React、UI primitives）声明在 `peerDependencies`，不打进插件 bundle。
