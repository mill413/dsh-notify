# @mill413/dsh-notify

为 DeepSeek Harness（DSH）Web 提供桌面通知和自定义 HTTP 推送。在任务结束或需要你处理时提醒你，并支持从桌面通知返回对应会话。

本项目是独立插件，使用 MIT 许可证。当前插件版本为 `0.4.0`，目标宿主为 npm 发布的 `@deepseek-ai/dsh@0.2.1-rc.3`。其他宿主版本尚未验证。

## 功能

| 通道 | 触发条件 | 运行条件 |
| --- | --- | --- |
| 浏览器桌面通知 | 主会话停止运行；出现新的待审批、待回答或计划审阅请求 | DSH 页面保持打开，浏览器允许通知 |
| 自定义 HTTP 推送 | 主 Agent 从 running 转为 idle；Agent 发起审批或提问 | DSH 宿主进程保持运行，可关闭浏览器 |

- 子代理结束时不单独发送完成通知；子代理等待审批或回答时会提醒。
- 桌面通知默认只在页面隐藏或失去焦点时发送；这个限制不影响 HTTP 推送。
- 首次状态快照只建立基线，不补发页面关闭期间的旧通知。
- 设置页提供通知权限检查、测试通知、测试推送和最近一次桌面通知触发结果。
- 设置界面支持中文和英文。HTTP 推送的默认标题与正文使用中文，可通过请求体模板自定义正文。

“任务完成”根据运行状态变化判断，不表示任务一定成功。HTTP 通道目前没有独立的计划审阅事件订阅。

## 安装

当前仓库尚未配置 GitHub → npm 自动发布。可先从源码独立构建并安装打包产物，不需要下载或构建 DSH 源码。

```sh
pnpm install --frozen-lockfile
pnpm run verify
pnpm test
pnpm run build
npm pack
```

使用目标正式 runtime 的 `dsh plugin add` 安装生成的 tarball。若通过 Launcher 运行 DSH，先从其实际配置确认 `DSH_LAUNCHER_DSH_COMMAND`，并使用相同的 `DSH_HOME` 与 profile：

```sh
"$DSH_LAUNCHER_DSH_COMMAND" plugin --profile web add /absolute/path/to/mill413-dsh-notify-0.4.0.tgz
```

插件自带 `cordis.patch.yml`，由 CLI 加入 profile；无需手动编辑宿主配置。安装完成后按你的部署方式重新加载 DSH。使用本工作区的 systemd 部署时，在产物和配置确认可用后执行一次 `systemctl --user restart dsh-web.service`，再检查服务状态。

## 使用

1. 打开 **设置 → 插件 → dsh-notify**，展开设置卡片。
2. 点击浏览器通知授权按钮，再使用测试通知确认效果。
3. 按需调整任务完成、等待处理和仅后台提醒开关，点击保存。
4. 如需手机或其他渠道提醒，填写 HTTP 接口配置，先测试推送，再启用并保存。

浏览器通知总开关与 HTTP 推送开关独立；任务完成、等待处理两个触发开关由两种通道共用。测试推送使用当前表单草稿，不需要先保存，也不受推送开关限制。

## HTTP 推送

请求由 DSH 宿主发送。接口地址中的 `localhost` 指向宿主所在机器。关闭浏览器不会停止 HTTP 推送，但宿主关机、休眠或停止后无法继续发送。

| 配置 | 说明 |
| --- | --- |
| 接口地址 | 完整的 HTTP 或 HTTPS URL；不支持 URL 内嵌用户名、密码 |
| 请求方法 | `POST`、`PUT`、`PATCH` 或 `GET`；GET 不携带请求体 |
| 请求头 | 自定义鉴权和内容类型等；名称为空的行忽略 |
| 请求体模板 | 合法 JSON 会在解析后替换字符串中的变量，再序列化；其他内容按普通文本替换 |
| 图标地址 | 提供给 `{{icon}}` 的 URL，需能被接收端访问；插件不上传图标 |

默认请求体：

```json
{"title":"{{title}}","body":"{{body}}","level":"{{level}}","group":"{{group}}","icon":"{{icon}}"}
```

| 变量 | 值 |
| --- | --- |
| `{{title}}` | 会话标题；测试时为固定测试标题 |
| `{{body}}` | 任务完成、等待审批或等待回答的提示；子代理有额外标记 |
| `{{event}}` | `complete`、`approval`、`question` 或 `test` |
| `{{level}}` | 完成、测试为 `default`；审批、提问为 `high` |
| `{{group}}` | 固定为 `dsh` |
| `{{sessionId}}` | 会话 ID；测试时为空 |
| `{{time}}` | ISO 8601 时间 |
| `{{icon}}` | 配置的图标地址；未配置时为空字符串，JSON 字段仍保留 |

未知变量保持原样。变量只替换请求体中的值，不替换 URL、请求头或 JSON 键。普通文本模式不进行 URL 编码；对接表单接口时需自行确定编码方式。

有请求体且未指定 `Content-Type` 时，默认使用 `application/json`。纯文本或表单接口应显式设置相应请求头。单次请求超时为 5 秒，没有重试或离线队列；HTTP 2xx 视为成功，接收服务是否最终送达由接收服务负责。

例如，可以设置接口为 `https://notify.example.com/api/send`，请求头为 `Authorization: Bearer <YOUR_TOKEN>`，再按接收服务要求修改请求体。

## 隐私与权限

- 插件没有内置第三方接收地址；HTTP 推送默认关闭，只向你配置的地址发送。
- 默认模板发送会话标题、事件提示、级别、分组和图标地址；模板也可包含会话 ID 和时间。插件不主动发送对话正文。
- 接口凭据随插件设置保存在 DSH profile 中，不由本插件加密。不要将运行时 profile、真实请求头或带凭据的截图提交到仓库。
- 测试接口通过宿主 Connection API 注册，依赖宿主鉴权。能访问该功能的用户可要求宿主向指定 HTTP 地址发送请求，包括宿主可访问的内网服务；请遵循宿主的访问权限边界。
- 接口返回的错误消息可能出现在设置页或宿主日志中。

## 浏览器限制与排查

| 现象 | 检查项 |
| --- | --- |
| 无法请求通知权限 | 使用 HTTPS 或浏览器认可的本机安全上下文；普通局域网 HTTP 地址通常不满足要求 |
| 已授权但没有弹窗 | 检查系统勿扰模式、浏览器站点权限、总开关和“仅在前台之外提醒” |
| 手机浏览器不能发桌面通知 | 本插件使用 `Notification` 构造器，没有 Service Worker 推送实现；部分移动浏览器不支持 |
| 关闭页面后没有桌面通知 | 桌面通道要求页面保持打开；需要离线于浏览器的提醒时使用 HTTP 通道 |
| HTTP 推送失败 | 从宿主侧检查网络、接口地址、请求头及接收服务日志，使用设置页测试推送 |

## 开发

Node.js **22.18.0 或更新版本**；包管理器固定为 **pnpm 12.15.0**（见 `packageManager`）。测试直接运行 TypeScript，要求 Node 支持类型擦除。建议在与目标 DSH 相同的 Node 主版本上验证。

```sh
pnpm install --frozen-lockfile
pnpm run verify       # 宿主和浏览器代码类型检查
pnpm test             # 通知状态差分、偏好设置、模板与 HTTP 请求测试
pnpm run build        # 宿主 JS、声明文件和浏览器 bundle
npm pack --dry-run    # 检查发布文件清单
```

```text
src/index.ts                  宿主事件订阅、配置与测试接口
src/push.ts                   HTTP 地址校验、模板渲染和投递
src/client/                   桌面通知、设置卡片及浏览器状态
locale/                       插件元数据翻译
scripts/build-client.mjs      浏览器模块打包
tests/                       单元测试
cordis.patch.yml              插件 bundle 声明
```

SDK 开发依赖来自 npm，固定到目标版本；宿主共享包通过 peer dependencies 声明，浏览器服务通过 `dsh.client.inject` 加载。仓库不引用相邻 harness checkout。发布文件使用 `package.json` 中的 `files` 白名单，包含运行产物、源码、语言文件、插件声明、图标、README 和许可证。

提交前应在仅包含本插件的临时目录中冻结安装，再运行类型检查、测试、构建和打包检查。界面变更还需在 DSH 中实际检查浅色／深色主题、键盘操作、保存和控制台错误。

`.gitea/` 保留旧 Gitea 发布流程；使用时需设置 runner 可访问的仓库变量 `GITEA_BASE_URL`，以及用于检出和上传 Release 的 `GITHUB_TOKEN` secret。它上传 Gitea Release 附件，不发布 npm。GitHub Actions 发布流程将单独配置。

## 许可证

[MIT](LICENSE) © 2026 mill413。
