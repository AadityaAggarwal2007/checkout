const express = require('express');
const prisma = require('../db');
const { authenticate, storeAccess } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/:storeId/orders', storeAccess, async (req, res) => {
  try {
    const { page = 1, status, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { storeId: req.params.storeId };
    if (status) where.paymentStatus = status;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.order.count({ where })
    ]);

    res.json({
      orders,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:storeId/orders/:orderId', storeAccess, async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.orderId, storeId: req.params.storeId }
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
