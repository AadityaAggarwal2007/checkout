var cart = require('./cart');
var formatter = require('./utils/formatter');
var icons = require('./utils/icons');
var announcements = require('./components/announcements');
var rewardBar = require('./components/reward-bar');
var productCard = require('./components/product-card');
var upsells = require('./components/upsells');
var freeGifts = require('./components/free-gifts');
var coupons = require('./components/coupons');
var trustBadges = require('./components/trust-badges');
var notes = require('./components/notes');
var confirmation = require('./components/confirmation');
var checkoutForm = require('./components/checkout-form');

var overlay, drawer, body, countEl, isOpen = false;
var upsellProducts = [];
var inCheckout = false;

function create(config) {
  overlay = document.createElement('div');
  overlay.className = 'sd-overlay';
  overlay.onclick = close;

  drawer = document.createElement('div');
  drawer.className = 'sd-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-label', 'Shopping cart');

  var header = document.createElement('div');
  header.className = 'sd-header';

  var headerIcon = document.createElement('div');
  headerIcon.className = 'sd-header-icon';
  headerIcon.innerHTML = icons.get('bag', 17);
  header.appendChild(headerIcon);

  var headerTitle = document.createElement('h3');
  headerTitle.appendChild(document.createTextNode('Your cart'));
  countEl = document.createElement('span');
  countEl.className = 'sd-header-count';
  headerTitle.appendChild(countEl);
  header.appendChild(headerTitle);

  var closeBtn = document.createElement('button');
  closeBtn.className = 'sd-close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close cart');
  closeBtn.innerHTML = icons.get('close', 18, 2);
  closeBtn.onclick = close;
  header.appendChild(closeBtn);

  drawer.appendChild(header);

  body = document.createElement('div');
  body.className = 'sd-body';
  drawer.appendChild(body);

  var footer = document.createElement('div');
  footer.id = 'sd-footer';
  footer.className = 'sd-footer';
  drawer.appendChild(footer);

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) close();
  });

  cart.onChange(function () { render(config); });
}

function renderEmpty(settings) {
  var emptyCart = (settings && settings.emptyCart) || {};

  var empty = document.createElement('div');
  empty.className = 'sd-empty';

  var iconWrap = document.createElement('div');
  iconWrap.className = 'sd-empty-icon';
  iconWrap.innerHTML = icons.get('bag', 28, 1.6);
  empty.appendChild(iconWrap);

  var h = document.createElement('h4');
  h.textContent = emptyCart.title || 'Your cart is empty';
  empty.appendChild(h);

  var p = document.createElement('p');
  p.textContent = emptyCart.description || "Looks like you haven't added anything yet.";
  empty.appendChild(p);

  var link = document.createElement('a');
  link.href = emptyCart.buttonUrl || '/collections/all';
  link.appendChild(document.createTextNode(emptyCart.buttonText || 'Continue shopping'));
  link.insertAdjacentHTML('beforeend', icons.get('arrowRight', 16));
  empty.appendChild(link);

  return empty;
}

function render(config) {
  if (inCheckout) return;
  body.innerHTML = '';
  var footer = document.getElementById('sd-footer');
  footer.innerHTML = '';

  window._sdRerender = function () { render(config); };

  var cartData = cart.getCart();
  var total = cart.getTotal();
  var settings = config.settings || {};
  var itemCount = cart.getItemCount();

  if (countEl) {
    countEl.textContent = itemCount;
    countEl.style.display = itemCount > 0 ? '' : 'none';
  }

  announcements.renderAnnouncements(body, config.announcements);

  if (!cartData || !cartData.items || !cartData.items.length) {
    body.appendChild(renderEmpty(settings));
    return;
  }

  rewardBar.renderRewardBar(body, config.rewardBar, total);

  var itemsWrap = document.createElement('div');
  itemsWrap.className = 'sd-items';
  for (var i = 0; i < cartData.items.length; i++) {
    itemsWrap.appendChild(productCard.renderProductCard(cartData.items[i], settings));
  }
  body.appendChild(itemsWrap);

  var savings = cartData.total_price < cartData.original_total_price
    ? (cartData.original_total_price - cartData.total_price) / 100
    : 0;

  coupons.renderCoupons(body, config.discounts, total, savings);
  upsells.renderUpsells(body, config.upsells, upsellProducts);
  freeGifts.renderFreeGifts(body, config.freeGifts, total);
  notes.renderNotes(body, config.notes);
  trustBadges.renderTrustBadges(body, config.trustBadges);
  confirmation.renderConfirmation(body, config.confirmation);

  var spacer = document.createElement('div');
  spacer.style.height = '16px';
  body.appendChild(spacer);

  var appliedCoupon = coupons.getAppliedCoupon();
  var couponDiscount = coupons.discountFor(appliedCoupon, total);

  if (couponDiscount > 0) {
    var subtotalRow = document.createElement('div');
    subtotalRow.className = 'sd-footer-subtotal';
    subtotalRow.innerHTML = '<span>Subtotal</span>';
    var subAmount = document.createElement('span');
    subAmount.textContent = formatter.formatPrice(total);
    subtotalRow.appendChild(subAmount);
    footer.appendChild(subtotalRow);

    var discountRow = document.createElement('div');
    discountRow.className = 'sd-footer-discount';
    var discLabel = document.createElement('span');
    discLabel.innerHTML = icons.get('tag', 13);
    discLabel.appendChild(document.createTextNode(appliedCoupon.code));
    discountRow.appendChild(discLabel);
    var discAmount = document.createElement('span');
    discAmount.textContent = '−' + formatter.formatPrice(couponDiscount);
    discountRow.appendChild(discAmount);
    footer.appendChild(discountRow);
  }

  var finalTotal = Math.max(0, total - couponDiscount);

  var totalRow = document.createElement('div');
  totalRow.className = 'sd-footer-total';
  totalRow.innerHTML = '<span>Total</span>';
  var totalAmount = document.createElement('span');
  totalAmount.textContent = formatter.formatPrice(finalTotal);
  totalRow.appendChild(totalAmount);
  footer.appendChild(totalRow);

  var checkoutBtn = document.createElement('button');
  checkoutBtn.className = 'sd-checkout-btn';
  checkoutBtn.type = 'button';
  checkoutBtn.innerHTML = icons.get('lock', 17) + '<span>Checkout</span>';
  checkoutBtn.onclick = function () {
    if (!confirmation.isConfirmed()) {
      var confirmEl = body.querySelector('.sd-confirm');
      if (confirmEl) {
        confirmEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        confirmEl.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' },
           { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
          { duration: 320, easing: 'ease-in-out' }
        );
      }
      return;
    }
    inCheckout = true;
    body.innerHTML = '';
    footer.innerHTML = '';
    checkoutForm.showCheckoutForm(body, cartData, config, function () {
      inCheckout = false;
      render(config);
    }, appliedCoupon ? appliedCoupon.code : null, couponDiscount);
  };
  footer.appendChild(checkoutBtn);

  var note = document.createElement('div');
  note.className = 'sd-footer-note';
  note.innerHTML = icons.get('shield', 12) + '<span>Taxes and shipping calculated at checkout</span>';
  footer.appendChild(note);
}

function open(config) {
  if (!drawer) create(config);
  isOpen = true;
  overlay.classList.add('sd-open');
  drawer.classList.add('sd-open');
  document.body.style.overflow = 'hidden';
  render(config);
}

function close() {
  isOpen = false;
  inCheckout = false;
  if (overlay) overlay.classList.remove('sd-open');
  if (drawer) drawer.classList.remove('sd-open');
  document.body.style.overflow = '';
}

function toggle(config) {
  if (isOpen) close();
  else open(config);
}

function setUpsellProducts(products) {
  upsellProducts = products || [];
}

module.exports = { create, open, close, toggle, render, setUpsellProducts };
