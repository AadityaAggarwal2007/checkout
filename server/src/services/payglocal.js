const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CompactEncrypt, CompactSign, importPKCS8, importSPKI } = require('jose');

const KEYS_DIR = path.join(__dirname, '../../keys');
const MID = process.env.PAYGLOCAL_MID;
const PRIVATE_KEY_ID = process.env.PAYGLOCAL_PRIVATE_KEY_ID;
const PUBLIC_KEY_ID = process.env.PAYGLOCAL_PUBLIC_KEY_ID;
const BASE_URL = process.env.PAYGLOCAL_ENV === 'production'
  ? 'https://api.payglocal.in'
  : 'https://api.uat.payglocal.in';
const CALLBACK_URL = process.env.PAYGLOCAL_CALLBACK_URL;
const TOKEN_EXPIRY_MS = 300000;

let _pgPublicKey = null;
let _merchantPrivateKey = null;

async function loadKeys() {
  if (_pgPublicKey && _merchantPrivateKey) return;

  const pubPath = path.join(KEYS_DIR, `${PUBLIC_KEY_ID}_payglocal_mid.pem`);
  const privPath = path.join(KEYS_DIR, `${PRIVATE_KEY_ID}_${MID}.pem`);

  const pubPem = fs.readFileSync(pubPath, 'utf8');
  const privPem = fs.readFileSync(privPath, 'utf8');

  _pgPublicKey = await importSPKI(pubPem, 'RSA-OAEP-256');
  _merchantPrivateKey = await importPKCS8(privPem, 'RS256');
}

async function generateJWE(payload) {
  await loadKeys();
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  return new CompactEncrypt(plaintext)
    .setProtectedHeader({
      alg: 'RSA-OAEP-256',
      enc: 'A128CBC-HS256',
      kid: PUBLIC_KEY_ID,
      'issued-by': MID,
      exp: TOKEN_EXPIRY_MS,
      iat: `${Date.now()}`
    })
    .encrypt(_pgPublicKey);
}

async function generateJWS(jweToken) {
  await loadKeys();
  const digest = crypto.createHash('sha256').update(jweToken).digest('base64');
  const digestObject = {
    digest,
    digestAlgorithm: 'SHA-256',
    exp: TOKEN_EXPIRY_MS,
    iat: `${Date.now()}`
  };
  return new CompactSign(
    new TextEncoder().encode(JSON.stringify(digestObject))
  )
    .setProtectedHeader({
      alg: 'RS256',
      kid: PRIVATE_KEY_ID,
      'x-gl-merchantId': MID,
      'issued-by': MID,
      'is-digested': 'true',
      'x-gl-enc': 'true'
    })
    .sign(_merchantPrivateKey);
}

async function initiatePayment({ orderId, amount, customerPhone, customerEmail, customerName }) {
  const axios = require('axios');

  const payload = {
    merchantTxnId: orderId,
    merchantUniqueId: orderId.replace(/-/g, '').slice(0, 40),
    paymentData: {
      totalAmount: amount.toFixed(2),
      txnCurrency: 'INR',
      billingData: {
        firstName: (customerName || 'Customer').split(' ')[0],
        lastName: (customerName || '').split(' ').slice(1).join(' ') || '.',
        emailId: customerEmail || 'noreply@checkout.local',
        phoneNumber: customerPhone,
        addressCountry: 'IN'
      }
    },
    merchantCallbackURL: CALLBACK_URL
  };

  const jwe = await generateJWE(payload);
  const jws = await generateJWS(jwe);

  const { data } = await axios.post(
    `${BASE_URL}/gl/v1/payments/initiate/paycollect`,
    jwe,
    {
      headers: {
        'Content-Type': 'text/plain',
        'x-gl-token-external': jws,
        'x-gl-merchantid': MID,
        'x-gl-kid': PRIVATE_KEY_ID
      }
    }
  );

  if (data.status === 'INPROGRESS' && data.data && data.data.redirectUrl) {
    return {
      paymentUrl: data.data.redirectUrl,
      transactionId: data.gid,
      statusUrl: data.data.statusUrl
    };
  }

  throw new Error(`PayGlocal initiate failed: ${data.message || JSON.stringify(data)}`);
}

function parseCallback(body) {
  const glToken = body['x-gl-token'];
  if (!glToken) throw new Error('Missing x-gl-token in callback');

  const parts = glToken.split('.');
  if (parts.length < 3) throw new Error('Invalid JWT in callback');

  const base64Payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const decoded = Buffer.from(base64Payload, 'base64').toString('utf-8');
  const data = JSON.parse(decoded);

  return {
    orderId: data.merchantTxnId,
    transactionId: data.gid,
    status: data.status === 'SENT_FOR_CAPTURE' ? 'success' : 'failed',
    paymentMethod: data.paymentMethod || 'unknown',
    amount: data.amount,
    raw: data
  };
}

function verifyCallback(body) {
  try {
    parseCallback(body);
    return true;
  } catch {
    return false;
  }
}

async function getTransactionStatus(gid) {
  const axios = require('axios');
  await loadKeys();

  const statusPayload = { gid };
  const jwe = await generateJWE(statusPayload);
  const jws = await generateJWS(jwe);

  const { data } = await axios.get(
    `${BASE_URL}/gl/v1/payments/${gid}/status`,
    {
      headers: {
        'x-gl-token-external': jws,
        'x-gl-merchantid': MID,
        'x-gl-kid': PRIVATE_KEY_ID
      }
    }
  );

  return data;
}

module.exports = { initiatePayment, verifyCallback, parseCallback, getTransactionStatus };
