import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { releaseVersion, validatePack } from './release-lib.mjs'

test('stable and prerelease versions choose the correct npm dist-tag', () => {
  assert.deepEqual(releaseVersion('1.2.3', 'v1.2.3'), {version:'1.2.3', distTag:'latest'})
  assert.deepEqual(releaseVersion('1.2.3-rc.1', 'v1.2.3-rc.1'), {version:'1.2.3-rc.1', distTag:'next'})
})

test('invalid versions and mismatched tags are rejected', () => {
  for (const version of ['01.0.0', '1.0', '1.0.0+build', '1.0.0-01', undefined]) {
    assert.throws(() => releaseVersion(version), /Unsupported/)
  }
  assert.throws(() => releaseVersion('1.0.0', 'v2.0.0'), /Tag must match/)
})

test('pack validation handles npm 11 and 12 and rejects missing or unexpected files', () => {
  const manifest = {name:'@example/notify',version:'1.0.0',main:'lib/index.js',types:'lib/index.d.ts',dsh:{bundle:{patch:'cordis.patch.yml'}},exports:{'./client':'./lib/client.js'}}
  const paths = ['package.json','README.md','LICENSE','lib/index.js','lib/index.d.ts','cordis.patch.yml','lib/client.js','lib/shared/push-config.js','lib/types/shared/push-config.d.ts']
  const pack = {name:manifest.name,version:manifest.version,files:paths.map(path=>({path}))}
  assert.equal(validatePack([pack],manifest),pack)
  assert.equal(validatePack({[pack.name]:pack},manifest),pack)
  assert.throws(()=>validatePack([{...pack,files:pack.files.slice(0,-1)}],manifest),/Missing/)
  assert.throws(()=>validatePack([{...pack,files:[...pack.files,{path:'.env'}]}],manifest),/Unexpected/)
  assert.throws(()=>validatePack([pack,pack],manifest),/Expected one/)
})

const script = fileURLToPath(new URL('./publish-release.mjs', import.meta.url))
function fixture(t) {
  const root=mkdtempSync(resolve(tmpdir(),'notify-release-test-'))
  t.after(()=>rmSync(root,{recursive:true,force:true}))
  mkdirSync(resolve(root,'dist'));mkdirSync(resolve(root,'bin'))
  writeFileSync(resolve(root,'package.json'),JSON.stringify({name:'@example/notify',version:'1.0.0'}))
  const bytes=Buffer.from('packed artifact')
  const release={name:'@example/notify',version:'1.0.0',distTag:'latest',filename:'notify-1.0.0.tgz',commit:'a'.repeat(40),integrity:`sha512-${createHash('sha512').update(bytes).digest('base64')}`}
  writeFileSync(resolve(root,'dist',release.filename),bytes)
  writeFileSync(resolve(root,'dist/release.json'),JSON.stringify(release))
  writeFileSync(resolve(root,'bin/package.json'),'{"type":"module"}')
  writeFileSync(resolve(root,'bin/npm'),`#!/usr/bin/env node
import fs from 'node:fs';
const args=process.argv.slice(2);
fs.appendFileSync('calls.jsonl',JSON.stringify(args)+'\\n');
if(args[0]==='view'){
 if(process.env.MOCK_ERROR){console.log(JSON.stringify({error:{code:process.env.MOCK_ERROR}}));process.exit(1)}
 console.log(JSON.stringify({version:'1.0.0',dist:{integrity:process.env.MOCK_INTEGRITY}}));
}
`,{mode:0o755})
  const env={...process.env,PATH:resolve(root,'bin')+delimiter+process.env.PATH,GITHUB_EVENT_NAME:'push',GITHUB_REF_TYPE:'tag',GITHUB_REF_NAME:'v1.0.0',GITHUB_SHA:release.commit,MOCK_ERROR:'E404'}
  return {root,release,env,run:()=>spawnSync(process.execPath,[script],{cwd:root,env,encoding:'utf8'}),calls:()=>existsSync(resolve(root,'calls.jsonl'))?readFileSync(resolve(root,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse):[]}
}

test('only tag pushes publish; manual and branch runs cannot call npm', t => {
  const f=fixture(t);f.env.GITHUB_EVENT_NAME='workflow_dispatch'
  assert.notEqual(f.run().status,0);assert.deepEqual(f.calls(),[])
  f.env.GITHUB_EVENT_NAME='push';f.env.GITHUB_REF_TYPE='branch'
  assert.notEqual(f.run().status,0);assert.deepEqual(f.calls(),[])
})

for(const [field,value] of [['version','2.0.0'],['distTag','next'],['commit','b'.repeat(40)],['filename','../escape.tgz'],['integrity','sha512-invalid']]){
  test(`artifact ${field} mismatch fails before npm access`,t=>{
    const f=fixture(t);f.release[field]=value
    writeFileSync(resolve(f.root,'dist/release.json'),JSON.stringify(f.release))
    assert.notEqual(f.run().status,0);assert.deepEqual(f.calls(),[])
  })
}

test('registry errors cannot be mistaken for an unpublished version',t=>{
  const f=fixture(t);f.env.MOCK_ERROR='E401'
  assert.notEqual(f.run().status,0);assert.deepEqual(f.calls().map(x=>x[0]),['view'])
})

test('a new version publishes the checked tarball with public access and provenance',t=>{
  const f=fixture(t);const result=f.run();assert.equal(result.status,0,result.stderr)
  const call=f.calls().find(x=>x[0]==='publish')
  assert.equal(call[1],resolve(f.root,'dist',f.release.filename))
  for(const flag of ['--provenance','--ignore-scripts','--access','public','--tag','latest'])assert(call.includes(flag))
})

test('reruns skip the same package and reject different contents at the same version',t=>{
  const f=fixture(t);delete f.env.MOCK_ERROR;f.env.MOCK_INTEGRITY=f.release.integrity
  assert.equal(f.run().status,0);assert.deepEqual(f.calls().map(x=>x[0]),['view'])
  f.env.MOCK_INTEGRITY='different';assert.notEqual(f.run().status,0)
  assert.deepEqual(f.calls().map(x=>x[0]),['view','view'])
})
