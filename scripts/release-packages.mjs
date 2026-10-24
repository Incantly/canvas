// Builds the workspace packages into publishable folders under .release/ and,
// with --publish, publishes them to GitHub Packages (npm.pkg.github.com).
//
//   npm run release               build .release/<pkg> for every package
//   npm run release -- --publish  build, then `npm publish` each one
//
// The workspace package.json files are left untouched: development keeps
// running from source, and only the generated release package.json files point
// at the bundled dist/. See docs/installing.md.

import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'Incantly/canvas'
const REGISTRY = 'https://npm.pkg.github.com'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseRoot = join(root, '.release')
const publish = process.argv.includes('--publish')

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const run = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })

// ---------------------------------------------------------------------------
// Discover packages and order them so dependencies build first.

const packages = readdirSync(join(root, 'packages'))
  .map((name) => join(root, 'packages', name))
  .filter((dir) => existsSync(join(dir, 'package.json')))
  .map((dir) => ({ dir, pkg: readJson(join(dir, 'package.json')) }))
  .filter(({ pkg }) => !pkg.private)

const names = new Set(packages.map(({ pkg }) => pkg.name))
const internalDeps = ({ pkg }) =>
  Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }).filter((d) => names.has(d))

const ordered = []
const visit = (entry, stack = []) => {
  if (ordered.includes(entry)) return
  if (stack.includes(entry)) throw new Error(`dependency cycle at ${entry.pkg.name}`)
  for (const dep of internalDeps(entry)) visit(packages.find((p) => p.pkg.name === dep), [...stack, entry])
  ordered.push(entry)
}
packages.forEach((entry) => visit(entry))

const versions = new Set(ordered.map(({ pkg }) => pkg.version))
if (versions.size !== 1) {
  throw new Error(
    'packages must share one version: ' + ordered.map(({ pkg }) => `${pkg.name}@${pkg.version}`).join(', ')
  )
}
const [version] = versions

// ---------------------------------------------------------------------------
// Code generation. The React Native package embeds a bundled WebView page
// (src/board-html.generated.js), built from @incantly/core's tsc output.

run('npm', ['run', 'build', '--workspace=@incantly/core'])
run('node', ['packages/react-native/scripts/build-html.mjs'])

// ---------------------------------------------------------------------------

rmSync(releaseRoot, { recursive: true, force: true })
mkdirSync(releaseRoot, { recursive: true })

// Released export maps by package name, used to point tsc at sibling .d.ts.
const released = new Map()

for (const entry of ordered) await buildPackage(entry)

if (publish) {
  for (const { pkg } of ordered) {
    const args = ['publish']
    if (version.includes('-')) args.push('--tag', 'next')
    console.log(`\n> npm ${args.join(' ')}  (${pkg.name}@${version})`)
    run('npm', args, releaseDir(pkg))
  }
} else {
  console.log(`\nBuilt ${ordered.length} packages at ${version} into .release/ (not published).`)
}

function releaseDir(pkg) {
  return join(releaseRoot, pkg.name.split('/').pop())
}

async function buildPackage({ dir, pkg }) {
  const out = releaseDir(pkg)
  const dist = join(out, 'dist')
  console.log(`\n=== ${pkg.name}@${version}`)

  // Split exports into code entries ({ types, default } -> dist/*.js) and
  // plain files (CSS) that are copied into dist/.
  const entryPoints = []
  const exportsMap = {}
  const copied = new Map()
  for (const [key, target] of Object.entries(pkg.exports)) {
    if (key === './package.json') {
      exportsMap[key] = './package.json'
    } else if (typeof target === 'string') {
      const file = basename(target)
      copied.set(file, join(dir, target))
      exportsMap[key] = `./dist/${file}`
    } else {
      const outName = target.default.replace(/^\.\/dist\//, '').replace(/\.js$/, '')
      const source = ['.ts', '.tsx'].map((ext) => join(dir, 'src', outName + ext)).find(existsSync)
      if (!source) throw new Error(`${pkg.name}: no source for export "${key}" (${outName}.ts[x])`)
      entryPoints.push({ in: source, out: outName })
      exportsMap[key] = { types: `./dist/${outName}.d.ts`, default: `./dist/${outName}.js` }
    }
  }

  await build({
    entryPoints,
    outdir: dist,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    sourcemap: true,
    jsx: 'automatic',
    packages: 'external',
    external: ['node:*'],
    logLevel: 'warning',
  })
  for (const [file, from] of copied) copyFileSync(from, join(dist, file))

  emitTypes(dir, pkg, dist)
  rewriteDeclarationImports(dist)
  for (const { out: outName } of entryPoints) {
    if (!existsSync(join(dist, `${outName}.d.ts`))) throw new Error(`${pkg.name}: tsc did not emit ${outName}.d.ts`)
  }

  const pinInternal = (deps) =>
    deps && Object.fromEntries(Object.entries(deps).map(([n, v]) => [n, names.has(n) ? version : v]))

  const releasePkg = {
    name: pkg.name,
    version,
    description: pkg.description,
    keywords: pkg.keywords,
    license: pkg.license,
    homepage: `https://github.com/${REPO}`,
    bugs: `https://github.com/${REPO}/issues`,
    repository: {
      type: 'git',
      url: `git+https://github.com/${REPO}.git`,
      directory: relative(root, dir),
    },
    type: 'module',
    main: exportsMap['.']?.default,
    types: exportsMap['.']?.types,
    exports: exportsMap,
    files: ['dist'],
    // Bundled chunks no longer match the source paths listed in the workspace
    // package.json, so only an explicit `false` carries over.
    ...(pkg.sideEffects === false ? { sideEffects: false } : {}),
    dependencies: pinInternal(pkg.dependencies),
    peerDependencies: pkg.peerDependencies,
    peerDependenciesMeta: pkg.peerDependenciesMeta,
    publishConfig: { registry: REGISTRY },
  }
  writeFileSync(join(out, 'package.json'), JSON.stringify(releasePkg, null, 2) + '\n')
  if (existsSync(join(dir, 'README.md'))) copyFileSync(join(dir, 'README.md'), join(out, 'README.md'))
  copyFileSync(join(root, 'LICENSE'), join(out, 'LICENSE'))

  released.set(pkg.name, { dist, exports: exportsMap })
}

// Emit .d.ts with tsc. Sibling packages resolve through `paths` to their
// already-released .d.ts; otherwise tsc follows the workspace symlinks into
// their src/ and fails with rootDir errors.
function emitTypes(dir, pkg, dist) {
  const local = readJson(join(dir, 'tsconfig.json'))
  const paths = {}
  for (const [name, { dist: depDist, exports }] of released) {
    for (const [key, target] of Object.entries(exports)) {
      if (typeof target !== 'object') continue
      paths[name + key.slice(1)] = [join(depDist, target.types.replace(/^\.\/dist\//, ''))]
    }
  }

  const tsconfig = {
    extends: join(root, 'tsconfig.json'),
    compilerOptions: {
      rootDir: join(dir, 'src'),
      outDir: dist,
      declaration: true,
      emitDeclarationOnly: true,
      declarationMap: false,
      sourceMap: false,
      composite: false,
      incremental: false,
      noEmit: false,
      jsx: local.compilerOptions?.jsx ?? 'react-jsx',
      allowJs: local.compilerOptions?.allowJs ?? false,
      types: [],
      paths,
    },
    include: (local.include ?? ['src']).map((p) => join(dir, p)),
    exclude: (local.exclude ?? []).map((p) => join(dir, p)),
  }
  const file = join(releaseRoot, `tsconfig.${pkg.name.split('/').pop()}.json`)
  writeFileSync(file, JSON.stringify(tsconfig, null, 2))
  run(join(root, 'node_modules/.bin/tsc'), ['-p', file])
  rmSync(file)
}

// Consumers on moduleResolution nodenext need explicit extensions, so
// rewrite extensionless relative specifiers to `.js` or `/index.js`.
function rewriteDeclarationImports(dist) {
  const spec = /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])(\.\.?\/[^'"]*)\2/g
  for (const file of walk(dist)) {
    if (!file.endsWith('.d.ts')) continue
    const source = readFileSync(file, 'utf8')
    const next = source.replace(spec, (match, lead, quote, path) => {
      if (/\.(js|mjs|cjs|json)$/.test(path)) return match
      const base = resolve(dirname(file), path)
      if (existsSync(base + '.d.ts')) return `${lead}${quote}${path}.js${quote}`
      if (existsSync(join(base, 'index.d.ts'))) return `${lead}${quote}${path.replace(/\/$/, '')}/index.js${quote}`
      throw new Error(`cannot resolve "${path}" in ${relative(root, file)}`)
    })
    if (next !== source) writeFileSync(file, next)
  }
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* walk(full)
    else yield full
  }
}
