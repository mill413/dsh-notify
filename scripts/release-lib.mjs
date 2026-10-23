// Release validation adapted from @mill413/dsh-session-resume (MIT).
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const readJson = path => JSON.parse(readFileSync(path, 'utf8'))

export function releaseVersion(version, tag) {
  const number = '(?:0|[1-9][0-9]*)'
  const identifier = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)'
  const semver = new RegExp(`^${number}\\.${number}\\.${number}(?:-${identifier}(?:\\.${identifier})*)?$`)
  assert(typeof version === 'string' && semver.test(version), 'Unsupported release version')
  if (tag !== undefined) assert.equal(tag, `v${version}`, 'Tag must match package version')
  return { version, distTag: version.includes('-') ? 'next' : 'latest' }
}

export const exportTargets = value => typeof value === 'string'
  ? [value]
  : value && typeof value === 'object' ? Object.values(value).flatMap(exportTargets) : []

export function validatePack(result, manifest) {
  const packs = Array.isArray(result) ? result : Object.values(result ?? {})
  assert.equal(packs.length, 1, 'Expected one packed package')
  const [pack] = packs
  assert.equal(pack.name, manifest.name)
  assert.equal(pack.version, manifest.version)
  const files = new Set(pack.files.map(file => file.path))
  for (const path of [
    'package.json', 'README.md', 'LICENSE', manifest.main, manifest.types,
    manifest.dsh.bundle.patch, ...exportTargets(manifest.exports),
    'lib/shared/push-config.js', 'lib/types/shared/push-config.d.ts',
  ]) assert(files.has(path.replace(/^\.\//, '')), `Missing published file: ${path}`)
  for (const path of files) {
    assert(!/(^|\/)(node_modules|\.git|\.github|\.gitea|\.env[^/]*|\.local-verify)(\/|$)/.test(path),
      `Unexpected published file: ${path}`)
  }
  return pack
}

export function verifyReleaseArtifact(release, manifest, commit, directory) {
  const { version, distTag } = releaseVersion(manifest.version)
  assert.equal(release.name, manifest.name, 'Package mismatch')
  assert.equal(release.version, version, 'Version mismatch')
  assert.equal(release.distTag, distTag, 'Dist-tag mismatch')
  assert.equal(release.commit, commit, 'Commit mismatch')
  assert(/^[A-Za-z0-9_.-]+\.tgz$/.test(release.filename), 'Invalid artifact filename')
  const filename = resolve(directory, release.filename)
  const integrity = `sha512-${createHash('sha512').update(readFileSync(filename)).digest('base64')}`
  assert.equal(integrity, release.integrity, 'Integrity mismatch')
  return filename
}
