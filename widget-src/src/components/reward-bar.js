var confetti = require('../utils/confetti');
var icons = require('../utils/icons');

var reachedTiers = {};

var TIER_ICONS = { shipping: 'truck', product: 'gift', gift: 'gift' };

function renderRewardBar(container, config, cartTotal) {
  if (!config || !config.enabled || !config.tiers || !config.tiers.length) return;

  var el = document.createElement('div');
  el.className = 'sd-reward-bar';

  var sorted = config.tiers.slice().sort(function (a, b) { return a.threshold - b.threshold; });
  var maxThreshold = sorted[sorted.length - 1].threshold;
  var pct = Math.min(100, (cartTotal / maxThreshold) * 100);

  var nextTier = null;
  for (var i = 0; i < sorted.length; i++) {
    if (cartTotal < sorted[i].threshold) {
      nextTier = sorted[i];
      break;
    }
  }

  var text = document.createElement('div');
  text.className = 'sd-reward-text';
  if (nextTier) {
    var away = nextTier.threshold - cartTotal;
    text.innerHTML = '<span>You\'re <b>₹' + away.toFixed(0) + '</b> away</span>';
  } else {
    text.innerHTML = icons.get('checkCircle', 15) +
      '<span>All rewards unlocked!</span>';
  }
  el.appendChild(text);

  var trackWrap = document.createElement('div');
  trackWrap.className = 'sd-reward-track-wrap';

  var track = document.createElement('div');
  track.className = 'sd-reward-track';
  var fill = document.createElement('div');
  fill.className = 'sd-reward-fill';
  fill.style.width = pct + '%';
  track.appendChild(fill);
  trackWrap.appendChild(track);

  for (var j = 0; j < sorted.length; j++) {
    var tier = sorted[j];
    var reached = cartTotal >= tier.threshold;
    var isNext = tier === nextTier;
    var pos = (tier.threshold / maxThreshold) * 100;

    // First and last labels are anchored to the track edges — centering them on
    // a dot at 0%/100% pushes half the text outside the card.
    var edge = j === 0 ? ' sd-edge-start' : (j === sorted.length - 1 ? ' sd-edge-end' : '');

    var ms = document.createElement('div');
    ms.className = 'sd-milestone' + (reached ? ' sd-reached' : '') + (isNext ? ' sd-next' : '') + edge;
    ms.style.left = pos + '%';

    var iconEl = document.createElement('div');
    iconEl.className = 'sd-milestone-icon';
    iconEl.innerHTML = reached
      ? icons.get('check', 14, 2.4)
      : icons.get(TIER_ICONS[tier.type] || 'star', 14);
    ms.appendChild(iconEl);

    var label = document.createElement('div');
    label.className = 'sd-milestone-label';
    label.textContent = tier.label;
    ms.appendChild(label);

    trackWrap.appendChild(ms);

    if (reached && !reachedTiers[tier.label] && config.confetti && config.confetti.enabled) {
      reachedTiers[tier.label] = true;
      confetti.createConfetti(config.confetti.template || 'fireworks');
    }
  }

  el.appendChild(trackWrap);
  container.appendChild(el);
}

module.exports = { renderRewardBar };
