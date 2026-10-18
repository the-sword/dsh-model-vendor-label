/**
 * Build the release artifacts for this plugin.
 *
 * Writes into dist/:
 *   dsh-model-vendor-label-<version>.tgz      npm tarball (what dsh plugin add eats)
 *   dsh-model-vendor-label-<version>.zip      zip of the plugin files (offline unzip)
 *   dsh-model-vendor-label-<version>.tar.gz   tar.gz of the plugin files (offline untar)
 *   SHA256SUMS.txt                            checksums of the three above
 *
 * The zip and tar.gz carry a single top-level directory named after the
 * package, so unpacking yields a directly installable directory.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const base = `${pkg.name}-${pkg.version}`
const dist = join(root, 'dist')

/** Files shipped both in the npm tarball and in the offline archives. */
const shipped = ['package.json', 'index.js', 'client.js', 'cordis.patch.yml', 'README.md', 'LICENSE']

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })

// A private cache keeps the pack independent of a machine-global npm cache
// (and of CI caching quirks); --ignore-scripts: packing must not run code.
execFileSync('npm', ['pack', '--ignore-scripts', '--pack-destination', dist], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, npm_config_cache: join(dist, '.npm-cache') },
})

// Stage the archive root so the archives unpack into an installable directory.
const stage = join(dist, base)
await mkdir(stage, { recursive: true })
for (const file of shipped) {
  await writeFile(join(stage, file), await readFile(join(root, file)))
}

execFileSync('zip', ['-qr', `${base}.zip`, base], { cwd: dist, stdio: 'inherit' })
execFileSync('tar', ['-czf', `${base}.tar.gz`, base], { cwd: dist, stdio: 'inherit' })
await rm(stage, { recursive: true, force: true })
await rm(join(dist, '.npm-cache'), { recursive: true, force: true })

const artifacts = [`${base}.tgz`, `${base}.zip`, `${base}.tar.gz`]
const lines = []
for (const name of artifacts) {
  const bytes = await readFile(join(dist, name))
  lines.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`)
}
await writeFile(join(dist, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`)
console.log(`\n${base}: ${artifacts.join(', ')}, SHA256SUMS.txt`)
