# @mill413/dsh-notify

English | [中文说明](README.zh.md)

Desktop notifications and configurable HTTP pushes for DeepSeek Harness. Get a reminder when a task stops running or needs approval, an answer, or plan review. Clicking a desktop notification returns you to its session.

The published version is **0.4.2**, validated with npm **DSH 0.2.1-rc.3**. Other host versions have not been verified. MIT licensed.

## Install

The plugin is published on npm; no source build is needed:

```sh
dsh plugin --profile web add @mill413/dsh-notify@0.4.2
```

Use the DSH CLI that runs your target profile, with the same `DSH_HOME`. If you use Launcher, use its configured `DSH_LAUNCHER_DSH_COMMAND`. The package includes its bundle patch; do not edit the host or profile manually.

Reload DSH and refresh the page after installation. On installations managed by `dsh-web.service`, restart that user service once installation is complete, then check its status.

## Notification channels

| Channel | Events | Requirements |
| --- | --- | --- |
| Desktop notification | Main session stops running; new approval, question, or plan-review request | Keep the DSH page open and allow browser notifications |
| HTTP push | Main agent changes from running to idle; an agent requests approval or asks a question | Keep the DSH host running; the browser may be closed |

Subagent completion does not produce a separate completion alert; subagent approval and question requests do. Desktop notifications are sent only while the page is hidden or unfocused by default. This restriction does not apply to HTTP pushes.

“Task complete” refers to a running-to-idle transition and does not guarantee success. The HTTP channel does not subscribe to a separate plan-review event. Initial browser snapshots establish a baseline and do not replay old alerts.

## Use

1. Open **Plugins → Desktop notifications (dsh-notify)** and expand its settings.
2. Grant browser notification permission, then send a test notification.
3. Choose completion, attention-needed and background-only preferences, then save.
4. For HTTP delivery, configure your endpoint and request, test it, then enable and save.

Desktop notifications and HTTP pushes have separate master switches. Completion and attention-needed preferences are shared between the channels. The HTTP test uses the current unsaved form and works while the channel is disabled.

## HTTP configuration

Requests run on the DSH host. An endpoint containing `localhost` refers to that machine. Supported methods are `POST`, `PUT`, `PATCH` and `GET`; GET has no body. You may configure authentication headers, a body template and an icon URL. Endpoint URLs must use HTTP(S) and cannot contain a username or password.

Default body:

```json
{"title":"{{title}}","body":"{{body}}","level":"{{level}}","group":"{{group}}","icon":"{{icon}}"}
```

Template variables: `title` (session title), `body` (event summary), `event` (`complete`, `approval`, `question`, or `test`), `level`, `group`, `sessionId`, `time` and `icon`. Unknown variables are left unchanged. Substitution applies to body values, not URLs, headers or JSON keys. Valid JSON is parsed before substitution and serialized afterwards; other bodies are treated as text without URL encoding.

A request with a body defaults to `application/json` unless a Content-Type header is supplied. Requests time out after five seconds. There is no retry or offline queue; HTTP 2xx is treated as successful delivery to the configured endpoint, not proof of delivery to a recipient.

## Privacy and troubleshooting

HTTP delivery is disabled by default and has no built-in third-party destination. Only the endpoint you configure receives requests. The default template sends the session title and event summary; the plugin does not proactively send conversation contents. Credentials are stored with the plugin settings in the DSH profile and are not encrypted by this plugin. Do not commit real request headers or credential-bearing screenshots.

The test route uses DSH authentication. Users with access to it can ask the host to contact a configured HTTP address, including addresses on its network. Follow the host's access controls.

- Desktop notifications require HTTPS or a browser-recognized secure local context, browser permission, and an open page. Check system Do Not Disturb and the background-only setting if no alert appears.
- This plugin uses the Notification constructor without a Service Worker. Some mobile browsers do not support it. Use HTTP delivery when the browser will be closed.
- For HTTP failures, verify network reachability, request headers and receiver logs from the host machine, then use **Test push**.

## Development

Use Node.js 22.18.0 or newer and the package manager declared in `package.json`. SDK development dependencies come from npm and are pinned to the target DSH version; the repository does not depend on an adjacent Harness checkout.

```sh
pnpm install --frozen-lockfile
pnpm run verify
pnpm run test:release
pnpm test
pnpm run build
pnpm run check:package
```

The package includes host code, browser UI, locale files, its bundle patch and icon. The settings UI supports Chinese and English; default HTTP titles and bodies are Chinese and can be customized through the body template. See [publishing instructions](docs/publishing.md) for the GitHub/npm release workflow.

## License

[MIT](LICENSE) © 2026 mill413.
