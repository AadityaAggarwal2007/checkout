const express = require('express');
const prisma = require('../db');
const { authenticate, storeAccess } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

const VALID_SECTIONS = [
  'announcements', 'rewardBar', 'upsells', 'addons', 'notes',
  'confirmation', 'discounts', 'trustBadges', 'freeGifts', 'settings', 'colors',
  'postPurchase'
];

router.get('/:storeId/config', storeAccess, async (req, res) => {
  try {
    const config = await prisma.drawerConfig.findUnique({
      where: { storeId: req.params.storeId }
    });
    if (!config) return res.status(404).json({ error: 'Config not found' });

    const { id, storeId, updatedAt, ...sections } = config;
    res.json(sections);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:storeId/config', storeAccess, async (req, res) => {
  try {
    const data = {};
    for (const key of Object.keys(req.body)) {
      if (VALID_SECTIONS.includes(key)) {
        data[key] = req.body[key];
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid config sections provided' });
    }

    const config = await prisma.drawerConfig.update({
      where: { storeId: req.params.storeId },
      data
    });

    const { id, storeId, updatedAt, ...sections } = config;
    res.json(sections);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
