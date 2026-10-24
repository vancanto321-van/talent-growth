import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../app/www');
const port=Number(process.env.GROWTH_PREVIEW_PORT||4184);
const apiPort=Number(process.env.GROWTH_PREVIEW_API_PORT||18139);
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
http.createServer(async(req,res)=>{
  if(req.url.startsWith('/growth/api/')) {
    const upstream=http.request({hostname:'127.0.0.1',port:apiPort,path:req.url.slice('/growth/api'.length),method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({error:'local backup service unavailable'}));else res.destroy();});
    req.pipe(upstream);return;
  }
  if(req.url==='/'){res.writeHead(302,{Location:'/growth/'}).end();return;}
  let relative;try{relative=decodeURIComponent(req.url.split('?')[0].replace(/^\/growth\//,''));}catch{res.writeHead(400).end();return;}
  const file=path.resolve(root,relative||'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try {let body=await fs.readFile(file);if(path.extname(file)==='.html')body=body.toString('utf8').replace('</head>','<meta name="growth-runtime" content="local" /></head>');res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);}catch{res.writeHead(404).end();}
}).listen(port,'127.0.0.1',()=>process.stdout.write(`Journey preview: http://127.0.0.1:${port}/growth/\n`));
