# Lurnova — Firebase Login فقط

تسجيل الدخول في Lurnova يتم من خلال **Firebase Authentication**. لا يستخدم زر تسجيل الدخول أي Google OAuth route من الـBackend.

## Firebase Console

من Firebase Console:

1. Authentication → Sign-in method.
2. فعّل **Google**.
3. فعّل **Email/Password** إذا أردت الدخول والتسجيل بالبريد.
4. Authentication → Settings → Authorized domains.
5. أضف دومين الموقع المنشور، مثل:
   ```text
   your-site.vercel.app
   ```

## كيف يعمل Google Login؟

```text
Login
  ↓
Firebase Google Popup
  ↓
Firebase User
  ↓
Firebase ID Token
  ↓
POST /api/auth/firebase
  ↓
PostgreSQL user + HttpOnly server session
  ↓
/teacher أو /student
```

لن يتم تحويل المستخدم إلى:

```text
localhost:5000
```

ولا إلى:

```text
/api/auth/google/callback
```

## Backend

يجب أن يحتوي `server/.env` على:

```text
FIREBASE_WEB_API_KEY=AIza...
JWT_SECRET=...
FRONTEND_URL=https://YOUR-FRONTEND-DOMAIN
FRONTEND_URLS=https://YOUR-FRONTEND-DOMAIN
COOKIE_SAMESITE=none
```

## التطوير المحلي

Vite يستخدم proxy:

```text
/api      → http://127.0.0.1:5000
/uploads  → http://127.0.0.1:5000
```

لذلك لا نكتب `http://localhost:5000` داخل كود الواجهة.

## ملاحظة أمنية

ملفات `.env` لا يجب رفعها إلى GitHub. إذا سبق نشر أسرار PostgreSQL أو JWT أو Google OAuth القديم، قم بتغييرها.
