const CryptoJS = require('crypto-js');

function encryptPayload(payload) {
  const key = CryptoJS.enc.Utf8.parse(process.env.SABPAISA_AUTH_KEY);
  const iv = CryptoJS.enc.Utf8.parse(process.env.SABPAISA_AUTH_IV);
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(payload), key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  return encrypted.toString();
}

function decryptPayload(encrypted) {
  const key = CryptoJS.enc.Utf8.parse(process.env.SABPAISA_AUTH_KEY);
  const iv = CryptoJS.enc.Utf8.parse(process.env.SABPAISA_AUTH_IV);
  const decrypted = CryptoJS.AES.decrypt(encrypted, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
}

async function initiatePayment({ orderId, amount, customerPhone, customerEmail, customerName }) {
  const payload = {
    clientCode: process.env.SABPAISA_CLIENT_CODE,
    transUserName: '',
    transUserPassword: '',
    payerName: customerName || 'Customer',
    payerEmail: customerEmail || '',
    payerMobile: customerPhone,
    clientTxnId: orderId,
    amount: amount.toFixed(2),
    amountType: 'INR',
    mcc: '',
    channelId: '',
    callbackUrl: process.env.SABPAISA_CALLBACK_URL
  };

  const encrypted = encryptPayload(payload);

  return {
    paymentUrl: `https://securepay.sabpaisa.in/SabPaisaInit?encData=${encodeURIComponent(encrypted)}&clientCode=${process.env.SABPAISA_CLIENT_CODE}`,
    transactionId: orderId
  };
}

function verifyCallback(body) {
  try {
    if (body.encData) {
      decryptPayload(body.encData);
      return true;
    }
    return !!body.clientTxnId;
  } catch {
    return false;
  }
}

function parseCallback(body) {
  let data = body;
  if (body.encData) {
    data = decryptPayload(body.encData);
  }

  return {
    orderId: data.clientTxnId,
    transactionId: data.sabpaisaTxnId || data.clientTxnId,
    status: data.status === 'SUCCESS' ? 'success' : 'failed',
    paymentMode: data.paymentMode || 'unknown'
  };
}

module.exports = { initiatePayment, verifyCallback, parseCallback };
