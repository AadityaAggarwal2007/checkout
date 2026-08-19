const express = require('express');
const prisma = require('../db');
const CryptoJS = require('crypto-js');
const { authenticate, storeAccess } = require('../middleware/auth');

const router = express.Router();

function encryptToken(token) {
  return CryptoJS.AES.encrypt(token, process.env.ENCRYPTION_KEY).toString();
}

function decryptToken(encrypted) {
  const bytes = CryptoJS.AES.decrypt(encrypted, process.env.ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const storeUsers = await prisma.storeUser.findMany({
      where: { userId: req.user.id },
      include: { store: { select: { id: true, name: true, shopifyUrl: true, widgetKey: true, createdAt: true } } }
    });
    res.json(storeUsers.map(su => ({ ...su.store, role: su.role })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, shopifyUrl, adminApiToken } = req.body;
    if (!name || !shopifyUrl) {
      return res.status(400).json({ error: 'Name and Shopify URL required' });
    }

    const existing = await prisma.store.findUnique({ where: { shopifyUrl } });
    if (existing) {
      return res.status(400).json({ error: 'Store with this URL already exists' });
    }

    const storeData = { name, shopifyUrl };
    if (adminApiToken) storeData.adminApiToken = encryptToken(adminApiToken);

    const store = await prisma.store.create({ data: storeData });

    await prisma.storeUser.create({
      data: { userId: req.user.id, storeId: store.id, role: 'owner' }
    });

    await prisma.drawerConfig.create({
      data: { storeId: store.id }
    });

    res.json({
      id: store.id,
      name: store.name,
      shopifyUrl: store.shopifyUrl,
      widgetKey: store.widgetKey,
      createdAt: store.createdAt
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', storeAccess, async (req, res) => {
  try {
    const store = await prisma.store.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, shopifyUrl: true, widgetKey: true, createdAt: true, updatedAt: true }
    });
    if (!store) return res.status(404).json({ error: 'Store not found' });
    res.json({ ...store, role: req.storeRole });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', storeAccess, async (req, res) => {
  try {
    const { name, shopifyUrl, adminApiToken } = req.body;
    const data = {};
    if (name) data.name = name;
    if (shopifyUrl) data.shopifyUrl = shopifyUrl;
    if (adminApiToken) data.adminApiToken = encryptToken(adminApiToken);

    const store = await prisma.store.update({
      where: { id: req.params.id },
      data,
      select: { id: true, name: true, shopifyUrl: true, widgetKey: true, updatedAt: true }
    });
    res.json(store);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', storeAccess, async (req, res) => {
  try {
    if (req.storeRole !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can delete a store' });
    }
    await prisma.store.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/regenerate-key', storeAccess, async (req, res) => {
  try {
    const { v4: uuidv4 } = require('uuid');
    const store = await prisma.store.update({
      where: { id: req.params.id },
      data: { widgetKey: uuidv4() },
      select: { widgetKey: true }
    });
    res.json({ widgetKey: store.widgetKey });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
module.exports.decryptToken = decryptToken;
module.exports.encryptToken = encryptToken;
