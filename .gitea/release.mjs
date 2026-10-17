/**
 * Publish one packed plugin tarball to a Gitea release.
 *
 * Runs inside Gitea Actions on a `v*` tag push. Idempotent: a release for the
 * tag is reused, and an asset with the same file name is replaced.
 *
 * @module dsh-notify/release
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const { GITEA_BASE, TOKEN, REPO, TGZ, TAG, SHA } = process.env

/** Fail loudly with the missing variable name. */
function need(name, value) {
  if (!value) {
    console.error(`missing environment variable: ${name}`)
    process.exit(1)
  }
  return value
}

const base = need('GITEA_BASE', GITEA_BASE).replace(/\/+$/u, '')
const token = need('TOKEN', TOKEN)
const repo = need('REPO', REPO)
const tgz = need('TGZ', TGZ)
const tag = need('TAG', TAG)
const sha = SHA ?? ''

const api = `${base}/api/v1/repos/${repo}`
const headers = { Authorization: `token ${token}` }

/** Read a JSON response, tolerating an empty body. */
async function jsonOf(response) {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`)
  }
  return text === '' ? {} : JSON.parse(text)
}

const version = JSON.parse(readFileSync('package.json', 'utf8')).version
if (tag !== `v${version}`) {
  console.error(`tag ${tag} does not match package version ${version}`)
  process.exit(1)
}

const name = basename(tgz)
const body = [
  `自动构建自 \`${sha.slice(0, 12)}\`。`,
  '',
  `tgz 名称：\`${name}\``,
].join('\n')

// Reuse the release for this tag, or create it on the tagged commit.
let release
const found = await fetch(`${api}/releases/tags/${encodeURIComponent(tag)}`, { headers })
if (found.status === 404) {
  release = await jsonOf(await fetch(`${api}/releases`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: tag,
      name: tag,
      body,
      target_commitish: sha,
      draft: false,
      prerelease: false,
    }),
  }))
  console.log(`created release ${release.id} for ${tag}`)
} else {
  release = await jsonOf(found)
  console.log(`reusing release ${release.id} for ${tag}`)
}

// Replace an existing asset with the same name so re-running is safe.
const assets = await jsonOf(await fetch(`${api}/releases/${release.id}/assets`, { headers }))
for (const asset of assets) {
  if (asset.name !== name) continue
  await jsonOf(await fetch(`${api}/releases/${release.id}/assets/${asset.id}`, {
    method: 'DELETE',
    headers,
  }))
  console.log(`deleted previous asset ${asset.name}`)
}

// Upload the freshly built tarball.
const form = new FormData()
form.append('attachment', new Blob([readFileSync(tgz)]), name)
const uploaded = await jsonOf(await fetch(
  `${api}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
  { method: 'POST', headers, body: form },
))

console.log(`uploaded ${uploaded.name} (${uploaded.size} bytes)`)
console.log(`download: ${uploaded.browser_download_url}`)
