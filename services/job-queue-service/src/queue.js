const { Queue, Worker } = require('bullmq')
const IORedis = require('ioredis')

const connection = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null // required by BullMQ
})

const jobQueue = new Queue('dev-jobs', { connection })

const worker = new Worker('jobQueue', async (job) => {
  console.log(`Processing job ${job.id} type=${job.name}`)
  
  // simulate work with a 2 second delay
  await new Promise(r => setTimeout(r, 2000))
  
  return { done: true }
}, { connection })

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message)
})

module.exports = { jobQueue }