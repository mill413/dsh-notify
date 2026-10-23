# GitHub 与 npm 发布

仓库只使用两个分支：`dev` 用于开发，`release` 用于经过验证的发布代码。GitHub 默认分支为 `dev`。

## 自动流程

`.github/workflows/release.yml` 在两个分支提交、PR 和手动运行时验证 Node 22／24，执行冻结安装、类型检查、插件与发布脚本测试、构建和打包校验。Node 24 的产物上传为 `npm-package`，保留 30 天，其中包含 tarball 和带提交 SHA、SHA-512 的 `release.json`。

只有推送 `v*` tag 才会执行发布任务，并且：

- tag 必须与 `package.json` 中的版本一致。
- tag 对应提交必须已进入 `release` 分支。
- 两个 Node 版本的验证均通过。
- 发布任务核对产物的包名、版本、提交和 SHA-512。
- 已存在的版本仅在内容摘要相同时跳过；认证或网络错误会失败，不按“未发布”处理。
- 正式版发布到 `latest`，带预发布后缀的版本发布到 `next`。

发布使用 GitHub 托管 runner、`npm` Environment 和 OIDC；不需要 `NPM_TOKEN`。GitHub 环境仅允许 `v*` tag 部署。

## 首次创建 npm 包（维护者操作）

npm 需要先存在 `@mill413/dsh-notify` 才能在包设置中配置 Trusted Publisher。首次发布版本准备为 **0.4.2**。

1. 从 `release` 分支成功的 Actions run 下载 `npm-package`，确认 run 的提交与 `release.json` 中的提交一致。
2. 使用对 `@mill413` scope 有发布权限的账号登录，并发布该 tarball：

   ```sh
   npm login --registry=https://registry.npmjs.org
   npm publish /absolute/path/to/mill413-dsh-notify-0.4.2.tgz --access public --tag latest --ignore-scripts --registry=https://registry.npmjs.org
   ```

   按 npm 提示完成浏览器登录和 2FA。无需将凭据发给其他人。首次手动发布不带 GitHub provenance；后续由 GitHub 发布的版本携带 provenance。

3. 打开 npm 包的 **Settings → Trusted Publisher → GitHub Actions**：

   | 字段 | 值 |
   | --- | --- |
   | Organization or user | `mill413` |
   | Repository | `dsh-notify` |
   | Workflow filename | `release.yml` |
   | Environment name | `npm` |
   | Allowed actions | 允许 `npm publish` |

   workflow 字段只填文件名，不填目录。GitHub Environment 已由仓库维护者配置，无需添加 npm token secret。

参考：[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)。

## 后续版本

完成代码修改、更新 `package.json` 版本和 README 示例，在 `dev` 提交并等待 CI 通过。将经过验证的提交快进合入 `release`，推送该分支，再创建与包版本一致的 tag：

```sh
git switch release
git merge --ff-only dev
git push origin release
# 示例：仅当 package.json 已更新到 0.4.3 时执行。
git tag v0.4.3
git push origin v0.4.3
```

`origin` 指向 GitHub，原 Gitea remote 保留为 `gitea`。不要移动已发布 tag 或复用已发布 npm 版本。首次手动发布的 `0.4.2` 不应作为自动发布认证测试；发布脚本会跳过已存在且摘要相同的版本。完整 OIDC 发布需在配置 npm 信任关系后的新版本验证。
