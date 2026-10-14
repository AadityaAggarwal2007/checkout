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
| Domain | shiptrack.store | merchantbuild.in (+ demo.merchantbuild.in) |

Script yeh kabhi nahi karti: ShipTrack ki files, uska database, uska PM2, uski nginx file ya firewall ko chhoona.
Agar jo domain ya port aap do woh pehle se kisi aur app ka ho, to script **ruk jaati hai aur kuch nahi badalti**.

## Aapko kya karna hai (ek baar, ~15 minute)

### 1. Domain: merchantbuild.in (owner 2026-10-14)
- **Dashboard + checkout:** `merchantbuild.in`
- **Demo store** (sirf trial): `demo.merchantbuild.in`

Abhi merchantbuild.in par **Shopify Builder** chal raha hai. Script use **side** karti hai: sirf uski nginx
link hat-ti hai. Builder ka app (pm2 `builder`), code `/var/www/builder`, database `builder` aur
`/etc/builder` waise hi rehte hain, kuch delete nahi hota. Wapas laana ho:
`sudo bash /srv/checkout/app/deploy/restore-site.sh`.

### 2. Hostinger DNS mein `demo` jodo
`merchantbuild.in` pehle se VPS par point karta hai (Builder wahin hai). Sirf ek record jodna hai:
Hostinger → **Domains** → merchantbuild.in → **Manage** → **DNS / Nameservers** → form:
- Type **A**, Name **`demo`**, Points to: list mein `@` wali A line ka IP (wahi VPS), TTL waisa hi → **Add Record**

### 3. VPS ka terminal kholo
Hostinger → **VPS** → **Browser terminal**. Phir yeh do line:

```bash
curl -fsSL https://raw.githubusercontent.com/AadityaAggarwal2007/checkout/claude/flexype-plan/deploy/install.sh -o /tmp/checkout-install.sh
sudo bash /tmp/checkout-install.sh --domain merchantbuild.in --demo-domain demo.merchantbuild.in --replace-site builder
```

5-10 minute lagenge. Aakhir mein `== Done` aur links dikhenge.

- Agar likha aaye **"certbot is not installed"**: `sudo apt-get install -y certbot python3-certbot-nginx` chalao,
  phir upar wali doosri line dobara.
- Agar likha aaye **"HTTPS not set yet"**: `demo` ka DNS abhi chalu nahi hua. 20 minute baad doosri line dobara.
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
- **Demo store:** `https://demo.merchantbuild.in` → product → Add to cart → Checkout
  (OTP page par peele box mein, payment = test gateway, asli paisa nahi).
- **Dashboard:** `https://merchantbuild.in` → demo login.

## Baad mein

**Naya code aane par:** kuch nahi karna. Branch `claude/flexype-plan` par har push ke baad GitHub CI pehle saare
tests chalata hai; sab green ho to job **deploy** VPS par `deploy/update.sh` chala deta hai (logs: GitHub → Actions).
Test fail = deploy nahi. Haath se karna ho:
```bash
sudo bash /srv/checkout/app/deploy/update.sh
```
Sirf checkout ke apps restart hote hain. ShipTrack ko kuch nahi hota.

**Koi key daalni ho (Shopify, WhatsApp, …):** file kholo mat (screen par secrets dikhte hain). Yeh chalao, value
paste karo, kuch dikhega nahi:
```bash
sudo bash /srv/checkout/app/deploy/set-key.sh SHOPIFY_API_KEY
```
Saari keys ke baad: `sudo bash /srv/checkout/app/deploy/update.sh`.

**Secrets kahin dikh gaye (screenshot, chat)?** Naye bana do (sab ko dobara login karna padega):
```bash
sudo bash /srv/checkout/app/deploy/rotate-secrets.sh
```

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
