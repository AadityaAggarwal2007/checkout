var cart = require('../cart');
var formatter = require('../utils/formatter');
var icons = require('../utils/icons');

function renderUpsells(container, config, products) {
  if (!config || !config.enabled || !products || !products.length) return;

  var el = document.createElement('div');
  el.className = 'sd-upsells';

  var title = document.createElement('div');
  title.className = 'sd-section-title';
  title.innerHTML = icons.get('sparkles', 15) + '<span>' + (config.title || 'You might also like') + '</span>';
  el.appendChild(title);

  var scroll = document.createElement('div');
  scroll.className = 'sd-upsells-scroll';

  var limit = config.limit || 4;
  var shown = products.slice(0, limit);

  for (var i = 0; i < shown.length; i++) {
    (function (product) {
      var card = document.createElement('div');
      card.className = 'sd-upsell-card';

      if (product.images && product.images[0]) {
        var img = document.createElement('img');
        img.className = 'sd-upsell-img';
        img.src = product.images[0].src;
        img.alt = product.title;
        img.loading = 'lazy';
        card.appendChild(img);
      }

      var info = document.createElement('div');
      info.className = 'sd-upsell-info';

      var name = document.createElement('div');
      name.className = 'sd-upsell-name';
      name.textContent = product.title;
      info.appendChild(name);

      if (product.variants && product.variants[0]) {
        var price = document.createElement('div');
        price.className = 'sd-upsell-price';
        price.textContent = formatter.formatPrice(product.variants[0].price);
        info.appendChild(price);
      }

      var addBtn = document.createElement('button');
      addBtn.className = 'sd-upsell-add';
      addBtn.type = 'button';
      addBtn.innerHTML = icons.get('plus', 13, 2.2) + '<span>Add</span>';
      addBtn.onclick = function () {
        if (!product.variants || !product.variants[0]) return;
        addBtn.disabled = true;
        addBtn.innerHTML = icons.get('check', 13, 2.4) + '<span>Added</span>';
        cart.addItem(product.variants[0].id, 1);
      };
      info.appendChild(addBtn);

      card.appendChild(info);
      scroll.appendChild(card);
    })(shown[i]);
  }

  el.appendChild(scroll);
  container.appendChild(el);
}

module.exports = { renderUpsells };
