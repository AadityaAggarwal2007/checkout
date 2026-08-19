const http = require('http');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'public');
const mimes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/test.html';
  const fp = path.join(dir, url);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mimes[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(5002, () => console.log('Test server on http://localhost:5002'));
