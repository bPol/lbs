import sharp from 'sharp'

export const stripExifMiddleware = async (req, res, next) => {
  if (!req.file || !req.file.buffer) {
    next()
    return
  }

  try {
    const cleaned = await sharp(req.file.buffer, { failOn: 'none' })
      .rotate()
      .toBuffer()
    req.file.buffer = cleaned
    next()
  } catch (error) {
    next(error)
  }
}
