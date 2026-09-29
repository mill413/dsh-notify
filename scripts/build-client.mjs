// Build lib/client.js in the DSH client-module format: a closure-factory
// artifact calling window.__ModuleLoader__.load({ id, factory }) whose
// externals (react, dsh-client-ui-primitives, ...) resolve through the
// loader's injected require (platform module table).
//
// Only baseline platform modules are imported at runtime: React, the JSX
// runtime, and the UI primitives. Every DSH service (sessions, uiSession,
// slots, locale, configForms, uiWorkspace) is reached through the Cordis
// context, so its package stays a type-only import and creates no module
// request.
import { build } from 'esbuild'

const ID = '@mill413/dsh-notify'

await build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  outfile: 'lib/client.js',
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-store',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-ui-dockkit',
  ],
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  },
  footer: { js: 'return module.exports; } });' },
})

console.log('client bundle written: lib/client.js')
