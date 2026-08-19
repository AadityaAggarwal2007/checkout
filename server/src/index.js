require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/stores', require('./routes/stores'));
app.use('/api/stores', require('./routes/config'));
app.use('/api/stores', require('./routes/products'));
app.use('/api/stores', require('./routes/orders'));
app.use('/api/widget', require('./routes/widget-api'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/shopify', require('./routes/shopify-auth'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`ShopDrawer server running on port ${PORT}`);
});
