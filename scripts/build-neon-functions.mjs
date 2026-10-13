import { builtinModules, createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const builtins = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)])
const output = resolve('.neon-build/expire/index.mjs')
await mkdir(resolve('.neon-build/expire'), { recursive: true })

await build({
  entryPoints: [resolve('functions/expire/index.ts')],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  minify: true,
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  plugins: [{
    name: 'resolve-npm-without-parent-pnp',
    setup(build) {
      build.onResolve({ filter: /^[^./]/ }, args => {
        if (builtins.has(args.path)) return { path: args.path, external: true }
        try { return { path: require.resolve(args.path, { paths: [args.resolveDir] }) } }
        catch { return undefined }
      })
    },
  }],
})

process.stdout.write('Built Neon expiry function\n')
