const { getDefaultConfig } = require('expo/metro-config')
const fs = require('fs')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')
const coreRoot = path.resolve(monorepoRoot, 'packages/core')
const rnRoot = path.resolve(monorepoRoot, 'packages/react-native')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot)

config.watchFolders = [coreRoot, rnRoot]

config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')]
config.resolver.disableHierarchicalLookup = true

// RN package imports `@incantly/canvas/headless` — Metro needs an explicit alias
// because the demo does not declare core as a direct dependency.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@incantly/canvas': coreRoot,
  '@incantly/canvas-react-native': rnRoot,
}

function resolveExistingFile(filePath) {
  const candidates = [filePath]
  if (!filePath.endsWith('.js')) candidates.push(`${filePath}.js`)
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return { filePath: candidate, type: 'sourceFile' }
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

const upstreamResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@incantly/canvas/headless') {
    return {
      filePath: path.resolve(coreRoot, 'dist/headless.js'),
      type: 'sourceFile',
    }
  }
  if (moduleName === '@incantly/canvas') {
    return {
      filePath: path.resolve(coreRoot, 'dist/index.js'),
      type: 'sourceFile',
    }
  }
  if (moduleName === '@incantly/canvas-react-native/storage') {
    return {
      filePath: path.resolve(rnRoot, 'dist/storage/index.js'),
      type: 'sourceFile',
    }
  }
  if (moduleName === '@incantly/canvas-react-native') {
    return {
      filePath: path.resolve(rnRoot, 'dist/index.js'),
      type: 'sourceFile',
    }
  }
  // Package `exports` + disableHierarchicalLookup can miss new nested dist files
  // (e.g. ./utils/ink/ink-pen.js). Resolve those off disk from the importer.
  const origin = context.originModulePath
  if (moduleName.startsWith('.') && typeof origin === 'string') {
    if (origin.startsWith(coreRoot) || origin.startsWith(rnRoot)) {
      const hit = resolveExistingFile(path.resolve(path.dirname(origin), moduleName))
      if (hit) return hit
    }
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
