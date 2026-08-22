var widgetApi = require('../utils/api');
var formatter = require('../utils/formatter');
var icons = require('../utils/icons');

var INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Chandigarh', 'Puducherry'
];

var STEPS = [
  { label: 'Contact', icon: 'user' },
  { label: 'Address', icon: 'mapPin' },
  { label: 'Payment', icon: 'wallet' }
];

var PAYMENT_METHODS = [
  { id: 'upi', name: 'UPI', desc: 'Google Pay, PhonePe, Paytm & more', icon: 'wallet' },
  { id: 'cards', name: 'Card', desc: 'Visa, Mastercard, RuPay, Amex', icon: 'creditCard' },
  { id: 'netbanking', name: 'Net banking', desc: 'All major Indian banks', icon: 'bank' },
  { id: 'cod', name: 'Cash on delivery', desc: 'Pay when your order arrives', icon: 'banknote' }
];

// settings.paymentMethods is an optional allow-list of method ids. Omit it to
// offer everything; narrow it when a gateway is not yet configured so customers
// are never shown a method that cannot complete.
function enabledMethods(config) {
  var allowed = config && config.settings && config.settings.paymentMethods;
  if (!allowed || !allowed.length) return PAYMENT_METHODS;
  var filtered = PAYMENT_METHODS.filter(function (m) {
    return allowed.indexOf(m.id) !== -1;
  });
  return filtered.length ? filtered : PAYMENT_METHODS;
}

function showCheckoutForm(container, cartData, config, onBack, couponCode, couponDiscount) {
  container.innerHTML = '';

  var methods = enabledMethods(config);

  var step = 1;
  var formData = {
    phone: '', email: '', name: '',
    line1: '', line2: '', city: '', state: '', pincode: '',
    paymentMethod: methods[0].id
  };
  var autofilled = false;
  var lookingUp = false;

  var subtotal = cartData ? cartData.total_price / 100 : 0;
  var total = Math.max(0, subtotal - (couponDiscount || 0));

  function renderSteps(form) {
    var steps = document.createElement('div');
    steps.className = 'sd-steps';

    for (var i = 0; i < STEPS.length; i++) {
      var n = i + 1;
      var state = n === step ? ' sd-active' : (n < step ? ' sd-done' : '');

      var stepEl = document.createElement('div');
      stepEl.className = 'sd-step' + state;

      var dot = document.createElement('div');
      dot.className = 'sd-step-dot';
      dot.innerHTML = n < step ? icons.get('check', 14, 2.6) : icons.get(STEPS[i].icon, 14);
      stepEl.appendChild(dot);

      var label = document.createElement('div');
      label.className = 'sd-step-label';
      label.textContent = STEPS[i].label;
      stepEl.appendChild(label);

      steps.appendChild(stepEl);

      if (i < STEPS.length - 1) {
        var line = document.createElement('div');
        line.className = 'sd-step-line' + (n < step ? ' sd-done' : '');
        steps.appendChild(line);
      }
    }

    form.appendChild(steps);
  }

  var geoLocating = false;

  function useMyLocation() {
    if (!navigator.geolocation) {
      flagError('Location is not supported by your browser');
      return;
    }
    geoLocating = true;
    var locBtn = container.querySelector('.sd-locate-btn');
    if (locBtn) {
      locBtn.disabled = true;
      locBtn.innerHTML = icons.get('mapPin', 14) + '<span>Locating…</span>';
    }

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = pos.coords.latitude;
        var lon = pos.coords.longitude;
        fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lon + '&addressdetails=1&accept-language=en')
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var addr = data.address || {};
            if (!formData.line1) {
              var road = addr.road || addr.neighbourhood || addr.suburb || '';
              if (road) formData.line2 = road;
            }
            if (addr.city || addr.town || addr.village || addr.state_district) {
              formData.city = addr.city || addr.town || addr.village || addr.state_district || '';
            }
            if (addr.postcode) formData.pincode = addr.postcode;
            if (addr.state) {
              for (var i = 0; i < INDIAN_STATES.length; i++) {
                if (INDIAN_STATES[i].toLowerCase() === addr.state.toLowerCase() ||
                    addr.state.toLowerCase().indexOf(INDIAN_STATES[i].toLowerCase()) !== -1) {
                  formData.state = INDIAN_STATES[i];
                  break;
                }
              }
            }
            autofilled = true;
            geoLocating = false;
            render();
          })
          .catch(function () {
            geoLocating = false;
            flagError('Could not determine address from your location');
            if (locBtn) {
              locBtn.disabled = false;
              locBtn.innerHTML = icons.get('mapPin', 14) + '<span>Use my location</span>';
            }
          });
      },
      function () {
        geoLocating = false;
        flagError('Location access was denied');
        if (locBtn) {
          locBtn.disabled = false;
          locBtn.innerHTML = icons.get('mapPin', 14) + '<span>Use my location</span>';
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function lookupAndContinue() {
    var btn = container.querySelector('.sd-checkout-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>Looking up…</span>';
    }
    lookingUp = true;

    widgetApi.post('/api/widget/lookup-address', { phone: formData.phone })
      .then(function (res) {
        if (res && res.found) {
          if (res.name && !formData.name) formData.name = res.name;
          if (res.email && !formData.email) formData.email = res.email;
          var addr = res.address || {};
          if (addr.line1) formData.line1 = addr.line1;
          if (addr.line2) formData.line2 = addr.line2;
          if (addr.city) formData.city = addr.city;
          if (addr.state) formData.state = addr.state;
          if (addr.pincode) formData.pincode = addr.pincode;
          autofilled = true;
        }
      })
      .catch(function () {})
      .then(function () {
        lookingUp = false;
        step = 2;
        render();
      });
  }

  function render() {
    container.innerHTML = '';

    var form = document.createElement('div');
    form.className = 'sd-checkout-form';

    var backBtn = document.createElement('button');
    backBtn.className = 'sd-back-btn';
    backBtn.type = 'button';
    backBtn.innerHTML = icons.get('arrowLeft', 15) + '<span>' + (step === 1 ? 'Back to cart' : 'Back') + '</span>';
    backBtn.onclick = function () {
      if (step === 1) { onBack(); return; }
      step--;
      render();
    };
    form.appendChild(backBtn);

    renderSteps(form);

    if (step === 1) {
      form.appendChild(heading('Contact details', "We'll use this to send order updates"));
      form.appendChild(makeInput('Full name', 'name', 'text', 'Your name'));
      form.appendChild(makePhoneInput());
      form.appendChild(makeInput('Email (optional)', 'email', 'email', 'you@example.com'));
      form.appendChild(makeButton('Continue to address', function () {
        if (!formData.phone || formData.phone.replace(/\D/g, '').length < 10) {
          flagError('Enter a valid 10-digit phone number');
          return;
        }
        lookupAndContinue();
      }));
    } else if (step === 2) {
      if (autofilled) {
        var banner = document.createElement('div');
        banner.className = 'sd-autofill-banner';
        banner.innerHTML = icons.get('check', 14, 2.2) + '<span>Welcome back! We filled in your last address.</span>';
        form.appendChild(banner);
      }
      form.appendChild(heading('Delivery address', 'Where should we send your order?'));

      if (navigator.geolocation) {
        var locBtn = document.createElement('button');
        locBtn.type = 'button';
        locBtn.className = 'sd-locate-btn';
        locBtn.innerHTML = icons.get('mapPin', 14) + '<span>Use my location</span>';
        locBtn.onclick = useMyLocation;
        form.appendChild(locBtn);
      }

      form.appendChild(makeInput('Address line 1', 'line1', 'text', 'House / flat, building'));
      form.appendChild(makeInput('Address line 2 (optional)', 'line2', 'text', 'Street, locality'));

      var row = document.createElement('div');
      row.className = 'sd-form-row';
      row.appendChild(makeInput('City', 'city', 'text', 'City'));
      row.appendChild(makeInput('Pincode', 'pincode', 'text', '110001'));
      form.appendChild(row);

      form.appendChild(makeStateSelect());
      form.appendChild(makeButton('Continue to payment', function () {
        if (!formData.line1 || !formData.city || !formData.pincode || !formData.state) {
          flagError('Fill in all address fields to continue');
          return;
        }
        step = 3;
        render();
      }));
    } else {
      form.appendChild(heading('Payment method', 'Choose how you would like to pay'));

      var optionsContainer = document.createElement('div');
      optionsContainer.className = 'sd-payment-options';

      for (var i = 0; i < methods.length; i++) {
        (function (opt) {
          var selected = formData.paymentMethod === opt.id;

          var option = document.createElement('div');
          option.className = 'sd-payment-option' + (selected ? ' sd-selected' : '');
          option.onclick = function () {
            formData.paymentMethod = opt.id;
            render();
          };

          var radio = document.createElement('div');
          radio.className = 'sd-payment-radio' + (selected ? ' sd-selected' : '');
          option.appendChild(radio);

          var bodyEl = document.createElement('div');
          bodyEl.className = 'sd-payment-body';

          var name = document.createElement('div');
          name.className = 'sd-payment-name';
          name.textContent = opt.name;
          if (opt.id === 'upi') {
            var tag = document.createElement('span');
            tag.className = 'sd-payment-tag';
            tag.textContent = 'Fastest';
            name.appendChild(tag);
          }
          bodyEl.appendChild(name);

          var desc = document.createElement('div');
          desc.className = 'sd-payment-desc';
          desc.textContent = opt.desc;
          bodyEl.appendChild(desc);

          option.appendChild(bodyEl);

          var amount = document.createElement('div');
          amount.className = 'sd-payment-amount';
          amount.textContent = formatter.formatPrice(total);
          option.appendChild(amount);

          optionsContainer.appendChild(option);
        })(methods[i]);
      }

      form.appendChild(optionsContainer);
      form.appendChild(makeButton(ctaLabel(), function () {
        placeOrder(form);
      }, 'lock'));
    }

    container.appendChild(form);
  }

  // Nothing is charged up front on COD, so "Pay" would misdescribe the action.
  function ctaLabel() {
    return formData.paymentMethod === 'cod'
      ? 'Place order · ' + formatter.formatPrice(total)
      : 'Pay ' + formatter.formatPrice(total);
  }

  function heading(titleText, subText) {
    var wrap = document.createElement('div');
    var h = document.createElement('h4');
    h.textContent = titleText;
    wrap.appendChild(h);
    var sub = document.createElement('div');
    sub.className = 'sd-form-sub';
    sub.textContent = subText;
    wrap.appendChild(sub);
    return wrap;
  }

  function flagError(message) {
    var existing = container.querySelector('.sd-coupon-msg.sd-coupon-error');
    if (existing) existing.remove();
    var msg = document.createElement('div');
    msg.className = 'sd-coupon-msg sd-coupon-error';
    msg.style.marginBottom = '10px';
    msg.innerHTML = icons.get('alert', 14) + '<span>' + message + '</span>';
    var btn = container.querySelector('.sd-checkout-btn');
    if (btn && btn.parentNode) btn.parentNode.insertBefore(msg, btn);
  }

  function makeInput(label, field, type, placeholder) {
    var group = document.createElement('div');
    group.className = 'sd-form-group';
    var lbl = document.createElement('label');
    lbl.textContent = label;
    group.appendChild(lbl);
    var input = document.createElement('input');
    input.type = type;
    input.placeholder = placeholder || '';
    input.value = formData[field] || '';
    input.autocomplete = field === 'name' ? 'name' : (field === 'email' ? 'email' : 'off');
    input.oninput = function () { formData[field] = input.value; };
    group.appendChild(input);
    return group;
  }

  function makePhoneInput() {
    var group = document.createElement('div');
    group.className = 'sd-form-group';
    var lbl = document.createElement('label');
    lbl.textContent = 'Phone number';
    group.appendChild(lbl);
    var row = document.createElement('div');
    row.className = 'sd-phone-group';
    var code = document.createElement('select');
    code.innerHTML = '<option value="+91">+91</option>';
    row.appendChild(code);
    var input = document.createElement('input');
    input.type = 'tel';
    input.inputMode = 'numeric';
    input.placeholder = '98765 43210';
    input.autocomplete = 'tel';
    input.value = formData.phone;
    input.oninput = function () { formData.phone = input.value; };
    row.appendChild(input);
    group.appendChild(row);
    return group;
  }

  function makeStateSelect() {
    var group = document.createElement('div');
    group.className = 'sd-form-group';
    var lbl = document.createElement('label');
    lbl.textContent = 'State';
    group.appendChild(lbl);
    var select = document.createElement('select');
    var html = '<option value="">Select state</option>';
    for (var i = 0; i < INDIAN_STATES.length; i++) {
      html += '<option value="' + INDIAN_STATES[i] + '">' + INDIAN_STATES[i] + '</option>';
    }
    select.innerHTML = html;
    select.value = formData.state;
    select.onchange = function () { formData.state = select.value; };
    group.appendChild(select);
    return group;
  }

  function makeButton(text, onClick, iconName) {
    var btn = document.createElement('button');
    btn.className = 'sd-checkout-btn';
    btn.type = 'button';
    btn.style.marginTop = '18px';
    btn.innerHTML = (iconName ? icons.get(iconName, 17) : '') + '<span>' + text + '</span>';
    btn.onclick = onClick;
    return btn;
  }

  function showSuccess(titleText, message) {
    container.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'sd-success';

    var iconWrap = document.createElement('div');
    iconWrap.className = 'sd-success-icon';
    iconWrap.innerHTML = icons.get('checkCircle', 30, 1.8);
    wrap.appendChild(iconWrap);

    var h = document.createElement('h4');
    h.textContent = titleText;
    wrap.appendChild(h);

    var p = document.createElement('p');
    p.textContent = message;
    wrap.appendChild(p);

    container.appendChild(wrap);
  }

  async function placeOrder(form) {
    var btn = form.querySelector('.sd-checkout-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>Processing…</span>';
    }

    try {
      var items = cartData.items.map(function (item) {
        return { variantId: item.variant_id, quantity: item.quantity, title: item.title };
      });

      var result = await widgetApi.post('/api/payments/create-order', {
        items: items,
        contact: { phone: formData.phone, email: formData.email, name: formData.name },
        address: {
          line1: formData.line1, line2: formData.line2, city: formData.city,
          state: formData.state, pincode: formData.pincode
        },
        coupon: couponCode || null,
        paymentMethod: formData.paymentMethod
      });

      if (result && result.success) {
        if (formData.paymentMethod === 'cod') {
          showSuccess('Order confirmed', 'Your cash-on-delivery order is placed. We have sent the details to your phone.');
        } else if (result.paymentUrl) {
          window.location.href = result.paymentUrl;
        } else {
          showSuccess('Order placed', 'Your order has been received.');
        }
      } else {
        restoreButton(btn);
        flagError('We could not place your order. Please try again.');
      }
    } catch (err) {
      restoreButton(btn);
      flagError('Something went wrong. Please try again.');
    }
  }

  function restoreButton(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.innerHTML = icons.get('lock', 17) + '<span>' + ctaLabel() + '</span>';
  }

  render();
}

module.exports = { showCheckoutForm };
