# Checkout on the VPS — alag ghar, ShipTrack ko haath nahi

Ek script (`deploy/install.sh`) poora setup karti hai. ShipTrack jaisa chal raha hai waisa hi chalta rahega:
dono ka sirf server (machine) common hai, baaki sab alag.

| Cheez | ShipTrack (jaisa hai) | Checkout (naya, alag) |
|---|---|---|
| Linux user | root / apna | `checkout` (koi sudo power nahi) |
| Code | `/var/www/tracker` | `/srv/checkout/app` |
| Secrets | `/etc/tracker/.env` | `/etc/checkout/checkout.env` |
| Database | `tracking_crm` | `checkout` (apna user `checkout_app`, apna password) |
| Node / PM2 | ShipTrack wala | `checkout` user ka apna Node 20 aur apna PM2 |
| Port | 3000 | 5202, 5203, 5204 (sirf andar, 127.0.0.1) |
| nginx | ShipTrack ki files | sirf `/etc/nginx/sites-available/checkout.conf` |
| Domain | shiptrack.store | naya subdomain (neeche) |

Script yeh kabhi nahi karti: ShipTrack ki files, uska database, uska PM2, uski nginx file ya firewall ko chhoona.
Agar jo domain ya port aap do woh pehle se kisi aur app ka ho, to script **ruk jaati hai aur kuch nahi badalti**.

## Aapko kya karna hai (ek baar, ~15 minute)

### 1. Do subdomain chuno
- **Dashboard + checkout:** jaise `checkout.shiptrack.store`
- **Demo store** (sirf trial ke liye): jaise `demo-checkout.shiptrack.store`

(`cart.shiptrack.store` mat lena, woh purane app ka hai. Brand ka naam aane par domain badal sakte hain.)

### 2. Hostinger DNS mein dono ko VPS par point karo
Hostinger → Domains → shiptrack.store → **DNS / Nameservers** → **Add record**, dono ke liye:
- Type: **A**
- Name: `checkout` (doosre ke liye `demo-checkout`)
- Points to: **aapke VPS ka IP** (wahi jo ShipTrack ka hai)
- TTL: default

10-30 minute mein DNS chalu ho jaata hai.

### 3. VPS ka terminal kholo
Hostinger → VPS → **Browser terminal** (ya Mac Terminal se `ssh root@<VPS IP>`). Phir yeh do line chalao
(apne domain daal kar):

```bash
curl -fsSL https://raw.githubusercontent.com/AadityaAggarwal2007/checkout/claude/flexype-plan/deploy/install.sh -o /tmp/checkout-install.sh
sudo bash /tmp/checkout-install.sh --domain checkout.shiptrack.store --demo-domain demo-checkout.shiptrack.store
```

5-10 minute lagenge. Aakhir mein `== Done` aur links dikhenge.

- Agar likha aaye **"certbot is not installed"**: `sudo apt-get install -y certbot python3-certbot-nginx` chalao,
  phir upar wali doosri line dobara.
- Agar likha aaye **"HTTPS not set yet"**: DNS abhi chalu nahi hua. 20 minute baad doosri line dobara chalao.
- Script dobara chalana safe hai: settings, database aur demo login waise hi rehte hain.

### 4. Demo login dekho
```bash
sudo cat /etc/checkout/demo-login.txt
```
Isme dashboard ka email aur ek **naya random password** hai (local wala `local-password` VPS par kabhi nahi).

### 5. GitHub ko update ki chaabi do (ek baar) — phir har update Claude khud karega
Script ke aakhir mein **"For automatic updates from GitHub"** ke neeche do cheezein chhapi hongi.
GitHub → **checkout** repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
- Name `VPS_HOST`, value: jo IP chhapa hai
- Name `VPS_SSH_KEY`, value: `-----BEGIN OPENSSH PRIVATE KEY-----` se `-----END OPENSSH PRIVATE KEY-----` tak
  poora (dono lines samet)

Yeh key **sirf checkout ko update kar sakti hai**: VPS par na shell khulta hai, na root, na ShipTrack. Isko chat mein
kabhi mat bhejna; sirf GitHub Secrets mein. Dobara dekhni ho: `sudo cat /etc/checkout/deploy_key`.

### 6. Try karo
- **Demo store:** `https://demo-checkout.shiptrack.store` → product → Add to cart → Checkout
  (OTP page par peele box mein, payment = test gateway, asli paisa nahi).
- **Dashboard:** `https://checkout.shiptrack.store` → demo login.

## Baad mein

**Naya code aane par:** step 5 ho gaya ho to Claude GitHub ke "Deploy to VPS" se khud update kar dega. Haath se karna ho:
```bash
sudo bash /srv/checkout/app/deploy/update.sh
```
Sirf checkout ke apps restart hote hain. ShipTrack ko kuch nahi hota.

**Logs dekhne ho:**
```bash
sudo -u checkout -H bash -c '. ~/.nvm/nvm.sh && pm2 ls && pm2 logs --lines 50 --nostream'
```

**Live (asli) mode** — jab WhatsApp, PayU / PayGlocal aur Shopify app ki keys aa jayein: main live ke steps
alag se dunga (keys sirf VPS ki file mein jaati hain: `sudo nano /etc/checkout/checkout.env`, kabhi chat ya GitHub mein nahi).

**Sab hata dena ho** (ShipTrack ko chhede bina):
```bash
sudo -u checkout -H bash -c '. ~/.nvm/nvm.sh && pm2 delete all && pm2 save'
sudo rm -f /etc/nginx/sites-enabled/checkout.conf /etc/nginx/sites-available/checkout.conf && sudo nginx -s reload
sudo -u postgres psql -c 'DROP DATABASE checkout' -c 'DROP ROLE checkout_app'
sudo userdel -r checkout; sudo rm -rf /srv/checkout /etc/checkout
```

## Kya test hua hai
Script ek bilkul nayi Ubuntu 24.04 machine par chala kar dekhi gayi (ek doosri nginx site pehle se thi, woh
waisi hi rahi): user, Node, PM2, database, build, apps, nginx routing, HTTPS ke saath browser mein poora
order (demo store → OTP → address → UPI test gateway → order → dashboard), `update.sh`, aur deploy key (usse
`cat /etc/passwd` maanga to bhi sirf update chala; shell nahi khula).
Asli Hostinger VPS par pehli baar chalegi: koi line laal aaye to uska screenshot bhejna.
