# 公开仓库准备审查

审查日期：2026-10-23。整合分支：`chore/github-readiness-0.4.1`。

## 结论

当前代码适合推送为公开源码仓库。已整合 `chore/public-readiness` 与 `0.4.1` 的 Windows 通知修复，前次发现的代码、默认模板和界面规范问题已处理。此结论基于以下检查，不等同于完整安全审计。

GitHub 验证 CI 已配置；npm 自动发布尚未启用。正式发布前应选择新的插件版本并配置 npm Trusted Publisher。现有 `v0.4.1` tag 保持原有发布内容。

## 整理内容

- 保留固定 16 字符的会话通知 tag，以及真实客户端入口的回归测试。
- 使用 `src/shared/push-config.ts` 统一前后端请求方法与默认模板，包含 `icon`；旧的用户自定义模板不会被覆盖。
- 修复 URL 校验、模板原型属性读取，以及清空测试草稿字段后错误使用已保存值的问题。
- 使用宿主 Input、Button、Switch 和带 portal 的 Menu；保留 Plugins 页公开 slot，样式单独维护，并使用 DSH design token。
- 输入框和文本域对齐 32px 单行高度、8px 圆角、border-l2 与 focus token，修复输入框宽度溢出。
- 修正文案中“宿主休眠仍能推送”“关闭桌面通知会禁用所有选项”和特定接收端图标限制的错误表述。
- 补齐共享依赖声明，SDK 固定为 npm `0.2.1-rc.3`，固定 pnpm `12.15.0`，保留兼容范围和 lockfile。
- 重写 README；旧升级说明标记为历史记录；补充公开包元数据和实际打包检查脚本。
- GitHub CI 在 Node 22／24 上执行冻结安装、类型检查、测试、构建和打包检查。旧 Gitea CI 使用仓库变量，不再写死本机网络地址或将令牌写进 remote URL。

## 验证

### 独立构建和发布包

在仅复制插件仓库文件的临时目录执行：

```sh
pnpm install --frozen-lockfile
pnpm run verify
pnpm test
pnpm run build
pnpm run check:package
npm pack
```

本机执行环境为 Node `26.12.0`、pnpm `12.15.0`；**50 项测试通过**。GitHub 上的 Node 22／24 矩阵需在推送后运行，不将本机结果视为已通过远端 CI。

实际 tarball 包含 32 个文件；宿主入口、声明、共享配置模块、浏览器 bundle、语言文件、图标、patch 和许可证齐全。不含 node_modules、CI 文件、软链接或个人绝对路径。471 个依赖软链接均解析到隔离 checkout 内部。浏览器运行时只外部导入 React、JSX runtime 和宿主 UI primitives。

两个 CI workflow 的 YAML 与 shell 步骤语法检查通过。

### 浏览器

使用 Launcher 当前的 npm `0.2.1-rc.3` runtime，通过 `dsh plugin --profile web add` 将 tarball 安装到独立临时 `DSH_HOME`，在独立端口启动真实 DSH Web。正式 profile 和服务没有改变。

Chromium 中验证：

- 设置卡片展开／收起，以及首次加载的默认请求体。
- 原生 Menu 通过 portal 显示，键盘打开、Escape 关闭并归还焦点。
- HTTP 方法、请求头、正文、图标从草稿发送到本机测试接收端。
- 保存后刷新，设置正确恢复。
- 清空正文或图标后测试不会回退到已保存值。
- 请求头行删除。
- 浅色／深色主题、键盘 focus、减少动画；输入框实际高度 32px、圆角 8px，未越过内容边界。
- 浏览器拒绝通知权限时，测试按钮正确禁用。
- 无控制台错误或未捕获异常。

同时打开宿主 Models 页核对：输入框高度为 32px、字体 14px／22px，与插件一致。该宿主版本的 Models 圆角实际为 12px；插件按工作区明确要求保留 8px。

本轮没有验证 Windows 原生通知实际送达；Windows tag 长度与客户端调用由自动测试覆盖。

### 敏感信息与历史

对合并前全部本地 refs 可达的 14 个提交、87 个不同 Git blob 扫描常见 npm/GitHub token、私钥及字面量密钥模式，未发现凭据匹配。当前文件已移除写死的内网地址，旧提交仍保留这些地址及作者元数据；没有重写历史。

扫描不覆盖远端未拉取历史、不可达 Git 对象，且无法识别所有自定义凭据。插件本身按用户配置向 HTTP 地址发送请求，依赖宿主鉴权；隐私与配置存储边界见 README。
