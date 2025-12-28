import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const fallbackPath = path.join(projectRoot, 'public', 'data', 'posts.json')
const firebaseRcPath = path.join(projectRoot, '.firebaserc')

const readProjectId = () => {
  if (process.env.FIREBASE_PROJECT_ID) {
    return process.env.FIREBASE_PROJECT_ID
  }
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    return process.env.GOOGLE_CLOUD_PROJECT
  }
  if (fs.existsSync(firebaseRcPath)) {
    try {
      const rc = JSON.parse(fs.readFileSync(firebaseRcPath, 'utf-8'))
      const defaultProject = rc?.projects?.default
      if (typeof defaultProject === 'string' && defaultProject) {
        return defaultProject
      }
    } catch {
      return undefined
    }
  }
  return undefined
}

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')

const loadPostsJson = () => {
  try {
    const raw = execSync('git show HEAD:public/data/posts.json', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return JSON.parse(raw)
  } catch {
    if (fs.existsSync(fallbackPath)) {
      return JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'))
    }
  }
  throw new Error('Unable to load legacy posts JSON from git history or disk.')
}

const toSlug = (post, index, used) => {
  const title = post?.title?.en || post?.title?.pl || post?.title || `legacy-${index}`
  const base = post?.slug || slugify(String(title)) || `legacy-${index}`
  let slug = base
  let suffix = 2
  while (used.has(slug)) {
    slug = `${base}-${suffix}`
    suffix += 1
  }
  used.add(slug)
  return slug
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: readProjectId(),
  })
}

const db = admin.firestore()
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp

const posts = loadPostsJson()
if (!Array.isArray(posts) || !posts.length) {
  throw new Error('Legacy posts JSON is empty.')
}

const usedSlugs = new Set()
let batch = db.batch()
let batchCount = 0
let written = 0

for (const [index, post] of posts.entries()) {
  const slug = toSlug(post, index, usedSlugs)
  const docRef = db.collection('blog_posts').doc(slug)
  const data = {
    slug,
    title: post.title || {},
    date: post.date || {},
    excerpt: post.excerpt || {},
    meta: post.meta || [],
    body: post.body || '',
    legacy_url: post.legacy_url || post.url || undefined,
    status: 'published',
    published_at: serverTimestamp(),
    created_at: serverTimestamp(),
  }
  batch.set(docRef, data, { merge: true })
  batchCount += 1
  written += 1
  if (batchCount >= 400) {
    await batch.commit()
    batch = db.batch()
    batchCount = 0
  }
}

if (batchCount) {
  await batch.commit()
}

console.log(`Seeded ${written} blog_posts documents.`)
