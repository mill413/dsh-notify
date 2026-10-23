import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Check an actual tarball produced from the build, then remove the temporary file.
const destination = mkdtempSync(join(tmpdir(), 'dsh-notify-pack-'))
const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const targets = value => typeof value === 'string'
  ? [value]
  : value && typeof value === 'object' ? Object.values(value).flatMap(targets) : []
try {
  const result = JSON.parse(execFileSync('npm', [
    'pack', '--json', '--ignore-scripts', '--pack-destination', destination,
  ], { encoding: 'utf8' }))
  const [pack] = Array.isArray(result) ? result : Object.values(result)
  assert.equal(pack.name, manifest.name)
  assert.equal(pack.version, manifest.version)
  const files = new Set(pack.files.map(file => file.path))
  for (const path of [
    'package.json', 'README.md', 'LICENSE', manifest.main, manifest.types,
    manifest.dsh.bundle.patch, ...targets(manifest.exports),
    'lib/shared/push-config.js', 'lib/types/shared/push-config.d.ts',
  ]) assert(files.has(path.replace(/^\.\//, '')), `Missing published file: ${path}`)
  for (const path of files) {
    assert(!/(^|\/)(node_modules|\.git|\.github|\.gitea|\.env[^/]*|\.local-verify)(\/|$)/.test(path),
      `Unexpected published file: ${path}`)
  }
  console.log(`Validated ${pack.name}@${pack.version}: ${files.size} published files`)
} finally {
  rmSync(destination, { recursive: true, force: true })
}
