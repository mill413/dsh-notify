# DSH 0.2.1-alpha.2（历史迁移记录）

本文仅记录当时的迁移。当前兼容版本与开发方式见 [README](README.md)。

目标宿主为 npm 发布的 `@deepseek-ai/dsh@0.2.1-alpha.2`，从本机 0.2.0-rc.2 升级。DSH SDK 固定目标版本；Cordis 4.0.5-alpha.1、Schemastery 3.18.5-alpha.1 及相关组件来自 npm。运行时共享模块继续使用 peer 与客户端注入。

SDK 依赖迁移到 npm 精确版本；功能行为保留。

独立验收使用仅含本仓库的临时 checkout，冻结安装后运行仓库声明的测试、类型检查、构建和打包检查。正式安装使用目标 runtime 的 `dsh plugin --profile web add` 加载本地 tarball。
