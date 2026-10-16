import { createReadStream, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'

// Keep fonts/decoders on our origin; document viewing never needs a public CDN.
export function pdfAssets(): Plugin {
  const require = createRequire(import.meta.url)
  const root = dirname(require.resolve('pdfjs-dist/package.json'))
  const assets = new Map<string, string>()
  for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
    for (const entry of readdirSync(join(root, folder), { withFileTypes: true })) {
      if (entry.isFile()) assets.set(`pdf-assets/${folder}/${entry.name}`, join(root, folder, entry.name))
    }
  }
  return {
    name: 'local-pdf-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0].replace(/^\//, '') ?? ''
        const file = assets.get(path)
        if (!file || request.method !== 'GET') { next(); return }
        response.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
        createReadStream(file).on('error', () => { response.statusCode = 500; response.end() }).pipe(response)
      })
    },
    generateBundle() {
      for (const [fileName, path] of assets) this.emitFile({ type: 'asset', fileName, source: readFileSync(path) })
    },
  }
}
