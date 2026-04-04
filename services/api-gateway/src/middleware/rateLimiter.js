//sliding window algorithm
function rateLimiter(redis) {
    return async function(req,res,next){
    const ip = req.socket.remoteAddress
    const key = `rate_limit:${ip}`
    const now = Date.now()
    const windowStart = now - 60000

    // run all 4 redis commands at once
    const pipeline = redis.pipeline()
    pipeline.zremrangebyscore(key, 0, windowStart)
    pipeline.zcard(key)
    pipeline.zadd(key, now, `${now}:${Math.random()}`)
    pipeline.pexpire(key, 60000)
    const results = await pipeline.exec()

    const count = results[1][1]  // result of zcard

    if (count >= 100) {
        return res.status(429).json({error : 'Too Many Requests'})
    }
    next();
    }
}
module.exports = rateLimiter;