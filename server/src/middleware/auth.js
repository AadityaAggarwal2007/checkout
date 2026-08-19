const jwt = require('jsonwebtoken');
const prisma = require('../db');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    req.user = { id: decoded.userId, email: decoded.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function storeAccess(req, res, next) {
  const storeId = req.params.storeId || req.params.id;
  if (!storeId) return next();

  prisma.storeUser.findUnique({
    where: { userId_storeId: { userId: req.user.id, storeId } }
  }).then(su => {
    if (!su) return res.status(403).json({ error: 'No access to this store' });
    req.storeRole = su.role;
    next();
  }).catch(() => res.status(500).json({ error: 'Server error' }));
}

module.exports = { authenticate, storeAccess };
