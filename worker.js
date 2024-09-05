const redis = require('redis')
const {promisify} = require('util')
const redisClient = redis.createClient({
  host: 'localhost',
  port: 6379,
})

const rPushAsync = promisify(redisClient.rPush).bind(redisClient)
const rPopAsync = promisify(redisClient.rPop).bind(redisClient)

redisClient.on('error', err => {
  console.error('Redis error:', err)
})

const processRequest = async requestData => {
  console.log('Processing request:', requestData)
}

const processQueue = async () => {
  const userId = 'user1'
  while (true) {
    try {
      const requestData = await rPopAsync(`queue:${userId}`)
      if (requestData) {
        await processRequest(JSON.parse(requestData))
      } else {
        console.log('Queue is empty, waiting for new requests...')
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    } catch (error) {
      console.error('Error processing request:', error)
    }
  }
}

const shutdown = () => {
  console.log('Shutting down gracefully...')
  redisClient.quit(() => {
    console.log('Redis client disconnected')
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

processQueue()
