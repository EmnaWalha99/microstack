const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey'

function authMiddleware(req,res,next){
    const authHeader = req.headers['authorization']

    //check if the header exists and start with 'Bearer'
    if(!authHeader || !authHeader.startsWith('Bearer ')){
        return res.status(401).json({error: "Not Authorized"})
    }
    // extract the token
    const token = authHeader.slice(7);

    try{
        //verify the token
        const decoded = jwt.verify(token, JWT_SECRET)
        req.user= decoded

        //forwad user info to downstream servicess
        req.headers['x-user-id']    = decoded.sub
        req.headers['x-user-email'] = decoded.email
        req.headers['x-user-role']  = decoded.role
        next()

    }catch(err){
        //handle expired vs invalid
        if (err.name ==="TokenExpiredError"){
            return res.status(401).json({error: "Token expired"})
        }
        return res.status(401).json({error: "Invalid token"})

    }
}
module.exports= authMiddleware