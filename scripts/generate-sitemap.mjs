import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'

const baseUrl = 'https://ledbyswing.com'
const languages = ['en', 'pl', 'fr', 'de', 'it', 'es']
const routes = ['', '/clubs', '/events', '/map', '/blog', '/guidelines', '/register']

const lastmod = new Date().toISOString().split('T')[0]
const urls = languages.flatMap((lang) =>
  routes.map((route) => `${baseUrl}/${lang}${route}`)
)

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls
    .map(
      (loc) =>
        `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`
    )
    .join('\n') +
  `\n</urlset>\n`

const outputPath = join(process.cwd(), 'public')
await mkdir(outputPath, { recursive: true })
await writeFile(join(outputPath, 'sitemap.xml'), xml)
