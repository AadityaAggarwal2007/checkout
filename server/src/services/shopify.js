const axios = require('axios');

const API_VERSION = '2024-01';

function getClient(shopifyUrl, token) {
  return axios.create({
    baseURL: `https://${shopifyUrl}/admin/api/${API_VERSION}`,
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
  });
}

async function getProducts(shopifyUrl, token, query = '', limit = 10) {
  const client = getClient(shopifyUrl, token);
  let url = `/products.json?limit=${limit}&fields=id,title,handle,variants,images`;
  if (query) url += `&title=${encodeURIComponent(query)}`;
  const { data } = await client.get(url);
  return data.products || [];
}

async function getProductVariant(shopifyUrl, token, variantId) {
  const client = getClient(shopifyUrl, token);
  const { data } = await client.get(`/variants/${variantId}.json`);
  return data.variant;
}

async function verifyPrices(shopifyUrl, token, items) {
  const client = getClient(shopifyUrl, token);
  const verified = [];

  for (const item of items) {
    const { data } = await client.get(`/variants/${item.variantId}.json`);
    const variant = data.variant;
    verified.push({
      variantId: variant.id,
      productId: variant.product_id,
      title: item.title || variant.title,
      price: variant.price,
      compareAtPrice: variant.compare_at_price,
      quantity: item.quantity,
      sku: variant.sku
    });
  }

  return verified;
}

async function validateCoupon(shopifyUrl, token, code) {
  const client = getClient(shopifyUrl, token);
  try {
    const { data } = await client.get(`/discount_codes/lookup.json?code=${encodeURIComponent(code)}`);
    if (data.discount_code) {
      const { data: ruleData } = await client.get(`/price_rules/${data.discount_code.price_rule_id}.json`);
      return {
        valid: true,
        code: data.discount_code.code,
        type: ruleData.price_rule.value_type,
        value: ruleData.price_rule.value
      };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

async function createOrder(shopifyUrl, token, { order, financialStatus }) {
  const client = getClient(shopifyUrl, token);

  const lineItems = order.items.map(item => ({
    variant_id: item.variantId,
    quantity: item.quantity,
    price: item.price
  }));

  const orderData = {
    order: {
      line_items: lineItems,
      financial_status: financialStatus,
      customer: {
        phone: order.customerPhone,
        email: order.customerEmail || undefined
      },
      shipping_address: {
        first_name: order.customerName || 'Customer',
        address1: order.address.line1,
        address2: order.address.line2 || '',
        city: order.address.city,
        province: order.address.state,
        zip: order.address.pincode,
        country: 'IN',
        phone: order.customerPhone
      },
      note: order.notes || '',
      tags: 'shopdrawer',
      send_receipt: true
    }
  };

  if (order.couponCode) {
    orderData.order.discount_codes = [{
      code: order.couponCode,
      amount: String(order.discount),
      type: 'fixed_amount'
    }];
  }

  const { data } = await client.post('/orders.json', orderData);
  return data.order;
}

module.exports = { getProducts, getProductVariant, verifyPrices, validateCoupon, createOrder };
