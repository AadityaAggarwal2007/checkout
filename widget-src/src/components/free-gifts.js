var icons = require('../utils/icons');

function renderFreeGifts(container, config, cartTotal) {
  if (!config || !config.enabled || !config.gifts || !config.gifts.length) return;

  var el = document.createElement('div');
  el.className = 'sd-gifts';

  var title = document.createElement('div');
  title.className = 'sd-section-title';
  title.innerHTML = icons.get('gift', 15) + '<span>Free gifts</span>';
  el.appendChild(title);

  var sorted = config.gifts.slice().sort(function (a, b) { return a.threshold - b.threshold; });

  for (var i = 0; i < sorted.length; i++) {
    var gift = sorted[i];
    var unlocked = cartTotal >= gift.threshold;

    var card = document.createElement('div');
    card.className = 'sd-gift-card ' + (unlocked ? 'sd-unlocked' : 'sd-locked');

    var iconEl = document.createElement('div');
    iconEl.className = 'sd-gift-icon';
    iconEl.innerHTML = unlocked ? icons.get('gift', 17) : icons.get('lock', 16);
    card.appendChild(iconEl);

    var info = document.createElement('div');
    info.className = 'sd-gift-info';

    var label = document.createElement('div');
    label.className = 'sd-gift-label';
    label.textContent = gift.label || 'Free gift';
    info.appendChild(label);

    var hint = document.createElement('div');
    hint.className = 'sd-gift-hint';
    hint.textContent = unlocked
      ? 'Unlocked — added to your order'
      : 'Add ₹' + (gift.threshold - cartTotal).toFixed(0) + ' more to unlock';
    info.appendChild(hint);

    card.appendChild(info);

    if (unlocked) {
      var badge = document.createElement('div');
      badge.className = 'sd-gift-check';
      badge.innerHTML = icons.get('checkCircle', 17);
      badge.style.color = 'inherit';
      card.appendChild(badge);
    }

    el.appendChild(card);
  }

  container.appendChild(el);
}

module.exports = { renderFreeGifts };
