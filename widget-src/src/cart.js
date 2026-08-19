var listeners = [];
var cartData = null;

function onChange(fn) {
  listeners.push(fn);
}

function notify() {
  for (var i = 0; i < listeners.length; i++) {
    listeners[i](cartData);
  }
}

async function fetch_cart() {
  var res = await window.fetch('/cart.js');
  cartData = await res.json();
  return cartData;
}

async function addItem(variantId, quantity) {
  await window.fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: variantId, quantity: quantity || 1 })
  });
  await fetch_cart();
  notify();
  return cartData;
}

async function updateItem(lineKey, quantity) {
  await window.fetch('/cart/change.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: lineKey, quantity: quantity })
  });
  await fetch_cart();
  notify();
  return cartData;
}

async function removeItem(lineKey) {
  return updateItem(lineKey, 0);
}

async function updateNote(note) {
  await window.fetch('/cart/update.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: note })
  });
}

async function updateAttributes(attrs) {
  await window.fetch('/cart/update.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attributes: attrs })
  });
}

function getCart() {
  return cartData;
}

function getItemCount() {
  return cartData ? cartData.item_count : 0;
}

function getTotal() {
  return cartData ? cartData.total_price / 100 : 0;
}

module.exports = { onChange, fetch_cart, addItem, updateItem, removeItem, updateNote, updateAttributes, getCart, getItemCount, getTotal };
