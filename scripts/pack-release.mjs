import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readJson, releaseVersion, validatePack, verifyReleaseArtifact } from './release-lib.mjs'

const manifest = readJson('package.json')
assert(!manifest.private, 'Cannot release a private package')
const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined
const version = releaseVersion(manifest.version, tag)
const commit = process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const directory = resolve('dist')
mkdirSync(directory, { recursive: true })
const result = JSON.parse(execFileSync('npm', [
  'pack', '--json', '--ignore-scripts', '--pack-destination', directory,
], { encoding: 'utf8' }))
const pack = validatePack(result, manifest)
const release = { name: pack.name, ...version, filename: pack.filename, integrity: pack.integrity, commit }
verifyReleaseArtifact(release, manifest, commit, directory)
writeFileSync(resolve(directory, 'release.json'), `${JSON.stringify(release, null, 2)}\n`)
console.log(`Packed ${release.name}@${release.version} for ${release.distTag}: ${release.filename}`)
