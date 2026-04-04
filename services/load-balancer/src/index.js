//1 create an express server
//2 keep a list of upstream URLs(the 2 api gateway adress)
//3 on each request, forward the request to one of the upstream URLs in a round-robin manner
//4 forwad the request to it using http-proxy
//expose /health that returns {status: 'ok'}

const express = require('express');
const app = express();
const httpProxy = require('http-proxy');

const proxy = httpProxy.createProxyServer({})
proxy.on('error',(err,req,res)=>{
    res.status(502).json({error: 'Bad Gateway',message:err.message})
})
const upstreams = [
    "http://api-gateway-1:3001",
    "http://api-gateway-2:3001"
]
let counter =0
// load balacing with round robin method
function pickUpstream(){
    const upstream = upstreams[counter% upstreams.length];
    counter ++
    return upstream
}
app.get('/health',(req,res)=>{
    try{
        res.json({status: 'ok'})
    }catch(err){
        console.error("An error happened during fetching health ")
    }
})
app.use((req,res)=>{
    const upstream= pickUpstream();
    proxy.web(req,res,{target: upstream})
})


app.listen(3000,()=>{
    console.log('listenning..')
})