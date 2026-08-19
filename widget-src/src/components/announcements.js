var icons = require('../utils/icons');

function renderAnnouncements(container, config) {
  if (!config || !config.enabled || !config.messages || !config.messages.length) return;

  var el = document.createElement('div');
  el.className = 'sd-announcement';
  el.innerHTML = icons.get('sparkles', 14, 0);

  var textEl = document.createElement('span');
  textEl.className = 'sd-announcement-text';
  textEl.textContent = config.messages[0].text;
  el.appendChild(textEl);

  container.appendChild(el);

  if (config.messages.length > 1) {
    var idx = 0;
    var duration = (config.duration || 5) * 1000;

    setInterval(function () {
      textEl.style.opacity = '0';
      setTimeout(function () {
        idx = (idx + 1) % config.messages.length;
        textEl.textContent = config.messages[idx].text;
        textEl.style.opacity = '1';
      }, 280);
    }, duration);
  }
}

module.exports = { renderAnnouncements };
