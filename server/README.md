# Server Helpers

This folder contains backend helpers and an optional Express server.

## EXIF-stripping middleware

`strip-exif-middleware.mjs` expects a file upload middleware (such as multer)
that provides `req.file.buffer`. It uses Sharp to re-encode the image without
EXIF or GPS metadata.

Example:

```js
import express from 'express'
import multer from 'multer'
import { stripExifMiddleware } from './strip-exif-middleware.mjs'

const upload = multer()
const app = express()

app.post('/upload', upload.single('photo'), stripExifMiddleware, async (req, res) => {
  // req.file.buffer is now stripped of EXIF/GPS metadata
  // Save to storage here.
  res.json({ ok: true })
})
```

Install required deps:

```bash
npm install sharp multer express
```

## Express server

`index.mjs` provides:

- `POST /api/uploads` for image uploads (EXIF stripped).
- Requires a Firebase ID token in `Authorization: Bearer <token>`.
- Rate-limited to 30 uploads per 15 minutes per IP.
- `/uploads/*` for serving uploaded files.
- Static serving for `dist/` if you build the frontend.
- Socket.io server for live event status and chat (same origin).

Start the server:

```bash
npm run server
```

Authentication uses Firebase Admin with `applicationDefault()` credentials. Set
`GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON or provide the
appropriate environment in production.
