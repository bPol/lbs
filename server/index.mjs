import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import express from 'express'
import rateLimit from 'express-rate-limit'
import admin from 'firebase-admin'
import multer from 'multer'
import { Server as SocketServer } from 'socket.io'
import { stripExifMiddleware } from './strip-exif-middleware.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const distDir = path.join(projectRoot, 'dist')
const uploadDir = path.join(projectRoot, 'uploads')

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const app = express()
app.use(express.json())
const httpServer = createServer(app)
const io = new SocketServer(httpServer, {
  cors: {
    origin: '*',
  },
})
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  })
}

const db = admin.firestore()

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
})

const requireAuth = async (req, res, next) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) {
    res.status(401).json({ ok: false, message: 'Missing auth token.' })
    return
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    req.user = decoded
    next()
  } catch (error) {
    res.status(401).json({ ok: false, message: 'Invalid auth token.' })
  }
}

app.use('/uploads', express.static(uploadDir))

const eventStatusCache = new Map()

const deleteQueryBatch = async (queryRef) => {
  let snapshot = await queryRef.limit(300).get()
  while (!snapshot.empty) {
    const batch = db.batch()
    snapshot.docs.forEach((doc) => batch.delete(doc.ref))
    await batch.commit()
    snapshot = await queryRef.limit(300).get()
  }
}

const serverTimestamp = admin.firestore.FieldValue.serverTimestamp

const getUploadFilename = (url) => {
  if (typeof url !== 'string') {
    return null
  }
  if (url.startsWith('/uploads/')) {
    return url.slice('/uploads/'.length)
  }
  try {
    const parsed = new URL(url)
    if (parsed.pathname.startsWith('/uploads/')) {
      return parsed.pathname.slice('/uploads/'.length)
    }
  } catch {
    return null
  }
  return null
}

io.on('connection', (socket) => {
  socket.on('joinEvent', (payload) => {
    const eventSlug = payload?.eventSlug
    if (!eventSlug) {
      return
    }
    socket.join(eventSlug)
    const status = eventStatusCache.get(eventSlug)
    if (status) {
      socket.emit('eventStatus', status)
    }
  })

  socket.on('eventStatus', (payload) => {
    const eventSlug = payload?.eventSlug
    const status = payload?.status
    if (!eventSlug || !status) {
      return
    }
    const next = {
      eventSlug,
      status,
      updatedAt: Date.now(),
    }
    eventStatusCache.set(eventSlug, next)
    io.to(eventSlug).emit('eventStatus', next)
  })

  socket.on('eventMessage', (payload) => {
    const eventSlug = payload?.eventSlug
    const text = payload?.text
    if (!eventSlug || !text) {
      return
    }
    const message = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: payload?.name || 'Guest',
      text,
      time: new Date().toISOString(),
    }
    io.to(eventSlug).emit('eventMessage', message)
  })
})

app.post(
  '/api/uploads',
  uploadLimiter,
  requireAuth,
  upload.single('photo'),
  stripExifMiddleware,
  (req, res) => {
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ ok: false, message: 'Missing file.' })
      return
    }
    const extension =
      req.file.mimetype === 'image/png'
        ? '.png'
        : req.file.mimetype === 'image/webp'
          ? '.webp'
          : '.jpg'
    const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`
    const target = path.join(uploadDir, filename)
    fs.writeFileSync(target, req.file.buffer)
    res.json({ ok: true, url: `/uploads/${filename}` })
  }
)

app.delete('/api/account/delete', requireAuth, async (req, res) => {
  const uid = req.user?.uid
  const email = req.user?.email || null
  if (!uid) {
    res.status(401).json({ ok: false, message: 'Missing auth token.' })
    return
  }
  try {
    const uploadUrls = new Set()
    const userRef = db.collection('users').doc(uid)
    const userDoc = await userRef.get()
    if (userDoc.exists) {
      const data = userDoc.data()
      if (typeof data.photoUrl === 'string') {
        uploadUrls.add(data.photoUrl)
      }
    }

    const verificationQuery = db
      .collection('verification_requests')
      .where('user_uid', '==', uid)
    const verificationSnapshot = await verificationQuery.get()
    verificationSnapshot.docs.forEach((doc) => {
      const data = doc.data()
      if (typeof data.photo_url === 'string') {
        uploadUrls.add(data.photo_url)
      }
    })

    await Promise.all([
      deleteQueryBatch(db.collection('relationship_links').where('user_a', '==', uid)),
      deleteQueryBatch(db.collection('relationship_links').where('user_b', '==', uid)),
      deleteQueryBatch(db.collection('event_rsvps').where('user_uid', '==', uid)),
      deleteQueryBatch(db.collection('reviews_submitted').where('author_uid', '==', uid)),
      deleteQueryBatch(db.collection('clubs_submitted').where('author_uid', '==', uid)),
      deleteQueryBatch(verificationQuery),
    ])

    await userRef.delete()

    const webhookUrl = process.env.S3_DELETE_WEBHOOK_URL
    if (webhookUrl && uploadUrls.size) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, email, urls: Array.from(uploadUrls) }),
      })
    }

    uploadUrls.forEach((url) => {
      const filename = getUploadFilename(url)
      if (!filename) {
        return
      }
      const target = path.join(uploadDir, filename)
      if (fs.existsSync(target)) {
        fs.unlinkSync(target)
      }
    })

    await admin.auth().deleteUser(uid)
    res.json({ ok: true, message: 'Account deleted.' })
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Unable to delete account.' })
  }
})

app.post('/api/events/checkin', requireAuth, async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  const eventSlug =
    typeof req.body?.eventSlug === 'string' ? req.body.eventSlug.trim() : ''
  const requesterEmail = req.user?.email ? String(req.user.email).toLowerCase() : ''
  if (!token) {
    res.status(400).json({ ok: false, message: 'Missing check-in token.' })
    return
  }
  try {
    const queryRef = db
      .collection('event_rsvps')
      .where('checkin_token', '==', token)
    const snapshot = await queryRef.get()
    if (snapshot.empty) {
      res.status(404).json({ ok: false, message: 'Ticket not found.' })
      return
    }
    const docSnap = snapshot.docs.find((doc) => {
      const data = doc.data()
      if (eventSlug && data.event_slug !== eventSlug) {
        return false
      }
      return true
    })
    if (!docSnap) {
      res.status(404).json({ ok: false, message: 'Ticket not found.' })
      return
    }
    const data = docSnap.data()
    const hostEmail = typeof data.host_email === 'string' ? data.host_email.toLowerCase() : ''
    if (!requesterEmail || requesterEmail !== hostEmail) {
      res.status(403).json({ ok: false, message: 'Not authorized.' })
      return
    }
    if (data.status !== 'Approved') {
      res.status(400).json({ ok: false, message: 'Ticket not approved.' })
      return
    }
    await docSnap.ref.update({
      checked_in_at: serverTimestamp(),
      checked_in_by: requesterEmail,
    })
    res.json({ ok: true, message: 'Check-in recorded.' })
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Unable to check in ticket.' })
  }
})

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (_, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
} else {
  app.get('*', (_, res) => {
    res.sendFile(path.join(projectRoot, 'index.html'))
  })
}

const port = process.env.PORT || 5174
httpServer.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
