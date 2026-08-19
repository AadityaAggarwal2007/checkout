const express = require('express');
const prisma = require('../db');
const axios = require('axios');

const router = express.Router();

async function getStoreByKey(key) {
  return prisma.store.findUnique({ where: { widgetKey: key } });
}

router.get('/config', async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'Widget key required' });

    const store = await getStoreByKey(key);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const config = await prisma.drawerConfig.findUnique({
      where: { storeId: store.id }
    });
    if (!config) return res.status(404).json({ error: 'Config not found' });

    const { id, storeId, updatedAt, ...sections } = config;
    sections.shopifyUrl = store.shopifyUrl;
    res.set('Cache-Control', 'public, max-age=300');
    res.json(sections);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/upsell-products', async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'Widget key required' });

    const store = await getStoreByKey(key);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const config = await prisma.drawerConfig.findUnique({
      where: { storeId: store.id }
    });

    const upsellConfig = config.upsells || {};
    if (!upsellConfig.enabled || !upsellConfig.productHandles?.length) {
      return res.json([]);
    }

    const products = [];
    for (const handle of upsellConfig.productHandles) {
      try {
        const { data } = await axios.get(
          `https://${store.shopifyUrl}/products/${handle}.json`
        );
        if (data.product) products.push(data.product);
      } catch {}
    }

    res.set('Cache-Control', 'public, max-age=300');
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/validate-coupon', async (req, res) => {
  try {
    const { key, code } = req.body;
    if (!key || !code) return res.status(400).json({ error: 'Key and code required' });

    const store = await getStoreByKey(key);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const config = await prisma.drawerConfig.findUnique({
      where: { storeId: store.id }
    });

    const discountConfig = config.discounts || {};
    if (!discountConfig.enabled || !discountConfig.codes?.length) {
      return res.json({ valid: false });
    }

    const match = discountConfig.codes.find(
      c => c.code.toLowerCase() === code.toLowerCase()
    );

    if (match) {
      res.json({
        valid: true,
        code: match.code,
        type: match.type || 'percentage',
        value: match.value,
        title: match.code
      });
    } else {
      res.json({ valid: false });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
