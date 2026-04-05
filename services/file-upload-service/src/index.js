const express = require('express')
const uploadRoutes = require('./routes/upload')
const fs = require('fs')

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads'
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const app = express()

// health check
app.get('/health', (req, res) => res.json({ status: 'ok' }))

// mount file upload routes
app.use('/', uploadRoutes)

const PORT = process.env.PORT || 3004
app.listen(PORT, () => console.log(`File Upload Service running on port ${PORT}`))