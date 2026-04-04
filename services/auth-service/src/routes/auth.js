const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')

const router = express.Router()
const users = new Map();
const refreshTokens = new Map()
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey'
// POST /auth/register
router.post('/register', async (req, res) => {
  try{
    const {email, password, role }=req.body;
    if(!email || !password){
        return res.status(400).json({message :"email and password required"})
    }
    if(users.has(email)){
        return res.status(400).json({message: "User already exists"})
    }
    //hash pwd
    const hashedPassword = await bcrypt.hash(password,12)
    //create user 
    const user = { 
        id :uuidv4(),
        email,
        password: hashedPassword,
        role: role ||'user'
    }
    users.set(email, user);
    return res.status(201).json({
        message: 'User registred successfully'
    })
    }catch(err){
        return res.status(500).json({error: err.message})
    }

  })

// POST /auth/login
router.post('/login', async (req, res) => {
  try{
    const {email, password} = req.body
    const user = users.get(email)
    if(!user){
        return res.status(401).json({message : 'Invalid credentials'})
    }
    //compare passwd
    const isMatch = await bcrypt.compare(password,user.password)
    if(!isMatch){
        return res.status(401).json({message: 'Invalid credentials'})
    }
    //create access token 
    const accessToken = jwt.sign({
        sub: user.id, email: user.email, role:user.role},
        JWT_SECRET,
        {expiresIn: '15m'})
    //create a refresh token
    const refreshToken = uuidv4()
    refreshTokens.set(refreshToken,user.id)
    return res.json({
        accessToken,
        refreshToken
    })
  }catch(err){
    return res.status(500).json({error: err.message})
  }
})

// POST /auth/refresh
router.post('/refresh', (req, res) => {
  try{
    const {refreshToken} = req.body
    if(!refreshToken){
        return res.status(400).json({message: 'Refresh token required'})
    }
    const userId = refreshTokens.get(refreshToken)
    if(!userId){
        return res.status(403).json({message : 'Invalid refresh token'})
    }
    const user = [...users.values()].find(u=>u.id ===userId)
    if(!user){
        return res.status(403).json({message: 'User not found'})
    }
    //Issue new access token 
    const newAccessToken = jwt.sign({
        sub:user.id, email:user.email, role:user.role
    },JWT_SECRET,{expiresIn:'15m'})
    return res.json({
        accessToken : newAccessToken
    })

  }catch(err){
    return res.status(500).json({error: err.message})
  }
})

module.exports = router