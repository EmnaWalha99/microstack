const express = require('express')
const {createProxyMiddleware}= require('http-proxy-middleware')

const Redis = require('ioredis')
const rateLimiter = require('./middleware/rateLimiter')
const authMiddleware= require('./middleware/auth')
const app = express()
const redis = new Redis({host: 'redis',port:6379})

//service urls
const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3002'
const JOB_URL  = process.env.JOB_QUEUE_SERVICE_URL || 'http://job-queue-service:3003'
const FILE_URL = process.env.FILE_UPLOAD_SERVICE_URL || 'http://file-upload-service:3004'

// health 
app.get('/health',(req,res)=>res.json({status:'ok'}))
redis.on('connect',()=>console.log("Redis connected"));
redis.on('error',(err)=>console.log("Redis error",err.message));
app.use(rateLimiter(redis))
const authProxy = createProxyMiddleware({ target:AUTH_URL, changeOrigin: true }) // changeOring true : it rewrites the host header so the target server sees requests as if they came directly
const jobProxy  = createProxyMiddleware({ target:JOB_URL, changeOrigin: true })
const fileProxy = createProxyMiddleware({ target: FILE_URL, changeOrigin: true })

app.use("/auth",authProxy)
app.use("/jobs",authMiddleware,jobProxy);
app.use("/files",authMiddleware,fileProxy);

app.listen(3001,()=>{
    console.log("listening on port 3001");
})