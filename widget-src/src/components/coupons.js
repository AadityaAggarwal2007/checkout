var widgetApi = require('../utils/api');
var confettiUtil = require('../utils/confetti');
var icons = require('../utils/icons');

var appliedCoupon = null;
var panelOpen = false;

function getAppliedCoupon() {
  return appliedCoupon;
}

function clearCoupon() {
  appliedCoupon = null;
}

function discountFor(coupon, cartTotal) {
  if (!coupon) return 0;
  var value = Math.abs(parseFloat(coupon.value)) || 0;
  var amount = coupon.type === 'percentage' ? cartTotal * (value / 100) : value;
  return Math.min(amount, cartTotal);
}

function labelFor(coupon) {
  var value = Math.abs(parseFloat(coupon.value)) || 0;
  return coupon.type === 'percentage' ? value + '% off' : '₹' + value + ' off';
}

function renderCoupons(container, config, cartTotal, savings) {
  if (!config || !config.enabled) return;

  var el = document.createElement('div');
  el.className = 'sd-coupons-section';

  var header = document.createElement('div');
  header.className = 'sd-coupons' + (panelOpen ? ' sd-expanded' : '');

  var iconEl = document.createElement('div');
  iconEl.className = 'sd-coupons-icon';
  iconEl.innerHTML = icons.get('tag', 16);
  header.appendChild(iconEl);

  var label = document.createElement('div');
  label.className = 'sd-coupons-label';
  if (appliedCoupon) {
    label.innerHTML = 'Coupon applied<span class="sd-coupons-sub">' + appliedCoupon.code +
      ' — you save ₹' + discountFor(appliedCoupon, cartTotal).toFixed(0) + '</span>';
  } else {
    label.innerHTML = 'Apply a coupon<span class="sd-coupons-sub">Have a promo code?</span>';
  }
  header.appendChild(label);

  var arrow = document.createElement('span');
  arrow.className = 'sd-coupon-arrow';
  arrow.innerHTML = icons.get('chevronRight', 18);
  header.appendChild(arrow);

  el.appendChild(header);

  var panel = document.createElement('div');
  panel.className = 'sd-coupon-panel';
  if (!panelOpen) panel.style.display = 'none';

  var inputRow = document.createElement('div');
  inputRow.className = 'sd-coupon-input-row';

  var input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Enter promo code';
  input.className = 'sd-coupon-input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  if (appliedCoupon) {
    input.value = appliedCoupon.code;
    input.disabled = true;
  }
  inputRow.appendChild(input);

  var applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'sd-coupon-apply' + (appliedCoupon ? ' sd-ghost' : '');
  applyBtn.textContent = appliedCoupon ? 'Remove' : 'Apply';
  inputRow.appendChild(applyBtn);

  panel.appendChild(inputRow);

  var msgEl = document.createElement('div');
  msgEl.className = 'sd-coupon-msg';
  panel.appendChild(msgEl);

  if (appliedCoupon) {
    msgEl.className = 'sd-coupon-msg sd-coupon-success';
    msgEl.innerHTML = icons.get('checkCircle', 14) +
      '<span>' + appliedCoupon.code + ' applied — ' + labelFor(appliedCoupon) +
      ' (−₹' + discountFor(appliedCoupon, cartTotal).toFixed(0) + ')</span>';
  } else if (savings > 0) {
    var saved = document.createElement('div');
    saved.className = 'sd-coupons-saved';
    saved.innerHTML = icons.get('sparkles', 14, 0) +
      '<span>You are already saving ₹' + savings.toFixed(0) + ' on this order</span>';
    panel.appendChild(saved);
  }

  if (config.codes && config.codes.length) {
    var available = document.createElement('div');
    available.className = 'sd-coupon-list';

    var listTitle = document.createElement('div');
    listTitle.className = 'sd-coupon-list-title';
    listTitle.textContent = 'Available offers';
    available.appendChild(listTitle);

    for (var i = 0; i < config.codes.length; i++) {
      (function (couponData) {
        var isActive = appliedCoupon && appliedCoupon.code === couponData.code;

        var chip = document.createElement('div');
        chip.className = 'sd-coupon-chip' + (isActive ? ' sd-coupon-active' : '');

        var codeEl = document.createElement('span');
        codeEl.className = 'sd-coupon-code';
        codeEl.textContent = couponData.code;
        chip.appendChild(codeEl);

        var desc = document.createElement('span');
        desc.className = 'sd-coupon-desc';
        desc.textContent = labelFor(couponData);
        chip.appendChild(desc);

        var tapBtn = document.createElement('button');
        tapBtn.type = 'button';
        tapBtn.className = 'sd-coupon-tap';
        if (isActive) {
          tapBtn.innerHTML = icons.get('check', 13, 2.6) + '<span>Applied</span>';
          tapBtn.disabled = true;
        } else {
          tapBtn.textContent = 'Apply';
          tapBtn.onclick = function () {
            if (appliedCoupon) return;
            input.value = couponData.code;
            applyBtn.click();
          };
        }
        chip.appendChild(tapBtn);

        available.appendChild(chip);
      })(config.codes[i]);
    }

    panel.appendChild(available);
  }

  header.onclick = function () {
    panelOpen = !panelOpen;
    panel.style.display = panelOpen ? 'block' : 'none';
    header.classList.toggle('sd-expanded', panelOpen);
    if (panelOpen && !appliedCoupon) input.focus();
  };

  applyBtn.onclick = function () {
    if (appliedCoupon) {
      appliedCoupon = null;
      if (window._sdRerender) window._sdRerender();
      return;
    }

    var code = input.value.trim();
    if (!code) {
      msgEl.className = 'sd-coupon-msg sd-coupon-error';
      msgEl.innerHTML = icons.get('alert', 14) + '<span>Enter a promo code first</span>';
      input.focus();
      return;
    }

    applyBtn.disabled = true;
    applyBtn.textContent = 'Checking…';
    msgEl.className = 'sd-coupon-msg';
    msgEl.innerHTML = '';

    widgetApi.post('/api/widget/validate-coupon', { code: code }).then(function (result) {
      if (result && result.valid) {
        appliedCoupon = result;
        panelOpen = false;
        confettiUtil.createConfetti('stars');
        if (window._sdRerender) window._sdRerender();
      } else {
        msgEl.className = 'sd-coupon-msg sd-coupon-error';
        msgEl.innerHTML = icons.get('alert', 14) + '<span>That code is not valid</span>';
        applyBtn.textContent = 'Apply';
        applyBtn.disabled = false;
      }
    }).catch(function () {
      msgEl.className = 'sd-coupon-msg sd-coupon-error';
      msgEl.innerHTML = icons.get('alert', 14) + '<span>Could not check that code. Try again.</span>';
      applyBtn.textContent = 'Apply';
      applyBtn.disabled = false;
    });
  };

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); applyBtn.click(); }
  });

  el.appendChild(panel);
  container.appendChild(el);
}

module.exports = { renderCoupons, getAppliedCoupon, clearCoupon, discountFor };
