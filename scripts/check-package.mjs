import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readJson, validatePack } from './release-lib.mjs'

const destination = mkdtempSync(join(tmpdir(), 'dsh-notify-pack-'))
try {
  const result = JSON.parse(execFileSync('npm', [
    'pack', '--json', '--ignore-scripts', '--pack-destination', destination,
  ], { encoding: 'utf8' }))
  const pack = validatePack(result, readJson('package.json'))
  console.log(`Validated ${pack.name}@${pack.version}: ${pack.files.length} published files`)
} finally {
  rmSync(destination, { recursive: true, force: true })
}
