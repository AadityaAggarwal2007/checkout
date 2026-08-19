const express = require('express');
const prisma = require('../db');
const axios = require('axios');
const { authenticate, storeAccess } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/:storeId/products', storeAccess, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({ where: { id: req.params.storeId } });
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const { search, limit = 10 } = req.query;

    const { data } = await axios.get(
      `https://${store.shopifyUrl}/products.json?limit=${limit}`
    );

    let products = data.products || [];

    if (search) {
      const q = search.toLowerCase();
      products = products.filter(p => p.title.toLowerCase().includes(q));
    }

    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

module.exports = router;
