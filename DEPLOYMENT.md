# نشر Lurnova

## 1) Firebase Authentication

في Firebase Console:
- Authentication → Sign-in method → Google: Enable.
- Email/Password: Enable إذا كنت تريد التسجيل بالبريد.
- Authentication → Settings → Authorized domains: أضف دومين الـFrontend المنشور.

## 2) PostgreSQL

أنشئ قاعدة PostgreSQL مُدارة، ثم خذ `DATABASE_URL`.

في Backend:
```text
DATABASE_URL=postgresql://...
DB_SSL=true
```

## 3) Backend

شغّل مجلد `server` كخدمة Node:

```text
Build: npm install
Start: npm start
```

ومتغيرات البيئة:
```text
NODE_ENV=production
PORT=10000
HOST=0.0.0.0
DATABASE_URL=postgresql://...
DB_SSL=true
JWT_SECRET=<random-long-secret>
FIREBASE_WEB_API_KEY=<Firebase Web API key>
TEACHER_EMAIL=<teacher-email>
FRONTEND_URL=https://YOUR-FRONTEND-DOMAIN
FRONTEND_URLS=https://YOUR-FRONTEND-DOMAIN
COOKIE_SAMESITE=none
ALLOW_TRYCLOUDFLARE=false
```

بعد التشغيل اختبر:
```text
https://YOUR-BACKEND-DOMAIN/api/health
```

## 4) Frontend

في Vercel/Netlify أو استضافة Vite:
```text
VITE_API_URL=https://YOUR-BACKEND-DOMAIN
```

ثم:
```text
npm install
npm run build
```

ولـVercel يوجد `vercel.json` جاهز لمعالجة React Router.

## 5) النتيجة

Google Login:
```text
Frontend → Firebase Authentication → Firebase ID Token
         → Backend /api/auth/firebase → PostgreSQL
```

لا يوجد اعتماد على:
```text
localhost:5000
/api/auth/google
Google Client Secret
```

## ملاحظة عن الملفات

رفع الملفات الحالي يستخدم `server/uploads`. على استضافة تستخدم تخزينًا مؤقتًا/ephemeral لا تعتبر هذه الملفات تخزينًا دائمًا. إذا كان مطلوبًا تخزين فيديوهات وملفات بشكل دائم، انقل طبقة رفع الملفات لاحقًا إلى Object Storage مناسب، مع بقاء Firebase مسؤولًا عن تسجيل الدخول فقط.
