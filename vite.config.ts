import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'

import siteConfiguration from './.figma/make/site.json' with { type: 'json' }
import { computeCacheVersion } from './src/shared/lib/pwa/cacheVersion'
import { HELPLINES, HELPLINES_LAST_VERIFIED } from './src/shared/lib/pwa/helplines'
import { renderOfflinePage } from './src/shared/lib/offline/offlinePage'


// Vite config — https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // .figma/make/deploy-preview passes `--mode development` for cached-preview builds.
  const emitSourcemaps = mode === 'development'
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    base: process.env.FIGMA_PUBLIC_URL ? `${process.env.FIGMA_PUBLIC_URL}/` : '/',
    build: {
      sourcemap: emitSourcemaps ? 'inline' : false,
      manifest: true,
      minify: !emitSourcemaps,
      target: 'es2022',
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks: vendorChunk,
        },
      },
    },
    plugins: [
react(),
      tailwindcss(),
      figmaSiteConfiguration(siteConfiguration),
      supabasePreconnect(env.VITE_SUPABASE_URL),
      pwaServiceWorker(),
      figmaErrorOverlayReplay(),
      figmaReactRefreshBoundaryFallback(),
      figmaMakeKitPlugin({ storiesGlob: '/src/**/*.stories.{ts,tsx,js,jsx}' }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      host: process.env.FIGMA_DEV_SERVER_HOST || '0.0.0.0',
      port: parseInt(process.env.PORT || '8443'),
      strictPort: true,
      watch: {
        ignored: [
          '**/.figma/**',
          // Never watch test output or generated folders: Playwright keeps trace and network
          // recordings open there, and a locked file (EBUSY) made the dev server crash.
          '**/test-results*/**',
          '**/playwright-report/**',
          '**/dist/**',
          '**/dist-pwa/**',
          '**/coverage/**',
          '**/supabase/.temp/**',
          '**/node_modules/**',
        ],
      },
    },
    preview: {
      host: process.env.FIGMA_DEV_SERVER_HOST || '0.0.0.0',
      port: parseInt(process.env.PORT || '8443'),
    },
  }
})

/**
 * Writes the final dist/sw.js and dist/offline.html. Precache entries come from the real Vite build
 * manifest (never hard-coded hashed names): the entry chunk plus the lazy chunks of the offline-capable routes.
 * The cache version hashes the precache list together with src/shared/lib/pwa/helplines.ts.
 */
function pwaServiceWorker(): Plugin {
  // Lazy route modules (keys of .vite/manifest.json) whose chunks must work offline.
  const ROUTE_CHUNKS: Record<string, string[]> = {
    '/login': ['src/features/auth/Login.tsx'],
    '/crisis': ['src/features/crisis/CrisisPage.tsx'],
    '/chat': ['src/features/chat/Chat.tsx', 'src/features/modals/BreathingModal.tsx', 'src/features/modals/GroundingModal.tsx'],
    '/dashboard': ['src/features/dashboard/Dashboard.tsx'],
  }
  const STATIC_FILES = ['index.html', 'offline.html', 'offline.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']
  let outDir = ''
  let root = ''
  let basePath = '/'

  type ManifestChunk = { file: string; css?: string[]; assets?: string[]; imports?: string[]; isEntry?: boolean; src?: string }

  return {
    name: 'mindsahaay-pwa-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
      root = config.root
      basePath = new URL(config.base, 'http://localhost').pathname
    },
    closeBundle() {
      const manifestPath = path.join(outDir, '.vite', 'manifest.json')
      if (!fs.existsSync(manifestPath)) {
        this.warn('pwa: build manifest missing, service worker not written')
        return
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, ManifestChunk>
      const files = new Set<string>(STATIC_FILES)
      const seen = new Set<string>()
      const collect = (key: string) => {
        const chunk = manifest[key]
        if (!chunk || seen.has(key)) return
        seen.add(key)
        files.add(chunk.file)
        chunk.css?.forEach((f) => files.add(f))
        chunk.assets?.forEach((f) => files.add(f))
        chunk.imports?.forEach(collect)
      }
      for (const [key, chunk] of Object.entries(manifest)) if (chunk.isEntry) collect(key)
      for (const keys of Object.values(ROUTE_CHUNKS)) {
        for (const key of keys) {
          if (!manifest[key]) this.warn(`pwa: route chunk ${key} not found in build manifest`)
          collect(key)
        }
      }

      const toUrl = (f: string) => (f === 'index.html' ? basePath + 'index.html' : basePath + f)
      const precache = Array.from(files).map(toUrl).sort()
      const helplinesSource = fs.readFileSync(path.resolve(root, 'src/shared/lib/pwa/helplines.ts'), 'utf8')
      const version = computeCacheVersion(precache, helplinesSource)
      const shellRoutes = ['/', ...Object.keys(ROUTE_CHUNKS)].map((r) => (r === '/' ? basePath : basePath.replace(/\/$/, '') + r))

      const swSource = fs.readFileSync(path.resolve(root, 'public/sw.js'), 'utf8')
      const swOut = swSource
        .replace(/\/\*SW_VERSION\*\/\s*"[^"]*"/, `/*SW_VERSION*/ ${JSON.stringify(version)}`)
        .replace(/\/\*SW_PRECACHE\*\/\s*\[[^\]]*\]/, `/*SW_PRECACHE*/ ${JSON.stringify(precache)}`)
        .replace(/\/\*SW_SHELL_ROUTES\*\/\s*\[[^\]]*\]/, `/*SW_SHELL_ROUTES*/ ${JSON.stringify(shellRoutes)}`)
      if (!swOut.includes(version)) throw new Error('pwa: failed to inject cache version into sw.js')
      fs.writeFileSync(path.join(outDir, 'sw.js'), swOut)

      // Render the offline page's helpline list from the same data the app uses so the two cannot drift.
      // Every value is HTML-escaped inside renderOfflinePage (see src/shared/lib/offline/offlinePage.ts).
      const offlineSource = fs.readFileSync(path.resolve(root, 'public/offline.html'), 'utf8')
      const offlineOut = renderOfflinePage(offlineSource, HELPLINES, HELPLINES_LAST_VERIFIED)
      fs.writeFileSync(path.join(outDir, 'offline.html'), offlineOut)
    },
  }
}

/**
 * Splits third-party code into stable, cacheable vendor chunks. recharts and the Supabase SDK are
 * only reachable from lazy routes or a dynamic import, so they stay out of the entry graph.
 */
function vendorChunk(id: string): string | undefined {
  const match = /[\\/]node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?((?:@[^\\/]+[\\/])?[^\\/]+)/.exec(id)
  if (!match) return undefined
  const pkg = match[1].replace(/\\/g, '/')
  if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') return 'vendor-react'
  if (pkg === 'react-router' || pkg === 'react-router-dom') return 'vendor-router'
  if (pkg.startsWith('@tanstack/')) return 'vendor-query'
  if (pkg.startsWith('@supabase/') || pkg === 'iceberg-js' || pkg === 'tslib') return 'vendor-supabase'
  if (pkg === 'recharts' || pkg.startsWith('d3-') || pkg === 'victory-vendor' || pkg === 'decimal.js-light' || pkg === 'es-toolkit') return 'vendor-recharts'
  if (pkg === 'i18next' || pkg === 'react-i18next') return 'vendor-i18n'
  if (pkg === 'zod') return 'vendor-zod'
  return undefined
}

/**
 * Adds a preconnect hint for the Supabase origin. The origin comes only from VITE_SUPABASE_URL;
 * nothing is emitted when it is unset or not an http(s) URL.
 */
function supabasePreconnect(rawUrl: string | undefined): Plugin {
  let origin = ''
  try {
    const parsed = rawUrl ? new URL(rawUrl) : null
    if (parsed && (parsed.protocol === 'https:' || parsed.protocol === 'http:')) origin = parsed.origin
  } catch {
    origin = ''
  }
  return {
    name: 'supabase-preconnect',
    transformIndexHtml() {
      if (!origin) return []
      return [{ tag: 'link', attrs: { rel: 'preconnect', href: origin, crossorigin: '' }, injectTo: 'head-prepend' }]
    },
  }
}

type FigmaSiteConfiguration = {
  title?: string
  description?: string
  language?: string
  robots?: {
    index?: boolean
  }
  icons?: {
    icon?: string
  }
  openGraph?: {
    image?: string
  }
  analytics?: {
    googleAnalyticsId?: string
  }
  customScripts?: {
    headStart?: string
    headEnd?: string
    bodyStart?: string
    bodyEnd?: string
  }
  accessibility?: {
    addBypassLinks?: boolean
  }
}

/** Applies /.figma/make/site.json to the generated document shell. */
function figmaSiteConfiguration(config: FigmaSiteConfiguration): Plugin {
  function sanitizeHtmlValue(value: string | undefined): string {
    return value?.replace(/[^a-zA-Z0-9_-]/g, '') || ''
  }
  function escapeHtmlText(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  function replaceHtmlCommentSlot(html: string, slotName: string, content: string): string {
    return html.replace(`<!-- ${slotName} -->`, content)
  }

  const title = config.title ?? "Figma Make App"
  const description = config.description ?? ''
  const favicon = config.icons?.icon ?? ''
  const socialImage = config.openGraph?.image ?? ''
  const language = sanitizeHtmlValue(config.language) || 'en'
  const googleAnalyticsId = sanitizeHtmlValue(config.analytics?.googleAnalyticsId)
  const headStart = config.customScripts?.headStart ?? ''
  const headEnd = config.customScripts?.headEnd ?? ''
  const bodyStart = config.customScripts?.bodyStart ?? ''
  const bodyEnd = config.customScripts?.bodyEnd ?? ''
  const robotsTxt = config.robots?.index === false ? 'User-agent: *\nDisallow: /\n' : ''

  return {
    name: 'figma-site-configuration',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!robotsTxt || req.url?.split('?')[0] !== '/robots.txt') return next()

        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(robotsTxt)
      })
    },
    generateBundle() {
      if (!robotsTxt) return

      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: robotsTxt,
      })
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        let result = html
        result = replaceHtmlCommentSlot(result, 'figma:lang', language)
        result = replaceHtmlCommentSlot(result, 'figma:title', escapeHtmlText(title))
        result = replaceHtmlCommentSlot(result, 'figma:head-start', headStart)
        result = replaceHtmlCommentSlot(result, 'figma:head-end', headEnd)
        result = replaceHtmlCommentSlot(result, 'figma:body-start', bodyStart)
        result = replaceHtmlCommentSlot(result, 'figma:body-end', bodyEnd)

        const tags: HtmlTagDescriptor[] = []
        if (description) {
          tags.push({ tag: 'meta', attrs: { name: 'description', content: description }, injectTo: 'head' })
        }
        if (config.robots?.index === false) {
          tags.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' }, injectTo: 'head' })
        }
        if (favicon) {
          tags.push({ tag: 'link', attrs: { rel: 'icon', href: favicon }, injectTo: 'head' })
        }
        if (title) {
          tags.push({ tag: 'meta', attrs: { property: 'og:title', content: title }, injectTo: 'head' })
        }
        if (description) {
          tags.push({ tag: 'meta', attrs: { property: 'og:description', content: description }, injectTo: 'head' })
        }
        if (socialImage) {
          tags.push(
            { tag: 'meta', attrs: { property: 'og:image', content: socialImage }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'twitter:image', content: socialImage }, injectTo: 'head' },
          )
        }

        if (googleAnalyticsId) {
          tags.push(
            {
              tag: 'script',
              attrs: {
                async: true,
                src: `https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`,
              },
              injectTo: 'head',
            },
            {
              tag: 'script',
              children: `
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', ${JSON.stringify(googleAnalyticsId)});
`,
              injectTo: 'head',
            },
          )
        }

        if (config.accessibility?.addBypassLinks) {
          tags.push(
            {
              tag: 'style',
              children: `
  .figma-bypass-link {
    position: fixed;
    top: 8px;
    left: 8px;
    z-index: 2147483647;
    transform: translateY(-150%);
    border-radius: 6px;
    background: #111827;
    color: #fff;
    padding: 8px 12px;
    font: 600 14px/1.2 system-ui, sans-serif;
    text-decoration: none;
  }
  .figma-bypass-link:focus {
    transform: translateY(0);
  }
`,
              injectTo: 'head',
            },
            {
              tag: 'a',
              attrs: { class: 'figma-bypass-link', href: '#root' },
              children: 'Skip to content',
              injectTo: 'body-prepend',
            },
          )
        }

        return {
          html: result,
          tags,
        }
      },
    },
  }
}

/**
 * Replay the most recent build error to clients that connect after
 * it was first broadcast. Vite buffers an error payload only while
 * no clients are connected and clears the buffer on the first
 * reconnect (see `bufferedMessage` in `createWebSocketServer`), so
 * if the preview iframe reloads after Vite already delivered an
 * error to a live socket, the new socket misses the payload and
 * the overlay stays hidden even though the build is still broken.
 * We intercept `ws.send` to remember the latest error and replay
 * it on every new connection; the cache clears on a successful
 * `update` or `full-reload` so a stale overlay can't survive a
 * fixed build.
 */
function figmaErrorOverlayReplay(): Plugin {
  return {
    name: 'figma-error-overlay-replay',
    apply: 'serve',
    configureServer(server) {
      let lastError: object | null = null

      const origSend = server.ws.send.bind(server.ws) as (...args: any[]) => void
      server.ws.send = ((...args: any[]) => {
        const payload = args[0]
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          const type = (payload as { type?: string }).type
          if (type === 'error') {
            lastError = payload as object
          } else if (type === 'update' || type === 'full-reload') {
            lastError = null
          }
        }
        return origSend(...args)
      }) as typeof server.ws.send

      server.ws.on('connection', (socket) => {
        if (lastError !== null) {
          socket.send(JSON.stringify(lastError))
        }
      })
    },
  }
}

/**
 * Reload when a module that previously defined a React Refresh boundary stops
 * defining one. This happens when an agent moves a component into a new file
 * and replaces the old module with a re-export:
 *
 *   export { default } from './app/App'
 *
 * Vite otherwise accepts the update using the previous module's HMR boundary,
 * but the re-export-only transform no longer registers a replacement for the
 * mounted component family. React reports a successful refresh while leaving
 * the old tree mounted until the page is reloaded.
 */
function figmaReactRefreshBoundaryFallback(): Plugin {
  type ModuleNode = import('vite').ModuleNode
  const hadRefreshBoundary = new Map<string, boolean>()
  const lostRefreshBoundaries = new Set<string>()
  let sendFullReload: (() => void) | null = null

  return {
    name: 'figma-react-refresh-boundary-fallback',
    apply: 'serve',
    enforce: 'post',
    configureServer(server) {
      sendFullReload = () => server.ws.send({ type: 'full-reload', path: '*' })
    },
    handleHotUpdate({ modules, server, timestamp }) {
      if (lostRefreshBoundaries.size === 0) return

      const visited = new Set<ModuleNode>()
      const pending = [...modules]
      while (pending.length > 0) {
        const current = pending.pop()
        if (!current || visited.has(current)) continue
        visited.add(current)

        const moduleId = current.id?.split('?')[0]
        if (moduleId && lostRefreshBoundaries.has(moduleId)) {
          const invalidated = new Set<ModuleNode>()
          for (const updatedModule of modules) {
            server.moduleGraph.invalidateModule(updatedModule, invalidated, timestamp, true)
          }
          sendFullReload?.()
          return []
        }

        pending.push(...current.importers)
      }
    },
    transform(code, id) {
      if (!/\.[jt]sx?(?:\?|$)/.test(id) || id.includes('/node_modules/')) return null

      const moduleId = id.split('?')[0] ?? id
      const hasRefreshBoundary = code.includes('registerExportsForReactRefresh')
      const previousHadRefreshBoundary = hadRefreshBoundary.get(moduleId)
      hadRefreshBoundary.set(moduleId, hasRefreshBoundary)

      if (hasRefreshBoundary) lostRefreshBoundaries.delete(moduleId)
      if (previousHadRefreshBoundary && !hasRefreshBoundary) {
        lostRefreshBoundaries.add(moduleId)
        queueMicrotask(() => sendFullReload?.())
      }

      return null
    },
  }
}

/**
 * Serves a blank render-target page at /.figma/make/kit.html that
 * the Figma preview script drives directly. The page exposes a
 * registry of every file matching `storiesGlob` on
 * window.__FIGMA__.stories so the design surface can dynamically
 * import + mount each entry into its own grid view.
 *
 * Dev-only: `apply: 'serve'` gates the plugin to `vite dev`. Prod
 * builds (`vite build`) skip it entirely so the route doesn't leak
 * into shipped bundles.
 */
function figmaMakeKitPlugin(options: { storiesGlob: string | string[] }): Plugin {
  const storiesGlob = Array.isArray(options.storiesGlob) ? options.storiesGlob : [options.storiesGlob]
  const ROUTE = '/.figma/make/kit.html'
  const VIRTUAL_ID = 'virtual:figma-stories'
  const RESOLVED_ID = '\0' + VIRTUAL_ID
  const STORIES_MODULE = `export const stories = import.meta.glob(${JSON.stringify(storiesGlob)})`
  const HTML_BOOTSTRAP = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body>
<div id="figma-make-kit-root"></div>
<script type="module">
  import { stories } from 'virtual:figma-stories'
  window.__FIGMA__ = Object.assign(window.__FIGMA__ ?? {}, { stories })
  window.dispatchEvent(new CustomEvent('figma.ready'))
</script>
</body>
</html>`

  return {
    name: 'figma-make-kit',
    apply: 'serve',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
      return null
    },
    load(id) {
      if (id !== RESOLVED_ID) return null
      return STORIES_MODULE
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || ''
        if (url.split('?')[0] !== ROUTE) return next()

        try {
          res.setHeader('Content-Type', 'text/html')
          res.end(await server.transformIndexHtml(url, HTML_BOOTSTRAP))
        } catch (err) {
          next(err as Error)
        }
      })
    },
  }
}
