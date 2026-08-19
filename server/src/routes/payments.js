const express = require('express');
const prisma = require('../db');
const { decryptToken } = require('./stores');
const payglocal = require('../services/payglocal');
const shopify = require('../services/shopify');

const router = express.Router();

router.post('/create-order', async (req, res) => {
  try {
    const { key, items, contact, address, coupon, notes, paymentMethod } = req.body;
    if (!key) return res.status(400).json({ error: 'Widget key required' });

    const store = await prisma.store.findUnique({ where: { widgetKey: key } });
    if (!store) return res.status(404).json({ error: 'Store not found' });

    if (!store.adminApiToken) {
      return res.status(400).json({ error: 'Store checkout is not configured. Admin API token is required.' });
    }

    const token = decryptToken(store.adminApiToken);

    const verifiedItems = await shopify.verifyPrices(store.shopifyUrl, token, items);

    let subtotal = 0;
    for (const item of verifiedItems) {
      subtotal += parseFloat(item.price) * item.quantity;
    }

    let discount = 0;
    if (coupon) {
      const couponResult = await shopify.validateCoupon(store.shopifyUrl, token, coupon);
      if (couponResult.valid) {
        if (couponResult.type === 'percentage') {
          discount = subtotal * (Math.abs(parseFloat(couponResult.value)) / 100);
        } else {
          discount = Math.abs(parseFloat(couponResult.value));
        }
      }
    }

    const total = Math.max(0, subtotal - discount);

    const order = await prisma.order.create({
      data: {
        storeId: store.id,
        customerPhone: contact.phone,
        customerEmail: contact.email || null,
        customerName: contact.name || null,
        address,
        items: verifiedItems,
        subtotal,
        discount,
        total,
        couponCode: coupon || null,
        paymentMethod: paymentMethod || 'upi'
      }
    });

    if (paymentMethod === 'cod') {
      const shopifyOrder = await shopify.createOrder(store.shopifyUrl, token, {
        order,
        financialStatus: 'pending'
      });

      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'cod_confirmed',
          shopifyOrderId: String(shopifyOrder.id)
        }
      });

      return res.json({ success: true, orderId: order.id, status: 'cod_confirmed' });
    }

    const paymentData = await payglocal.initiatePayment({
      orderId: order.id,
      amount: total,
      customerPhone: contact.phone,
      customerEmail: contact.email,
      customerName: contact.name
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'processing', paymentId: paymentData.transactionId }
    });

    res.json({
      success: true,
      orderId: order.id,
      paymentUrl: paymentData.paymentUrl,
      transactionId: paymentData.transactionId
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

router.post('/callback', async (req, res) => {
  try {
    const isValid = payglocal.verifyCallback(req.body);
    if (!isValid) return res.status(400).json({ error: 'Invalid callback' });

    const { orderId, status, transactionId } = payglocal.parseCallback(req.body);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: true }
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (status === 'success') {
      if (order.store.adminApiToken) {
        const token = decryptToken(order.store.adminApiToken);
        const shopifyOrder = await shopify.createOrder(order.store.shopifyUrl, token, {
          order,
          financialStatus: 'paid'
        });

        await prisma.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: 'paid',
            paymentId: transactionId,
            shopifyOrderId: String(shopifyOrder.id)
          }
        });
      } else {
        await prisma.order.update({
          where: { id: orderId },
          data: { paymentStatus: 'paid', paymentId: transactionId }
        });
      }
    } else {
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'failed', paymentId: transactionId }
      });
    }

    res.redirect(`${process.env.WIDGET_CALLBACK_URL || '/'}?orderId=${orderId}&status=${status}`);
  } catch (err) {
    console.error('Payment callback error:', err);
    res.status(500).json({ error: 'Callback processing failed' });
  }
});

router.get('/order-status/:orderId', async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'Widget key required' });

    const store = await prisma.store.findUnique({ where: { widgetKey: key } });
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const order = await prisma.order.findFirst({
      where: { id: req.params.orderId, storeId: store.id },
      select: { id: true, paymentStatus: true, shopifyOrderId: true, total: true }
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
