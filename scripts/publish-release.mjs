import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readJson, releaseVersion, verifyReleaseArtifact } from './release-lib.mjs'

assert(process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF_TYPE === 'tag',
  'Publishing requires a GitHub tag push')
const manifest = readJson('package.json')
const { distTag } = releaseVersion(manifest.version, process.env.GITHUB_REF_NAME)
const release = readJson('dist/release.json')
const filename = verifyReleaseArtifact(release, manifest, process.env.GITHUB_SHA, 'dist')
const registry = 'https://registry.npmjs.org'
const check = spawnSync('npm', ['view', `${manifest.name}@${manifest.version}`, '--json', '--registry', registry], {
  encoding: 'utf8',
})
if (check.error) throw check.error
if (check.status === 0) {
  const published = JSON.parse(check.stdout)
  assert.equal(published.version, manifest.version)
  assert.equal(published.dist?.integrity, release.integrity, 'Published version has different contents')
  console.log(`Already published with matching integrity: ${manifest.name}@${manifest.version}`)
} else {
  let code
  for (const output of [check.stdout, check.stderr]) {
    try { code = JSON.parse(output)?.error?.code ?? code } catch { /* npm may emit plain diagnostics. */ }
  }
  assert.equal(code, 'E404', `Cannot check registry: ${check.stderr || check.stdout}`)
  execFileSync('npm', [
    'publish', filename, '--access', 'public', '--provenance', '--ignore-scripts',
    '--tag', distTag, '--registry', registry,
  ], { stdio: 'inherit' })
}
