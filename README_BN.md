# BoostBari API Starter (বাংলা)

## কী আছে
- বাংলা responsive frontend
- `/api/services` থেকে GetmyFollow সার্ভিস তালিকা
- সার্ভার-সাইড API key; ব্রাউজারে key পাঠানো হয় না
- অ্যাডমিন পাসওয়ার্ডে সুরক্ষিত `/api/order` ও `/api/balance`
- API rate limit ও basic input validation

## ফ্রি Render-এ চালানোর ধাপ
1. ZIP extract করে GitHub-এ নতুন **private repository** তৈরি করে ফাইলগুলো upload করুন।
2. Render.com-এ sign up করে **New + Web Service** বেছে GitHub repository connect করুন।
3. Runtime Node, Build Command `npm install`, Start Command `npm start` দিন।
4. Environment Variables-এ যোগ করুন:
   - `GETMYFOLLOW_API_KEY` = GetmyFollow Account পেজের API key
   - `PANEL_ADMIN_PASSWORD` = দীর্ঘ, অনন্য পাসওয়ার্ড (কমপক্ষে 20 অক্ষরের random phrase)
   - `GETMYFOLLOW_API_URL` = `https://my.getmyfollow.com/api/v2` (ঐচ্ছিক)
5. Create Web Service চাপুন। Deploy শেষ হলে Render URL খুলুন।
6. `/api/health` খুলে `ok: true` দেখুন। `providerConfigured: true` হলে key environment variable-এ আছে; এটি key প্রকাশ করে না।
7. Service dropdown-এ সার্ভিস না এলে GetmyFollow API key, balance/account status, deploy logs পরীক্ষা করুন।

## গুরুত্বপূর্ণ নিরাপত্তা
- API key কখনো HTML, JavaScript, GitHub commit, screenshot বা chat-এ রাখবেন না।
- GetmyFollow API key শুধু Render-এর Environment Variables-এ রাখুন।
- এই starter-এ `/api/order` অ্যাডমিন পাসওয়ার্ড-সুরক্ষিত; এটা সাধারণ কাস্টমারদের জন্য production order flow নয়।
- পাবলিক কাস্টমার অর্ডার চালু করতে customer authentication, verified payment/credit ledger, order limits, audit logs, refund handling এবং anti-abuse protection তৈরি করতে হবে।
- API provider-এর Terms এবং প্রতিটি social platform-এর rules মেনে চলুন।
- Render free web service 15 মিনিট নিষ্ক্রিয় থাকলে sleep করে এবং জাগতে সময় নিতে পারে। এটি পরীক্ষার জন্য; ব্যবসার production reliability নয়।
- Provider API response-এর field provider অনুযায়ী বদলাতে পারে; আগে ছোট quantity-তে পরীক্ষামূলক অর্ডার দিন।
- HTTPS validation অন রাখুন। API key/secret logs-এ print করবেন না।

## Local test
Node.js 20+ ইনস্টল করে:
```bash
npm install
# macOS/Linux:
export GETMYFOLLOW_API_KEY='your-key'
export PANEL_ADMIN_PASSWORD='a-long-unique-secret-passphrase'
npm start
```
Windows PowerShell:
```powershell
$env:GETMYFOLLOW_API_KEY="your-key"
$env:PANEL_ADMIN_PASSWORD="a-long-unique-secret-passphrase"
npm start
```
তারপর `http://localhost:3000` খুলুন।

## বর্তমান সীমাবদ্ধতা
- পেমেন্ট গেটওয়ে, customer accounts, persistent database এবং admin dashboard নেই।
- API order শুধু admin password দিয়ে ব্যবহারযোগ্য।
- API key ভুল হলে সার্ভিস তালিকা লোড হবে না।
