let _baseUrl = '';
let _key = '';

function init(baseUrl, key) {
  _baseUrl = baseUrl;
  _key = key;
}

async function get(path) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(_baseUrl + path + sep + 'key=' + _key);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(_baseUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, key: _key })
  });
  return res.json();
}

async function shopifyGet(path) {
  const res = await fetch(path);
  return res.json();
}

async function shopifyPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

module.exports = { init, get, post, shopifyGet, shopifyPost };
