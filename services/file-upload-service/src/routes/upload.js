const express = require('express')
const multer = require('multer')
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

const router = express.Router()
const files = new Map()

// make sure upload folder exists
const UPLOAD_DIR = path.join(__dirname, '../uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const id = uuidv4()
    const ext = path.extname(file.originalname)
    cb(null, `${id}${ext}`)
  }
})

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }) // 10 MB

// POST /files/upload
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  const id = path.basename(req.file.filename, path.extname(req.file.filename))
  const meta = {
    id,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedAt: new Date().toISOString()
  }

  files.set(id, meta)
  return res.status(201).json(meta)
})

// GET /files
router.get('/', (req, res) => {
  return res.json([...files.values()])
})

// DELETE /files/:id
router.delete('/:id', (req, res) => {
  const file = files.get(req.params.id)
  if (!file) return res.status(404).json({ error: 'File not found' })

  // delete from disk
  fs.unlinkSync(path.join(UPLOAD_DIR, `${file.id}${path.extname(file.originalName)}`))
  files.delete(req.params.id)
  return res.json({ message: 'File deleted' })
})

module.exports = router