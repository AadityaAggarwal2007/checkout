// Dashboard preview bundle.
//
// Renders the drawer through the exact same modules the live widget uses, so a
// styling or layout change can never show up correctly here and wrongly on a
// storefront. The only things faked are the Shopify cart endpoints and the
// upsell catalogue, both stubbed on window.fetch the way a theme would answer.
var cart = require('./cart');
var drawer = require('./drawer');
var styles = require('./styles');

// Inline so the preview never depends on a network image; an empty src renders
// as a broken-image icon and makes the layout look wrong for no reason.
var PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='120' height='120' fill='%23F1F1F3'/%3E%3Cpath d='M38 74l16-19 11 13 8-9 12 15z' fill='%23D9D9DE'/%3E%3Ccircle cx='47' cy='45' r='7' fill='%23D9D9DE'/%3E%3C/svg%3E";

var SAMPLE_ITEMS = [
  {
    id: 1, variant_id: 1, product_id: 1, key: 'sd-preview-1',
    title: 'Black Elephant Print Cotton Spaghetti Top',
    product_title: 'Black Elephant Print Cotton Spaghetti Top',
    variant_title: 'Black / S', quantity: 1,
    price: 25900, line_price: 25900, original_line_price: 59900, original_price: 59900,
    image: PLACEHOLDER, url: '#'
  },
  {
    id: 2, variant_id: 2, product_id: 2, key: 'sd-preview-2',
    title: 'Indigo Blue Dabu Print Sleeveless Cotton Crop Kurti',
    product_title: 'Indigo Blue Dabu Print Sleeveless Cotton Crop Kurti',
    variant_title: 'Blue / M', quantity: 2,
    price: 51800, line_price: 103600, original_line_price: 129800, original_price: 64900,
    image: PLACEHOLDER, url: '#'
  }
];

var SAMPLE_UPSELLS = [
  { title: 'Ivory Mughal Buta Print Top', images: [{ src: PLACEHOLDER }], variants: [{ id: 91, price: 799 }] },
  { title: 'Lilac Floral Buta Print Top', images: [{ src: PLACEHOLDER }], variants: [{ id: 92, price: 899 }] },
  { title: 'Bottle Green Block Print Top', images: [{ src: PLACEHOLDER }], variants: [{ id: 93, price: 749 }] },
  { title: 'Black Gold Elephant Short Kurti', images: [{ src: PLACEHOLDER }], variants: [{ id: 94, price: 1149 }] }
];

var state = null;
var styleEl = null;
var mounted = false;

function freshCart() {
  return {
    token: 'sd-preview',
    note: '',
    attributes: {},
    currency: 'INR',
    items: JSON.parse(JSON.stringify(SAMPLE_ITEMS)),
    item_count: 0,
    total_price: 0,
    original_total_price: 0,
    total_discount: 0
  };
}

function recalc() {
  state.total_price = 0;
  state.original_total_price = 0;
  state.item_count = 0;
  for (var i = 0; i < state.items.length; i++) {
    var it = state.items[i];
    it.line_price = it.price * it.quantity;
    it.original_line_price = (it.original_price || it.price) * it.quantity;
    state.total_price += it.line_price;
    state.original_total_price += it.original_line_price;
    state.item_count += it.quantity;
  }
}

function json(data) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  }));
}

// Mirrors the subset of the Shopify AJAX cart the widget actually calls, so
// quantity steppers and the notes field behave here as they do in a theme.
function installCartStub() {
  state = freshCart();
  recalc();

  window.fetch = function (url, opts) {
    var u = typeof url === 'string' ? url : (url && url.url) || '';
    var body = {};
    try { body = opts && opts.body ? JSON.parse(opts.body) : {}; } catch (e) {}

    if (u.indexOf('/cart.js') !== -1) { recalc(); return json(state); }

    if (u.indexOf('/cart/add.js') !== -1) {
      var existing = null;
      for (var i = 0; i < state.items.length; i++) {
        if (String(state.items[i].variant_id) === String(body.id)) existing = state.items[i];
      }
      if (existing) {
        existing.quantity += body.quantity || 1;
      } else {
        state.items.push({
          id: body.id, variant_id: body.id, key: 'sd-preview-' + body.id,
          title: 'Added product', product_title: 'Added product', variant_title: '',
          quantity: body.quantity || 1, price: 79900,
          line_price: 79900, original_line_price: 79900, original_price: 79900,
          image: PLACEHOLDER, url: '#'
        });
      }
      recalc();
      return json(state);
    }

    if (u.indexOf('/cart/change.js') !== -1) {
      var kept = [];
      for (var j = 0; j < state.items.length; j++) {
        var item = state.items[j];
        if (String(item.key) === String(body.id) || String(item.id) === String(body.id)) {
          if (body.quantity <= 0) continue;
          item.quantity = body.quantity;
        }
        kept.push(item);
      }
      state.items = kept;
      recalc();
      return json(state);
    }

    if (u.indexOf('/cart/update.js') !== -1) {
      if (body.note !== undefined) state.note = body.note;
      if (body.attributes) state.attributes = body.attributes;
      recalc();
      return json(state);
    }

    if (u.indexOf('/api/widget/lookup-address') !== -1) {
      return json({
        found: true,
        name: 'Priya Sharma',
        email: 'priya@example.com',
        address: {
          line1: '42, Lotus Apartments', line2: 'Lajpat Nagar',
          city: 'New Delhi', state: 'Delhi', pincode: '110024'
        }
      });
    }

    if (u.indexOf('/api/widget/validate-coupon') !== -1) {
      var codes = (window.__sdPreviewConfig && window.__sdPreviewConfig.discounts &&
        window.__sdPreviewConfig.discounts.codes) || [];
      var wanted = String(body.code || '').toLowerCase();
      for (var k = 0; k < codes.length; k++) {
        if (String(codes[k].code || '').toLowerCase() === wanted) {
          return json({
            valid: true, code: codes[k].code, type: codes[k].type,
            value: codes[k].value, title: codes[k].code
          });
        }
      }
      return json({ valid: false });
    }

    // Never let the preview reach the real order endpoint.
    if (u.indexOf('/api/payments/create-order') !== -1) {
      return json({ success: true, orderId: 'preview-order', status: 'cod_confirmed' });
    }

    return json({});
  };
}

function applyStyles(colors) {
  if (!styleEl) {
    styleEl = document.createElement('style');
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = styles.getStyles(colors || {});
}

async function render(config) {
  if (!config) return;
  window.__sdPreviewConfig = config;

  applyStyles(config.colors);

  if (!mounted) {
    installCartStub();
    await cart.fetch_cart();
    drawer.create(config);
    drawer.setUpsellProducts(SAMPLE_UPSELLS);
    drawer.open(config);
    mounted = true;
    return;
  }

  drawer.render(config);
}

// The dashboard owns the draft config and pushes it in on every edit.
window.addEventListener('message', function (e) {
  var msg = e.data;
  if (!msg || msg.type !== 'shopdrawer:config') return;
  render(msg.config);
});

window.ShopDrawerPreview = { render: render };

// Tell the parent we are ready, so a config posted before load isn't lost.
if (window.parent !== window) {
  window.parent.postMessage({ type: 'shopdrawer:preview-ready' }, '*');
}
