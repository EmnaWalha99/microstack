const express = require('express')
const { jobQueue } = require('./queue') 
const router = express.Router()

// POST /jobs
router.post('/', async (req, res) => {
  const { type, data } = req.body
  if (!type) return res.status(400).json({ error: 'type is required' })

  const job = await jobQueue.add(type, data)
  return res.status(201).json({ id: job.id })
})

// GET /jobs/:id
router.get('/:id', async (req, res) => {
  const job = await jobQueue.getJob(req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })

  const state = await job.getState()
  return res.json({
    id: job.id,
    type: job.name,
    state,
    data: job.data,
    result: job.returnvalue
  })
})

module.exports = router