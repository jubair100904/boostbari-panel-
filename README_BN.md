# BoostBari SMM Panel + Admin Dashboard (বাংলা)

এই সংস্করণে `/admin.html`-এ admin login, PostgreSQL database, order history, provider balance/services, admin থেকে provider order create, order status refresh এবং audit events আছে। GetmyFollow API Key শুধু server-side Environment Variable-এ থাকে।

## গুরুত্বপূর্ণ সীমা
- এটি **admin dashboard + provider order management**; এখনো customer signup/login, customer wallet/ledger, payment gateway, automatic refunds বা public customer order submission নেই। গ্রাহকের টাকা নেওয়া শুরু করার আগে এগুলো আলাদাভাবে তৈরি ও পরীক্ষা করতে হবে।
- Provider order তৈরি করলে বাস্তব Provider balance থেকে টাকা কাটতে পারে। Production-এ যাওয়ার আগে ছোট test order/Provider rules যাচাই করুন।
- Render Free web service ঘুমিয়ে যেতে পারে। Database-এর জন্য Render PostgreSQL plan/availability ও খরচ আপনার dashboard-এ যাচাই করুন; database free tier সব অ্যাকাউন্ট/সময়ে উপলব্ধ নাও হতে পারে।

## GitHub-এ আপডেট
1. Repository-র root-এ এই ZIP-এর **ভেতরের ফাইলগুলো** আপলোড/replace করুন: `server.js`, `package.json`, `.gitignore`, `README_BN.md` এবং `public/index.html`, `public/admin.html`। ZIP ফাইল নিজে root-এ রেখে দিলে সেটি deploy হয় না।
2. নিশ্চিত করুন `public` একটি **folder**, ফাইল নয়। এর ভেতরে `index.html` ও `admin.html` থাকবে। Root-এ `server.js` ও `package.json` থাকবে।
3. `server.js` বা `package.json`-এ কোনো API key লিখবেন না।

Expected structure:
```
server.js
package.json
README_BN.md
.gitignore
public/
  index.html
  admin.html
```

## Render PostgreSQL যুক্ত করা
1. Render Dashboard → New → PostgreSQL (বা Dashboard-এর Databases অংশ থেকে নতুন PostgreSQL তৈরি করুন)।
2. একই region বেছে নিন যেখানে Web Service আছে। Database-এর internal connection string/copy URL নিন।
3. Web Service → Environment → Add Environment Variable:
   - `DATABASE_URL` = Render PostgreSQL-এর **Internal Database URL** (web service ও database একই region হলে)
   - `GETMYFOLLOW_API_URL` = `https://my.getmyfollow.com/api/v2`
   - `GETMYFOLLOW_API_KEY` = GetmyFollow-এর আসল API key
   - `PANEL_ADMIN_PASSWORD` = দীর্ঘ, অনন্য পাসওয়ার্ড (কমপক্ষে 20 অক্ষর; অন্য কোথাও ব্যবহার করবেন না)
4. `Save, rebuild, and deploy` বা Render-এর সমতুল্য deploy action দিন। প্রথম চালুতে server নিজে টেবিল তৈরি করবে। DB connection error হলে database status, URL এবং একই region যাচাই করুন।

## অ্যাডমিন লগইন
- `https://YOUR-RENDER-DOMAIN/admin.html`
- `PANEL_ADMIN_PASSWORD`-এ যে পাসওয়ার্ড রেখেছেন সেটি ব্যবহার করুন।
- Login cookie HttpOnly, Secure, SameSite=Strict; session token database-এ hash করে রাখা হয়; session 8 ঘণ্টায় মেয়াদ শেষ হয়; login attempts rate-limited।
- `https://YOUR-RENDER-DOMAIN/api/health`-এ `databaseConfigured:true` এবং `providerConfigured:true` দেখুন। এগুলো configuration presence জানায়; provider auth সম্পূর্ণ প্রমাণ করে না।

## নিরাপত্তা ও অপারেশন
- API key, admin password, `DATABASE_URL` কাউকে পাঠাবেন না; স্ক্রিনশটে Value ঢেকে রাখুন।
- Repository Private রাখুন। Secrets কখনো repository-তে commit করবেন না।
- `admin.html` public URL-এ খোলা গেলেও API-র data/action server-side session ছাড়া চলবে না।
- Admin panel-এ provider order create করলে বাস্তব অর্ডার হয়। একবার submit করার পর error হলে Provider dashboard-এ order ID যাচাই না করে আবার submit করবেন না (duplicate order হতে পারে)।
- Production-এ নেওয়ার আগে backups, database retention, support/refund policy, customer auth/wallet/payment, legal/platform policy এবং order duplicate/idempotency handling তৈরি করুন।

## Local test
Node.js 20+ প্রয়োজন। `.env` ফাইল ব্যবহার করলে সেটি GitHub-এ commit করবেন না। `npm install` তারপর `npm start`; `DATABASE_URL`, `PANEL_ADMIN_PASSWORD` সেট করা বাধ্যতামূলক।
