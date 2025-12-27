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
