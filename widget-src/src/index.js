var styles = require('./styles');
var cart = require('./cart');
var drawer = require('./drawer');
var icons = require('./utils/icons');
var widgetApi = require('./utils/api');

(function () {
  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf('widget.js') !== -1) return scripts[i];
    }
    return null;
  })();

  if (!script) return;

  var storeKey = script.getAttribute('data-store-key');
  if (!storeKey) return;

  var baseUrl = script.src.replace(/\/widget\.js.*$/, '');

  widgetApi.init(baseUrl, storeKey);

  var config = null;
  var toggleBtn = null;

  function injectStyles(colors) {
    var el = document.createElement('style');
    el.id = 'sd-styles';
    el.textContent = styles.getStyles(colors);
    document.head.appendChild(el);
  }

  function createToggleButton() {
    toggleBtn = document.createElement('button');
    toggleBtn.className = 'sd-cart-toggle';
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-label', 'Open cart');
    toggleBtn.innerHTML = icons.get('bag', 22);
    toggleBtn.onclick = function () { drawer.toggle(config); };

    var badge = document.createElement('span');
    badge.className = 'sd-cart-badge';
    badge.id = 'sd-cart-badge';
    badge.style.display = 'none';
    toggleBtn.appendChild(badge);

    document.body.appendChild(toggleBtn);
    updateBadge();
  }

  function updateBadge() {
    var badge = document.getElementById('sd-cart-badge');
    if (!badge) return;
    var count = cart.getItemCount();
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  function hijackThemeCart() {
    var selectors = [
      'a[href="/cart"]',
      '.m-cart-icon-bubble',
      '.m-cart-count-bubble',
      '[data-cart-toggle]',
      '.cart-icon-bubble',
      '.header__icon--cart',
      '.js-drawer-open-cart',
      '.cart-toggle',
      '.site-header__cart'
    ];

    function attachHandler() {
      for (var i = 0; i < selectors.length; i++) {
        var els = document.querySelectorAll(selectors[i]);
        for (var j = 0; j < els.length; j++) {
          if (els[j]._sdHijacked) continue;
          els[j]._sdHijacked = true;
          els[j].addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            drawer.open(config);
          }, true);
        }
      }
    }

    attachHandler();
    setTimeout(attachHandler, 1000);
    setTimeout(attachHandler, 3000);

    var style = document.createElement('style');
    style.textContent = 'cart-drawer, .cart-drawer, #cart-drawer, [id*="cart-drawer"], .m-cart-drawer, m-cart-drawer { display:none !important; }';
    document.head.appendChild(style);
  }

  function interceptAddToCart() {
    var forms = document.querySelectorAll('form[action="/cart/add"]');
    for (var i = 0; i < forms.length; i++) {
      (function (form) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var formData = new FormData(form);
          var id = formData.get('id');
          var qty = parseInt(formData.get('quantity') || '1', 10);
          if (id) {
            cart.addItem(parseInt(id, 10), qty).then(function () {
              var settings = (config && config.settings) || {};
              if (settings.openDrawerOnAdd !== false) {
                drawer.open(config);
              }
            });
          }
        });
      })(forms[i]);
    }

    var origFetch = window.fetch;
    window.fetch = function (url, opts) {
      var result = origFetch.apply(this, arguments);
      if (typeof url === 'string' && url.indexOf('/cart/add') !== -1 && opts && opts.method && opts.method.toUpperCase() === 'POST') {
        result.then(function () {
          cart.fetch_cart().then(function () {
            var settings = (config && config.settings) || {};
            if (settings.openDrawerOnAdd !== false) {
              drawer.open(config);
            }
          });
        });
      }
      return result;
    };

    var origXHROpen = XMLHttpRequest.prototype.open;
    var origXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this._sdUrl = url;
      this._sdMethod = method;
      return origXHROpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      var xhr = this;
      if (typeof xhr._sdUrl === 'string' && xhr._sdUrl.indexOf('/cart/add') !== -1 && xhr._sdMethod && xhr._sdMethod.toUpperCase() === 'POST') {
        xhr.addEventListener('load', function () {
          cart.fetch_cart().then(function () {
            var settings = (config && config.settings) || {};
            if (settings.openDrawerOnAdd !== false) {
              drawer.open(config);
            }
          });
        });
      }
      return origXHRSend.apply(this, arguments);
    };
  }

  // The gateway sends shoppers back to the storefront with these params when
  // postPurchase.mode is "store". Strip them afterwards so a refresh or a
  // shared link doesn't replay the confirmation over a live cart.
  function showOrderResultIfReturning() {
    var params = new URLSearchParams(window.location.search);
    var orderId = params.get('sd_order');
    if (!orderId) return;

    var status = params.get('sd_status') === 'success' ? 'success' : 'failed';
    drawer.showOrderResult(config, status);

    params.delete('sd_order');
    params.delete('sd_status');
    var qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
  }

  async function init() {
    try {
      config = await widgetApi.get('/api/widget/config');
      if (!config || config.error) return;

      injectStyles(config.colors);

      // Kicked off before the cart fetch rather than after wiring, so the
      // carousel has the best chance of being ready the first time the drawer
      // opens. Deliberately not awaited here — it must not delay the toggle.
      var upsellsReady = widgetApi.get('/api/widget/upsell-products')
        .then(function (products) {
          if (Array.isArray(products)) drawer.setUpsellProducts(products);
        })
        .catch(function (e) {
          console.error('ShopDrawer: upsell products failed to load', e);
        });

      await cart.fetch_cart();

      cart.onChange(function () {
        updateBadge();
      });

      createToggleButton();
      hijackThemeCart();
      interceptAddToCart();

      await upsellsReady;

      showOrderResultIfReturning();
    } catch (err) {
      console.error('ShopDrawer: Failed to initialize', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
