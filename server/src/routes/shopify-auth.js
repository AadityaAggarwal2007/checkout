const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const prisma = require('../db');
const { encryptToken } = require('./stores');

const router = express.Router();

const SCOPES = 'write_orders,read_orders,read_products,write_products';

router.get('/install', (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).send('Missing shop parameter');

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
  const nonce = crypto.randomBytes(16).toString('hex');

  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}`;

  res.redirect(authUrl);
});

router.get('/callback', async (req, res) => {
  try {
    const { shop, code, state } = req.query;
    if (!shop || !code) return res.status(400).send('Missing parameters');

    const { data } = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      code
    });

    const accessToken = data.access_token;

    const existing = await prisma.store.findUnique({ where: { shopifyUrl: shop } });

    if (existing) {
      await prisma.store.update({
        where: { shopifyUrl: shop },
        data: { adminApiToken: encryptToken(accessToken) }
      });
    } else {
      const { data: shopData } = await axios.get(`https://${shop}/admin/api/2024-01/shop.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken }
      });

      const store = await prisma.store.create({
        data: {
          name: shopData.shop.name || shop,
          shopifyUrl: shop,
          adminApiToken: encryptToken(accessToken)
        }
      });

      await prisma.drawerConfig.create({ data: { storeId: store.id } });

      const adminUser = await prisma.user.findFirst();
      if (adminUser) {
        await prisma.storeUser.create({
          data: { userId: adminUser.id, storeId: store.id, role: 'owner' }
        });
      }
    }

    res.redirect(process.env.DASHBOARD_URL || 'https://cart.shiptrack.store');
  } catch (err) {
    console.error('Shopify OAuth error:', err.response?.data || err.message);
    res.status(500).send('Failed to connect store. Please try again.');
  }
});

module.exports = router;
