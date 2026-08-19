var cart = require('../cart');
var formatter = require('../utils/formatter');
var icons = require('../utils/icons');

function renderProductCard(item, settings) {
  var el = document.createElement('div');
  el.className = 'sd-product';

  var img = document.createElement('img');
  img.className = 'sd-product-img';
  img.src = item.image || (item.featured_image && item.featured_image.url) || '';
  img.alt = item.title || '';
  img.loading = 'lazy';
  el.appendChild(img);

  var info = document.createElement('div');
  info.className = 'sd-product-info';

  var title = document.createElement('div');
  title.className = 'sd-product-title';
  title.textContent = item.product_title || item.title;
  info.appendChild(title);

  if (settings && settings.showVariantSelector && item.variant_title) {
    var variant = document.createElement('div');
    variant.className = 'sd-product-variant';
    variant.textContent = item.variant_title;
    info.appendChild(variant);
  }

  var priceRow = document.createElement('div');
  priceRow.className = 'sd-product-price';

  var current = document.createElement('span');
  current.className = 'sd-price-current';
  current.textContent = formatter.formatPrice(item.line_price / 100);
  priceRow.appendChild(current);

  var discounted = item.original_line_price > item.line_price;

  if (settings && settings.showComparePrice && discounted) {
    var compare = document.createElement('span');
    compare.className = 'sd-price-compare';
    compare.textContent = formatter.formatPrice(item.original_line_price / 100);
    priceRow.appendChild(compare);
  }

  if (settings && settings.showSavings && discounted) {
    var disc = formatter.formatDiscount(item.original_line_price, item.line_price);
    if (disc) {
      var discEl = document.createElement('span');
      discEl.className = 'sd-price-discount';
      discEl.textContent = disc;
      priceRow.appendChild(discEl);
    }
  }

  info.appendChild(priceRow);
  el.appendChild(info);

  var actions = document.createElement('div');
  actions.className = 'sd-product-actions';

  var del = document.createElement('button');
  del.className = 'sd-delete';
  del.type = 'button';
  del.setAttribute('aria-label', 'Remove item');
  del.innerHTML = icons.get('trash', 15);
  del.onclick = function () { cart.removeItem(item.key); };
  actions.appendChild(del);

  var qty = document.createElement('div');
  qty.className = 'sd-qty';

  var minus = document.createElement('button');
  minus.type = 'button';
  minus.setAttribute('aria-label', 'Decrease quantity');
  minus.innerHTML = icons.get('minus', 14, 2.2);
  minus.onclick = function () {
    if (item.quantity > 1) cart.updateItem(item.key, item.quantity - 1);
    else cart.removeItem(item.key);
  };
  qty.appendChild(minus);

  var count = document.createElement('span');
  count.textContent = item.quantity;
  qty.appendChild(count);

  var plus = document.createElement('button');
  plus.type = 'button';
  plus.setAttribute('aria-label', 'Increase quantity');
  plus.innerHTML = icons.get('plus', 14, 2.2);
  plus.onclick = function () { cart.updateItem(item.key, item.quantity + 1); };
  qty.appendChild(plus);

  actions.appendChild(qty);
  el.appendChild(actions);

  return el;
}

module.exports = { renderProductCard };
