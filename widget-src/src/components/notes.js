var cart = require('../cart');
var icons = require('../utils/icons');

function renderNotes(container, config) {
  if (!config || !config.enabled) return;

  var el = document.createElement('div');
  el.className = 'sd-notes';

  var label = document.createElement('div');
  label.className = 'sd-section-title';
  label.innerHTML = icons.get('note', 15) + '<span>' + (config.title || 'Order notes') + '</span>';
  el.appendChild(label);

  var textarea = document.createElement('textarea');
  textarea.placeholder = config.placeholder || 'Add a note for this order…';
  if (config.charLimit > 0) textarea.maxLength = config.charLimit;
  el.appendChild(textarea);

  if (config.charLimit > 0) {
    var counter = document.createElement('div');
    counter.className = 'sd-notes-count';
    counter.textContent = '0 / ' + config.charLimit;
    el.appendChild(counter);

    textarea.oninput = function () {
      counter.textContent = textarea.value.length + ' / ' + config.charLimit;
    };
  }

  var timeout;
  textarea.onchange = function () {
    clearTimeout(timeout);
    timeout = setTimeout(function () {
      cart.updateNote(textarea.value);
    }, 500);
  };

  container.appendChild(el);
}

module.exports = { renderNotes };
