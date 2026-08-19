var icons = require('../utils/icons');

function renderTrustBadges(container, config) {
  var badges = [];
  if (Array.isArray(config)) {
    badges = config;
  } else if (config && config.enabled && config.badges) {
    badges = config.badges;
  }
  if (!badges.length) return;

  var el = document.createElement('div');
  el.className = 'sd-trust';

  var head = document.createElement('div');
  head.className = 'sd-trust-head';
  head.innerHTML = icons.get('shield', 14) + '<span>Secure & encrypted payment</span>';
  el.appendChild(head);

  var row = document.createElement('div');
  row.className = 'sd-badges';

  for (var i = 0; i < badges.length; i++) {
    var mark = icons.brand(badges[i]);
    if (!mark) continue;
    var badge = document.createElement('div');
    badge.className = 'sd-badge';
    badge.title = badges[i];
    badge.innerHTML = mark;
    row.appendChild(badge);
  }

  if (!row.children.length) return;

  el.appendChild(row);
  container.appendChild(el);
}

module.exports = { renderTrustBadges };
