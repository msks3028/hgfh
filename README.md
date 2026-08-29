# Lurnova — Firebase Authentication + PostgreSQL

هذه النسخة تعتمد على **Firebase Authentication لتسجيل الدخول فقط**، بينما تظل بيانات المنصة كلها في **PostgreSQL** عبر Backend Node/Express.

## المعمارية

```text
المتصفح
  ├── Firebase Authentication
  │     └── Google / Email + Password
  │
  └── Backend API
        └── PostgreSQL
```

- Firebase: تسجيل الدخول، إنشاء الحساب، تسجيل الخروج، واستعادة كلمة المرور.
- PostgreSQL: المستخدمون، الكورسات، الدروس، الاختبارات، الواجبات، النتائج، وباقي بيانات Lurnova.
- Backend: يتحقق من Firebase ID Token ثم ينشئ جلسة HttpOnly آمنة للـAPI.
- لا يوجد اعتماد على Google OAuth القديم الخاص بالـBackend.

## التشغيل المحلي

1. ثبّت الاعتمادات:
   ```powershell
   npm install
   cd server
   npm install
   cd ..
   ```

2. انسخ `server/.env.example` إلى `server/.env` وضع بيانات PostgreSQL و`JWT_SECRET` وFirebase API key.

3. شغّل:
   ```powershell
   npm run dev
   ```

4. افتح:
   ```text
   http://localhost:5173
   ```

الـVite proxy يمرر `/api` و`/uploads` إلى Backend على المنفذ 5000، لذلك حتى عند فتح الواجهة من هاتف على نفس الشبكة لا يتم إرسال طلبات API إلى `localhost` الخاص بالهاتف.

## Firebase

في Firebase Console:
- Authentication → Sign-in method → فعّل Google.
- فعّل Email/Password إذا أردت التسجيل بالبريد.
- Authentication → Settings → Authorized domains: أضف دومين الموقع المنشور، مثل `your-site.vercel.app`.

إعداد Firebase موجود في `src/lib/firebase.js`.

## النشر

### Frontend

عند نشر الواجهة على Vercel/Netlify أو أي استضافة Vite:

```text
VITE_API_URL=https://YOUR-BACKEND-DOMAIN
```

إذا كان الـFrontend والـBackend على نفس الدومين، اترك `VITE_API_URL` فارغًا واستخدم `/api` نسبيًا.

### Backend

في متغيرات بيئة الخادم:

```text
NODE_ENV=production
PORT=10000
HOST=0.0.0.0
DATABASE_URL=postgresql://...
DB_SSL=true
JWT_SECRET=غيّر_هذه_إلى_قيمة_عشوائية_قوية
FIREBASE_WEB_API_KEY=AIza...
FRONTEND_URL=https://YOUR-FRONTEND-DOMAIN
FRONTEND_URLS=https://YOUR-FRONTEND-DOMAIN
COOKIE_SAMESITE=none
```

`DATABASE_URL` يغني عن `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` عند استخدام PostgreSQL مُدار.

### مهم جدًا

لا ترفع `server/.env` إلى GitHub. الملف يحتوي أسرارًا، وهو مستثنى من Git بواسطة `.gitignore`.

إذا كانت بيانات `server/.env` القديمة قد رُفعت سابقًا إلى GitHub، غيّر **كلمة مرور PostgreSQL وJWT_SECRET وGoogle OAuth secret القديم** قبل النشر.

## Cloudflare Tunnel للاختبار فقط

يمكنك تشغيل:

```powershell
& "C:\Users\hassa\Downloads\cloudflared-windows-amd64.exe" tunnel --url http://127.0.0.1:5173
```

لكن الـTunnel مؤقت. بفضل Vite proxy، طلبات `/api` القادمة من رابط الـTunnel تُمرر إلى Backend المحلي بدل محاولة الاتصال بـ`localhost` على جهاز الزائر.

## فحص Backend

```text
http://localhost:5000/api/health
```

يجب أن يرجع JSON يحتوي على `ok: true`.
