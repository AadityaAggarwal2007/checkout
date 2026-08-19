function formatPrice(amount) {
  var value = parseFloat(amount);
  if (isNaN(value)) value = 0;
  // Whole rupees render clean; anything with paise always shows both digits
  // so totals never come out as "₹1,618.2".
  var decimals = Math.round(value * 100) % 100 === 0 ? 0 : 2;
  return '₹' + value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatDiscount(compareAt, price) {
  if (!compareAt || parseFloat(compareAt) <= parseFloat(price)) return null;
  var pct = Math.round((1 - parseFloat(price) / parseFloat(compareAt)) * 100);
  if (pct <= 0) return null;
  return pct + '% off';
}

module.exports = { formatPrice, formatDiscount };
