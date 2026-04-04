const express = require('express')
const authRouter = require('./routes/auth')

const app = express()

app.use(express.json())

app.use('/auth', authRouter)

app.get('/health', (req, res) => {
  res.json({ status: 'Auth service is running' })
})

const PORT = 3002
app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`)
})