var confetti = require('../utils/confetti');
var icons = require('../utils/icons');

var reachedTiers = {};

var TIER_ICONS = { shipping: 'truck', product: 'gift', gift: 'gift' };

// Milestones sit at even intervals rather than at their rupee value's share of
// the track. Spacing by threshold makes the gaps lopsided (₹699/₹1299/₹1999
// lands at 35%/65%/100%) and reads as unaligned; even spacing reads deliberate.
function milestonePositions(count) {
  var out = [];
  for (var i = 0; i < count; i++) out.push(((i + 1) / count) * 100);
  return out;
}

// With even spacing the fill can no longer be a flat cartTotal/maxThreshold —
// it has to advance segment by segment so the bar reaches each dot exactly when
// its threshold is met.
function fillPercent(sorted, positions, cartTotal) {
  var prevThreshold = 0;
  var prevPos = 0;

  for (var i = 0; i < sorted.length; i++) {
    if (cartTotal < sorted[i].threshold) {
      var span = sorted[i].threshold - prevThreshold;
      var frac = span > 0 ? (cartTotal - prevThreshold) / span : 0;
      return prevPos + frac * (positions[i] - prevPos);
    }
    prevThreshold = sorted[i].threshold;
    prevPos = positions[i];
  }

  return 100;
}

function renderRewardBar(container, config, cartTotal) {
  if (!config || !config.enabled || !config.tiers || !config.tiers.length) return;

  var el = document.createElement('div');
  el.className = 'sd-reward-bar';

  var sorted = config.tiers.slice().sort(function (a, b) { return a.threshold - b.threshold; });
  var positions = milestonePositions(sorted.length);
  var pct = fillPercent(sorted, positions, cartTotal);

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
    text.innerHTML = '<span>You\'re <b>₹' + away.toFixed(0) + '</b> away from <b>' +
      nextTier.label + '</b></span>';
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

    // The final dot sits at 100%, so centering its label would push half the
    // text outside the card — anchor that one to the right edge instead.
    var edge = j === sorted.length - 1 ? ' sd-edge-end' : '';

    var ms = document.createElement('div');
    ms.className = 'sd-milestone' + (reached ? ' sd-reached' : '') + (isNext ? ' sd-next' : '') + edge;
    ms.style.left = positions[j] + '%';

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
