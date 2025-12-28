import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const postsPath = path.join(projectRoot, 'public', 'data', 'posts.json')
const legacyRoot = path.join(projectRoot, 'legacy_site', 'ledbyswing.com')

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')

const readJson = (targetPath) => JSON.parse(fs.readFileSync(targetPath, 'utf-8'))

const rewriteRelativeUrls = (html) =>
  html.replace(/\.\.\/\.\.\/\.\.\/\.\.\//g, '/legacy/')

const extractEntryContent = (html) => {
  const marker = 'entry-content'
  const startIndex = html.indexOf(marker)
  if (startIndex === -1) {
    return ''
  }
  const openTagStart = html.lastIndexOf('<div', startIndex)
  if (openTagStart === -1) {
    return ''
  }
  const openTagEnd = html.indexOf('>', openTagStart)
  if (openTagEnd === -1) {
    return ''
  }
  let index = openTagEnd + 1
  let depth = 1
  while (index < html.length) {
    const nextOpen = html.indexOf('<div', index)
    const nextClose = html.indexOf('</div', index)
    if (nextClose === -1) {
      break
    }
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1
      index = nextOpen + 4
      continue
    }
    depth -= 1
    index = nextClose + 5
    if (depth === 0) {
      const closeEnd = html.indexOf('>', index)
      if (closeEnd === -1) {
        return html.slice(openTagEnd + 1, nextClose)
      }
      return html.slice(openTagEnd + 1, nextClose)
    }
  }
  return ''
}

const resolveLegacyFile = (url) => {
  if (!url) {
    return null
  }
  const normalized = url.startsWith('/legacy/') ? url.slice('/legacy'.length) : url
  const trimmed = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
  const direct = path.join(legacyRoot, trimmed)
  const indexPath = path.join(direct, 'index.html')
  if (fs.existsSync(indexPath)) {
    return indexPath
  }
  const htmlPath = `${direct}.html`
  if (fs.existsSync(htmlPath)) {
    return htmlPath
  }
  return null
}

const posts = readJson(postsPath)
const updated = posts.map((post, index) => {
  const url = typeof post.url === 'string' ? post.url : null
  if (!url) {
    return post
  }
  const legacyFile = resolveLegacyFile(url)
  if (!legacyFile) {
    return post
  }
  const html = fs.readFileSync(legacyFile, 'utf-8')
  const entryHtml = extractEntryContent(html)
  const cleaned = rewriteRelativeUrls(entryHtml.trim())
  if (!cleaned) {
    return post
  }
  const slugFromUrl = url.split('/').filter(Boolean).slice(-1)[0]
  const fallbackSlug = typeof post.title === 'object' && post.title?.en
    ? slugify(post.title.en)
    : `legacy-${index}`
  return {
    ...post,
    slug: post.slug || slugFromUrl || fallbackSlug,
    body: cleaned,
    legacy_url: url,
  }
})

fs.writeFileSync(postsPath, JSON.stringify(updated, null, 2) + '\n')
console.log('Legacy posts imported.')
