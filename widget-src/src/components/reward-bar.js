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
    text.innerHTML = icons.get(TIER_ICONS[nextTier.type] || 'star', 15) +
      '<span>Add <b>₹' + away.toFixed(0) + '</b> more to unlock <b>' + nextTier.label + '</b></span>';
  } else {
    text.innerHTML = icons.get('checkCircle', 15) +
      '<span>All rewards unlocked — <b>nice one</b></span>';
  }
  el.appendChild(text);

  var track = document.createElement('div');
  track.className = 'sd-reward-track';
  var fill = document.createElement('div');
  fill.className = 'sd-reward-fill';
  fill.style.width = pct + '%';
  track.appendChild(fill);
  el.appendChild(track);

  var milestones = document.createElement('div');
  milestones.className = 'sd-reward-milestones';

  for (var j = 0; j < sorted.length; j++) {
    var tier = sorted[j];
    var reached = cartTotal >= tier.threshold;

    var ms = document.createElement('div');
    ms.className = 'sd-milestone' + (reached ? ' sd-reached' : '');

    var iconEl = document.createElement('div');
    iconEl.className = 'sd-milestone-icon' + (reached ? ' sd-reached' : '');
    iconEl.innerHTML = reached
      ? icons.get('check', 15, 2.4)
      : icons.get(TIER_ICONS[tier.type] || 'star', 15);
    ms.appendChild(iconEl);

    var label = document.createElement('div');
    label.className = 'sd-milestone-label';
    label.textContent = tier.label;
    ms.appendChild(label);

    milestones.appendChild(ms);

    if (reached && !reachedTiers[tier.label] && config.confetti && config.confetti.enabled) {
      reachedTiers[tier.label] = true;
      confetti.createConfetti(config.confetti.template || 'fireworks');
    }
  }

  el.appendChild(milestones);
  container.appendChild(el);
}

module.exports = { renderRewardBar };
