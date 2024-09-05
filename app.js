const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const redis = require('redis')

const app = express()
const dbPath = path.join(__dirname, 'userdata.db')
let db = null

// Create and connect Redis client
const redisClient = redis.createClient()
redisClient.on('error', err => {
  console.log('Redis error:', err)
})

app.use(express.json())

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
  }
}

initializeDBAndServer()

const secretKey = 'secret_key'

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization']
  if (!authHeader) return res.sendStatus(401)
  const token = authHeader.split(' ')[1]
  if (!token) return res.sendStatus(401)

  jwt.verify(token, secretKey, async (err, user) => {
    if (err) return res.sendStatus(403)

    const selectUserQuery = `SELECT * FROM user WHERE username = '${user.username}'`
    const dbUser = await db.get(selectUserQuery)
    if (!dbUser) return res.sendStatus(403)

    req.user = dbUser
    next()
  })
}

app.post('/register', async (req, res) => {
  const {username, name, password, gender, location} = req.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const checkingQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(checkingQuery)

  if (!dbUser && password.length >= 5) {
    const query = `INSERT INTO user (username, name, password, gender, location) VALUES ('${username}', '${name}', '${hashedPassword}', '${gender}', '${location}')`
    await db.run(query)
    res.send('User created successfully')
  } else if (dbUser) {
    res.status(400).send('User already exists')
  } else if (password.length < 5) {
    res.status(400).send('Password is too short')
  }
})

app.post('/login', async (req, res) => {
  const {username, password} = req.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(selectUserQuery)

  if (!dbUser) {
    res.status(400).send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched) {
      const token = jwt.sign({username: dbUser.username}, secretKey, {
        expiresIn: '1h',
      })
      res.json({token})
    } else {
      res.status(400).send('Invalid password')
    }
  }
})

app.put('/change-password', async (req, res) => {
  const {username, oldPassword, newPassword} = req.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await db.get(selectUserQuery)

  const samePass = await bcrypt.compare(oldPassword, dbUser.password)
  if (newPassword.length < 5) {
    res.status(400).send('Password is too short')
  } else if (samePass) {
    const hashedPassword = await bcrypt.hash(newPassword, 10)
    const query = `UPDATE user SET password = '${hashedPassword}' WHERE username = '${username}'`
    await db.run(query)
    res.send('Password updated')
  } else {
    res.status(400).send('Invalid current password')
  }
})

app.post('/enqueue', authenticateToken, async (req, res) => {
  const {requestData} = req.body
  if (!requestData) return res.status(400).send('Request data is required')

  const userId = req.user.username
  try {
    await redisClient.lPush(`queue:${userId}`, JSON.stringify(requestData))
    res.send('Request enqueued')
  } catch (err) {
    console.error('Redis error:', err)
    res.status(500).send('Failed to enqueue request')
  }
})

app.get('/process-queue', authenticateToken, async (req, res) => {
  const userId = req.user.username
  try {
    const requestData = await redisClient.rPop(`queue:${userId}`)
    if (requestData) {
      res.send(`Processed request: ${requestData}`)
    } else {
      res.send('No requests in the queue')
    }
  } catch (err) {
    console.error('Redis error:', err)
    res.status(500).send('Failed to process queue')
  }
})

module.exports = app
