var icons = require('../utils/icons');

var confirmed = false;

function isConfirmed() {
  return confirmed;
}

function renderConfirmation(container, config) {
  if (!config || !config.enabled) {
    confirmed = true;
    return;
  }

  var labelText = config.text || 'I accept the terms and conditions';

  if (!config.checkboxEnabled) {
    confirmed = true;
    var plain = document.createElement('div');
    plain.className = 'sd-confirm';
    plain.style.cursor = 'default';
    var plainLabel = document.createElement('span');
    plainLabel.className = 'sd-confirm-label';
    plainLabel.textContent = labelText;
    plain.appendChild(plainLabel);
    container.appendChild(plain);
    return;
  }

  confirmed = !config.required;

  var el = document.createElement('label');
  el.className = 'sd-confirm';

  var box = document.createElement('span');
  box.className = 'sd-checkbox' + (confirmed ? ' sd-checked' : '');
  box.innerHTML = icons.get('check', 13, 3);
  box.setAttribute('role', 'checkbox');
  box.setAttribute('aria-checked', confirmed ? 'true' : 'false');
  el.appendChild(box);

  var label = document.createElement('span');
  label.className = 'sd-confirm-label';
  label.textContent = labelText;
  el.appendChild(label);

  el.onclick = function (e) {
    e.preventDefault();
    confirmed = !confirmed;
    box.classList.toggle('sd-checked', confirmed);
    box.setAttribute('aria-checked', confirmed ? 'true' : 'false');
  };

  container.appendChild(el);
}

module.exports = { renderConfirmation, isConfirmed };
