const express = require('express')
const jobRoutes = require('./routes/jobs')

const app = express()

// parse JSON bodies
app.use(express.json())

// health check
app.get('/health', (req, res) => res.json({ status: 'ok' }))

// mount job routes
app.use('/', jobRoutes)

const PORT = process.env.PORT || 3003
app.listen(PORT, () => console.log(`Job Queue Service running on port ${PORT}`))