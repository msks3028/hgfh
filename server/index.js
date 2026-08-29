require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const { createWriteStream } = require("fs");
const { Pool } = require("pg");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || "0.0.0.0";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://hgfh-zdwk.vercel.app";
const ALLOWED_ORIGINS = String(
  process.env.FRONTEND_URLS ||
    `${FRONTEND_URL},https://hgfh-two.vercel.app,http://localhost:5173`
)
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);
const ALLOW_VERCEL_PREVIEWS =
  String(process.env.ALLOW_VERCEL_PREVIEWS || "true").toLowerCase() === "true";
const ALLOW_TRYCLOUDFLARE =
  String(process.env.ALLOW_TRYCLOUDFLARE || "true").toLowerCase() === "true";

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalized = String(origin).replace(/\/$/, "");
  if (ALLOWED_ORIGINS.includes(normalized)) return true;
  // Vercel creates a new *.vercel.app hostname for preview deployments.
  // Allow only previews belonging to this project name, not arbitrary Vercel apps.
  if (
    ALLOW_VERCEL_PREVIEWS &&
    /^https:\/\/hgfh(?:-[a-z0-9-]+)*\.vercel\.app$/i.test(normalized)
  ) {
    return true;
  }
  if (
    ALLOW_TRYCLOUDFLARE &&
    /^https:\/\/[^.]+(?:-[^.]+)*\.trycloudflare\.com$/i.test(normalized)
  ) {
    return true;
  }
  return false;
}

function setCorsOrigin(res) {
  const origin = res.req?.headers?.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
}
const JWT_SECRET = process.env.JWT_SECRET;
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || "AIzaSyAUAl8zBcZTi_hC3JeGXcMoWXc3ew0A6Mc";
const TEACHER_EMAIL = (process.env.TEACHER_EMAIL || "mostafakareem978@gmail.com").trim().toLowerCase();
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, "uploads"));
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 2 * 1024 * 1024 * 1024);

if (!JWT_SECRET) throw new Error("JWT_SECRET is required in server/.env");
if (!process.env.DATABASE_URL && !process.env.DB_PASSWORD) throw new Error("Set DATABASE_URL or DB_PASSWORD for PostgreSQL.");

const dbSsl = String(process.env.DB_SSL || "").toLowerCase() === "true";
const pool = new Pool({
  ...(process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: dbSsl ? { rejectUnauthorized: false } : undefined,
      }
    : {
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || "lurnova",
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD,
        ssl: dbSsl ? { rejectUnauthorized: false } : undefined,
      }),
  max: Number(process.env.DB_POOL_MAX || 20),
  min: Number(process.env.DB_POOL_MIN || 2),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  query_timeout: 15000,
  application_name: "lurnova-api",
});

pool.on("error", (err) => console.error("PostgreSQL pool error:", err));


app.disable("x-powered-by");

/*
 * CORS
 * ----
 * Railway must answer the browser's OPTIONS preflight itself.
 * Do this explicitly instead of relying only on the cors package, because
 * Railway's edge/proxy can otherwise return a 405 before the browser sees
 * Access-Control-Allow-Origin.
 */
app.use((req, res, next) => {
  const origin = String(req.headers.origin || "").replace(/\/$/, "");

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, Accept"
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    res.setHeader("Vary", "Origin");
  }

  // Browser CORS preflight.
  if (req.method === "OPTIONS") {
    if (origin && !isAllowedOrigin(origin)) {
      return res.status(403).json({ ok: false, message: "CORS origin not allowed" });
    }
    return res.status(204).end();
  }

  next();
});

// Keep the package for normal CORS behavior on responses, but do not let it
// reject a valid preflight before our explicit middleware above.
app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  optionsSuccessStatus: 204,
}));

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Teacher/admin data must always be read fresh. Without this, a browser can
// reuse an older GET response after a course is created, making a saved course
// appear to disappear when the teacher navigates away and comes back.
app.use("/api", (req, res, next) => {
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
app.use("/uploads", express.static(UPLOAD_ROOT, {
  fallthrough: false,
  maxAge: "1h",
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
    setCorsOrigin(res);
  },
}));

// Google profile images are sometimes unavailable when the browser requests the
// googleusercontent URL directly. Proxy only Google's image hosts through the
// backend so avatars/logos remain visible without exposing a generic SSRF proxy.
app.get("/api/media/proxy", async (req, res) => {
  try {
    const raw = String(req.query?.url || "").trim();
    if (!raw) return res.status(400).send("Missing image URL");
    const target = new URL(raw);
    const host = target.hostname.toLowerCase();
    const allowed =
      host === "googleusercontent.com" ||
      host.endsWith(".googleusercontent.com") ||
      host === "gstatic.com" ||
      host.endsWith(".gstatic.com");
    if (target.protocol !== "https:" || !allowed) {
      return res.status(400).send("Unsupported image host");
    }

    const upstream = await fetch(target, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 Lurnova/1.0",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });
    if (!upstream.ok || !upstream.body) {
      return res.status(404).send("Image unavailable");
    }
    const contentType = String(upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) return res.status(415).send("Not an image");
    res.status(200);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    setCorsOrigin(res);
    await pipeline(upstream.body, res);
  } catch (err) {
    console.error("Image proxy:", err?.message || err);
    if (!res.headersSent) res.status(502).send("تعذر تحميل الصورة");
  }
});

const nowFields = (legacy = false) => legacy
  ? "created_at, updated_at"
  : "created_date, updated_date";

function safeReturnTo(value) {
  if (!value || typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}

function sessionCookieOptions() {
  const sameSite = String(
    process.env.COOKIE_SAMESITE || (process.env.NODE_ENV === "production" ? "none" : "lax")
  ).toLowerCase();

  return {
    httpOnly: true,
    sameSite: ["lax", "strict", "none"].includes(sameSite) ? sameSite : "lax",
    secure: process.env.NODE_ENV === "production" || sameSite === "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

function signSession(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}

async function getUserFromRequest(req) {
  const token = req.cookies?.lurnova_session;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query(
      `SELECT id,email,full_name,photo_url,role,grade,provider,google_sub,created_at,updated_at
       FROM users WHERE id=$1 LIMIT 1`,
      [payload.sub]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ ok: false, message: "يجب تسجيل الدخول أولًا" });
    req.user = user;
    next();
  } catch (err) {
    console.error("Auth middleware:", err);
    res.status(500).json({ ok: false, message: "تعذر التحقق من جلسة الدخول" });
  }
}

async function requireTeacher(req, res, next) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ ok: false, message: "يجب تسجيل الدخول أولًا" });
    if (user.role !== "TEACHER") return res.status(403).json({ ok: false, message: "ليس لديك صلاحية الوصول إلى لوحة المدرس" });
    req.user = user;
    next();
  } catch (err) {
    console.error("Teacher middleware:", err);
    res.status(500).json({ ok: false, message: "تعذر التحقق من صلاحيات المدرس" });
  }
}

function routeError(res, err, label) {
  console.error(label, err?.stack || err);
  if (err?.code === "23505") return res.status(409).json({ ok: false, message: "العنصر موجود بالفعل" });
  if (err?.code === "23503") return res.status(400).json({ ok: false, message: "العنصر المرتبط غير موجود" });
  if (err?.code === "22P02") return res.status(400).json({ ok: false, message: "المعرّف غير صالح" });
  if (err?.code === "23514") return res.status(400).json({ ok: false, message: "قيمة غير مسموحة" });
  const payload = { ok: false, message: "حدث خطأ في الخادم" };
  // Local development only: expose the PostgreSQL reason so a bad/old schema
  // can be diagnosed immediately from the browser instead of showing a generic 500.
  if (process.env.NODE_ENV !== "production") {
    payload.details = err?.message || String(err);
    payload.code = err?.code || null;
  }
  res.status(500).json(payload);
}

function uploadFolderName(value) {
  const raw = String(value || "teacher-files").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const safe = raw.replace(/[^a-zA-Z0-9_\/-]/g, "-").replace(/\/{2,}/g, "/");
  return safe || "teacher-files";
}

function removeUploadedFileFromUrl(value) {
  try {
    const url = new URL(String(value || ""), "http://localhost");
    if (!url.pathname.startsWith("/uploads/")) return;
    const relative = decodeURIComponent(url.pathname.slice("/uploads/".length));
    const target = path.resolve(UPLOAD_ROOT, relative);
    const root = path.resolve(UPLOAD_ROOT);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) return;
    fs.unlink(target, () => {});
  } catch {}
}

async function ensureSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_sub TEXT UNIQUE,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL DEFAULT '',
      photo_url TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('STUDENT','TEACHER')),
      grade TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT 'google',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS courses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', target_grade TEXT NOT NULL DEFAULT '',
      cover_image TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS course_sections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE, section_id UUID REFERENCES course_sections(id) ON DELETE SET NULL,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', video_url TEXT NOT NULL DEFAULT '', thumbnail TEXT NOT NULL DEFAULT '',
      target_grade TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
      sort_order INTEGER NOT NULL DEFAULT 0, duration INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE, progress NUMERIC(5,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(student_id,course_id)
    );

    CREATE TABLE IF NOT EXISTS lesson_views (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE, completion_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
      watch_duration INTEGER NOT NULL DEFAULT 0, last_watched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(student_id,lesson_id)
    );

    CREATE TABLE IF NOT EXISTS materials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id UUID REFERENCES courses(id) ON DELETE SET NULL, name TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '', file_url TEXT NOT NULL DEFAULT '', file_name TEXT NOT NULL DEFAULT '',
      file_type TEXT NOT NULL DEFAULT '', target_grade TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
      download_permission TEXT NOT NULL DEFAULT 'public' CHECK(download_permission IN ('public','enrolled')), size_bytes BIGINT NOT NULL DEFAULT 0,
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS material_downloads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), student_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
      file_id UUID REFERENCES materials(id) ON DELETE CASCADE, material_id UUID REFERENCES materials(id) ON DELETE CASCADE,
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS exams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id UUID REFERENCES courses(id) ON DELETE SET NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      target_grade TEXT NOT NULL DEFAULT '', duration INTEGER NOT NULL DEFAULT 30,
      passing_score NUMERIC(5,2) NOT NULL DEFAULT 50, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
      exam_mode TEXT NOT NULL DEFAULT 'manual', pdf_url TEXT NOT NULL DEFAULT '', pdf_name TEXT NOT NULL DEFAULT '',
      questions JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS exam_questions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, question_text TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'multiple_choice', options JSONB NOT NULL DEFAULT '[]'::jsonb,
      correct_answer TEXT NOT NULL DEFAULT '', points NUMERIC(8,2) NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0,
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS exam_attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
      exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE, student_name TEXT NOT NULL DEFAULT '',
      answers JSONB NOT NULL DEFAULT '{}'::jsonb, score NUMERIC(8,2), possible NUMERIC(8,2), earned NUMERIC(8,2),
      passed BOOLEAN, status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','pending_grading','submitted','graded')),
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), submitted_at TIMESTAMPTZ, graded_at TIMESTAMPTZ,
      teacher_note TEXT NOT NULL DEFAULT '', graded_by TEXT, submitted_reason TEXT NOT NULL DEFAULT '',
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id UUID REFERENCES courses(id) ON DELETE SET NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      target_grade TEXT NOT NULL DEFAULT '', attachment_url TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
      due_date TIMESTAMPTZ, deadline TIMESTAMPTZ, max_score NUMERIC(8,2) NOT NULL DEFAULT 100,
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS assignment_submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      course_id UUID REFERENCES courses(id) ON DELETE SET NULL, file_url TEXT NOT NULL DEFAULT '', text_answer TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','graded')), score NUMERIC(8,2), grade NUMERIC(8,2),
      feedback TEXT NOT NULL DEFAULT '', submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id UUID REFERENCES courses(id) ON DELETE SET NULL, title TEXT NOT NULL, message TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
      target_grade TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published')),
      date TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS teacher_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), teacher_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      slug TEXT NOT NULL UNIQUE, page_title TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '', specialization TEXT NOT NULL DEFAULT '',
      logo TEXT NOT NULL DEFAULT '', cover_image TEXT NOT NULL DEFAULT '', profile_image TEXT NOT NULL DEFAULT '',
      theme_color TEXT NOT NULL DEFAULT '#263b49', accent_color TEXT NOT NULL DEFAULT '#5b66cf',
      social_links JSONB NOT NULL DEFAULT '{}'::jsonb, section_order JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS teacher_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slug TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(teacher_id,slug)
    );

    CREATE TABLE IF NOT EXISTS teacher_evaluations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, student_name TEXT NOT NULL DEFAULT '',
      rating INTEGER NOT NULL DEFAULT 5 CHECK(rating BETWEEN 1 AND 5), score NUMERIC(5,2), level TEXT NOT NULL DEFAULT 'ممتاز',
      note TEXT NOT NULL DEFAULT '', created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(teacher_id,student_id)
    );

    CREATE TABLE IF NOT EXISTS problem_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      teacher_id TEXT REFERENCES users(id) ON DELETE SET NULL, title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open', created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Compatibility migration for databases created by older Lurnova builds.
    -- The old builds used created_date/updated_date on some tables while this
    -- build uses created_at/updated_at. Add the newer columns when necessary
    -- and copy existing timestamps so saved courses/lessons never disappear.
    DO $$
    DECLARE t TEXT;
    BEGIN
      FOREACH t IN ARRAY ARRAY['users','courses','course_sections','lessons','enrollments','lesson_views'] LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ', t);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ', t);

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='created_date') THEN
          EXECUTE format('UPDATE %I SET created_at=COALESCE(created_at,created_date,NOW()) WHERE created_at IS NULL', t);
        ELSE
          EXECUTE format('UPDATE %I SET created_at=COALESCE(created_at,NOW()) WHERE created_at IS NULL', t);
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='updated_date') THEN
          EXECUTE format('UPDATE %I SET updated_at=COALESCE(updated_at,updated_date,created_at,NOW()) WHERE updated_at IS NULL', t);
        ELSE
          EXECUTE format('UPDATE %I SET updated_at=COALESCE(updated_at,created_at,NOW()) WHERE updated_at IS NULL', t);
        END IF;

        EXECUTE format('ALTER TABLE %I ALTER COLUMN created_at SET DEFAULT NOW()', t);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN updated_at SET DEFAULT NOW()', t);
      END LOOP;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_courses_teacher_status ON courses(teacher_id,status);
    CREATE INDEX IF NOT EXISTS idx_courses_updated ON courses(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sections_course_order ON course_sections(course_id,sort_order);
    CREATE INDEX IF NOT EXISTS idx_lessons_teacher ON lessons(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_lessons_course_order ON lessons(course_id,sort_order);
    CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
    CREATE INDEX IF NOT EXISTS idx_views_teacher_time ON lesson_views(teacher_id,last_watched_at DESC);
    CREATE INDEX IF NOT EXISTS idx_views_student ON lesson_views(student_id);
    CREATE INDEX IF NOT EXISTS idx_materials_teacher ON materials(teacher_id,updated_date DESC);
    CREATE INDEX IF NOT EXISTS idx_material_downloads_teacher ON material_downloads(teacher_id,created_date DESC);
    CREATE INDEX IF NOT EXISTS idx_exams_teacher ON exams(teacher_id,updated_date DESC);
    CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON exam_questions(exam_id,sort_order);
    CREATE INDEX IF NOT EXISTS idx_exam_attempts_teacher ON exam_attempts(teacher_id,updated_date DESC);
    CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam ON exam_attempts(exam_id,updated_date DESC);
    CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(teacher_id,updated_date DESC);
    CREATE INDEX IF NOT EXISTS idx_assignment_sub_teacher ON assignment_submissions(teacher_id,updated_date DESC);
    CREATE INDEX IF NOT EXISTS idx_announcements_teacher ON announcements(teacher_id,updated_date DESC);
    CREATE INDEX IF NOT EXISTS idx_teacher_evaluations_teacher ON teacher_evaluations(teacher_id,updated_date DESC);
  `);
}

/* ---------------- Authentication ---------------- */
app.get("/api/health", async (req,res) => {
  try {
    const { rows } = await pool.query("SELECT NOW() AS time");
    res.json({ ok:true, message:"Lurnova Backend يعمل بنجاح", database:"PostgreSQL", time:rows[0].time });
  } catch(err) { routeError(res,err,"Health:"); }
});

app.post("/api/auth/firebase", async (req,res) => {
  try {
    const idToken = String(req.body?.idToken || "").trim();
    if (!idToken) return res.status(400).json({ ok:false, message:"رمز Firebase غير موجود." });

    const verifyResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const verifyData = await verifyResponse.json().catch(() => ({}));
    if (!verifyResponse.ok || !Array.isArray(verifyData.users) || !verifyData.users[0]?.localId) {
      console.error("Firebase token verification failed:", verifyData?.error?.message || verifyResponse.status);
      return res.status(401).json({ ok:false, message:"جلسة Google غير صالحة أو منتهية. سجّل الدخول مرة أخرى." });
    }

    const firebaseUser = verifyData.users[0];
    const email = String(firebaseUser.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ ok:false, message:"حساب Firebase لا يحتوي على بريد إلكتروني." });

    const role = email === TEACHER_EMAIL ? "TEACHER" : "STUDENT";
    const id = `firebase_${firebaseUser.localId}`;
    const displayName = String(firebaseUser.displayName || email.split("@")[0] || "طالب");
    const photoUrl = String(firebaseUser.photoUrl || "");

    const { rows } = await pool.query(
      `INSERT INTO users(id,email,full_name,photo_url,role,provider,updated_at)
       VALUES($1,$2,$3,$4,$5,'firebase',NOW())
       ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name,photo_url=EXCLUDED.photo_url,role=EXCLUDED.role,provider='firebase',updated_at=NOW()
       RETURNING id,email,full_name,photo_url,role,grade,provider`,
      [id,email,displayName,photoUrl,role]
    );

    res.cookie("lurnova_session", signSession(rows[0]), sessionCookieOptions());
    res.json({ ok:true, user:{
      id:rows[0].id, uid:rows[0].id, email:rows[0].email, full_name:rows[0].full_name,
      photoURL:rows[0].photo_url, role:rows[0].role, grade:rows[0].grade || "", provider:rows[0].provider
    }});
  } catch(err) {
    console.error("Firebase session:", err);
    res.status(500).json({ ok:false, message:"تعذر إنشاء جلسة تسجيل الدخول. تأكد أن Backend يعمل واتصال الإنترنت متاح." });
  }
});

app.get("/api/auth/me", requireAuth, (req,res) => {
  const u=req.user;
  res.json({authenticated:true,user:{id:u.id,uid:u.id,email:u.email,full_name:u.full_name,photoURL:u.photo_url,role:u.role,grade:u.grade||"",provider:u.provider}});
});

app.patch("/api/auth/me", requireAuth, async (req,res) => {
  try {
    const name = req.body?.full_name;
    if (name !== undefined && !String(name).trim()) return res.status(400).json({ok:false,message:"الاسم مطلوب"});
    const photo = req.body?.photoURL;
    const grade = req.body?.grade;
    if (grade !== undefined && !String(grade).trim()) return res.status(400).json({ok:false,message:"الصف الدراسي مطلوب"});
    const allowedGrades = [
      "الصف الأول الابتدائي","الصف الثاني الابتدائي","الصف الثالث الابتدائي",
      "الصف الرابع الابتدائي","الصف الخامس الابتدائي","الصف السادس الابتدائي",
      "الصف الأول الإعدادي","الصف الثاني الإعدادي","الصف الثالث الإعدادي",
      "الصف الأول الثانوي","الصف الثاني الثانوي","الصف الثالث الثانوي"
    ];
    if (grade !== undefined && !allowedGrades.includes(String(grade).trim())) {
      return res.status(400).json({ok:false,message:"الصف الدراسي غير صالح"});
    }
    const { rows } = await pool.query(
      `UPDATE users SET full_name=COALESCE($1,full_name),photo_url=COALESCE($2,photo_url),
       grade=COALESCE($3,grade),updated_at=NOW() WHERE id=$4
       RETURNING id,email,full_name,photo_url,role,grade,provider`,
      [
        name===undefined?null:String(name).trim(),
        photo===undefined?null:String(photo),
        grade===undefined?null:String(grade).trim(),
        req.user.id
      ]
    );
    res.json({ok:true,user:{id:rows[0].id,uid:rows[0].id,email:rows[0].email,full_name:rows[0].full_name,photoURL:rows[0].photo_url,role:rows[0].role,grade:rows[0].grade||"",provider:rows[0].provider}});
  } catch(err) { routeError(res,err,"Update profile:"); }
});

app.post("/api/auth/logout",(req,res)=>{res.clearCookie("lurnova_session",{...sessionCookieOptions(),maxAge:undefined});res.json({ok:true});});

/* ---------------- Teacher dashboard ---------------- */
app.get("/api/teacher/dashboard",requireTeacher,async(req,res)=>{
  try {
    const id=req.user.id;
    const [stats,courses,activity]=await Promise.all([
      pool.query(`SELECT
        (SELECT COUNT(DISTINCT e.student_id) FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE c.teacher_id=$1)::int total_students,
        (SELECT COUNT(*) FROM courses WHERE teacher_id=$1)::int total_courses,
        (SELECT COUNT(*) FROM lessons WHERE teacher_id=$1)::int total_lessons,
        (SELECT COUNT(*) FROM lessons WHERE teacher_id=$1 AND video_url<>'')::int total_videos,
        (SELECT COUNT(*) FROM materials WHERE teacher_id=$1)::int total_files,
        (SELECT COUNT(*) FROM exams WHERE teacher_id=$1)::int total_exams,
        (SELECT COUNT(*) FROM assignments WHERE teacher_id=$1)::int total_assignments,
        (SELECT COUNT(*) FROM lesson_views WHERE teacher_id=$1)::int video_views,
        (SELECT COUNT(*) FROM lesson_views WHERE teacher_id=$1 AND completion_percentage>=90)::int completed_views,
        COALESCE((SELECT ROUND(AVG(completion_percentage)::numeric,2) FROM lesson_views WHERE teacher_id=$1),0) average_completion,
        (SELECT COUNT(*) FROM material_downloads WHERE teacher_id=$1)::int file_downloads`,[id]),
      pool.query(`SELECT c.id,c.title,c.description,c.target_grade,c.cover_image,c.status,c.created_at,c.updated_at,
        COUNT(DISTINCT e.student_id)::int students_count,COUNT(DISTINCT l.id)::int lessons_count
        FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id LEFT JOIN lessons l ON l.course_id=c.id
        WHERE c.teacher_id=$1 GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 6`,[id]),
      pool.query(`SELECT * FROM (
        SELECT lv.id,'lesson_view' type,u.full_name student_name,l.title,l.title AS course_title,lv.completion_percentage,lv.last_watched_at created_at
        FROM lesson_views lv JOIN users u ON u.id=lv.student_id JOIN lessons l ON l.id=lv.lesson_id WHERE lv.teacher_id=$1
        UNION ALL
        SELECT ea.id,'exam_attempt' type,u.full_name student_name,e.title,e.title course_title,ea.score completion_percentage,ea.updated_date created_at
        FROM exam_attempts ea JOIN users u ON u.id=ea.student_id JOIN exams e ON e.id=ea.exam_id WHERE ea.teacher_id=$1
        UNION ALL
        SELECT s.id,'assignment_submission' type,u.full_name student_name,a.title,a.title course_title,s.score completion_percentage,s.updated_date created_at
        FROM assignment_submissions s JOIN users u ON u.id=s.student_id JOIN assignments a ON a.id=s.assignment_id WHERE s.teacher_id=$1
        UNION ALL
        SELECT md.id,'material_download' type,u.full_name student_name,m.name title,m.name course_title,NULL completion_percentage,md.created_date
        FROM material_downloads md JOIN users u ON u.id=md.student_id JOIN materials m ON m.id=md.material_id WHERE md.teacher_id=$1
      ) x ORDER BY created_at DESC LIMIT 20`,[id])
    ]);
    const s=stats.rows[0];
    res.json({ok:true,teacher:{id:req.user.id,name:req.user.full_name,email:req.user.email,photoURL:req.user.photo_url,role:req.user.role},stats:Object.fromEntries(Object.entries(s).map(([k,v])=>[k,Number(v)||0])),courses:courses.rows.map(c=>({...c,created_date:c.created_at,updated_date:c.updated_at,students_count:Number(c.students_count),lessons_count:Number(c.lessons_count)})),activity:activity.rows.map(a=>({...a,completion_percentage:a.completion_percentage==null?0:Number(a.completion_percentage)}))});
  } catch(err) { routeError(res,err,"Teacher dashboard:"); }
});

/* ---------------- Global platform branding ---------------- */
app.get("/api/branding", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT tp.*, u.full_name AS teacher_name, u.photo_url AS teacher_photo
      FROM teacher_profiles tp
      JOIN users u ON u.id = tp.teacher_id
      ORDER BY tp.updated_date DESC
      LIMIT 1
    `);
    if (!rows[0]) {
      return res.json({ ok: true, settings: { page_title: "مدرستي", logo: "", theme_color: "#263b49", accent_color: "#5b66cf", social_links: {}, updated_date: null } });
    }
    res.json({ ok: true, settings: normalizeRow("TeacherProfile", rows[0]) });
  } catch (err) {
    routeError(res, err, "Branding:");
  }
});

/* ---------------- Server file uploads ---------------- */
app.put("/api/uploads", requireAuth, async (req, res) => {
  const folder = uploadFolderName(req.query?.folder);
  const isStudentSubmission = folder === "student-submissions" || folder.startsWith("student-submissions/");
  if (!isStudentSubmission && req.user.role !== "TEACHER") {
    return res.status(403).json({ ok: false, message: "رفع هذا النوع من الملفات متاح للمدرس فقط." });
  }

  const contentType = String(req.headers["content-type"] || "application/octet-stream").split(";")[0].trim().toLowerCase();
  const originalName = String(req.query?.name || "file").trim();
  const safeName = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "file";
  const isImage = contentType.startsWith("image/");
  const isExam = folder.includes("exam");
  const declaredLength = Number(req.headers["content-length"] || 0);

  if (declaredLength > MAX_UPLOAD_BYTES) {
    return res.status(413).json({ ok: false, message: "حجم الملف أكبر من الحد المسموح به." });
  }
  if (isImage && declaredLength > 15 * 1024 * 1024) {
    return res.status(413).json({ ok: false, message: "حجم الصورة يجب ألا يتجاوز 15 ميجابايت." });
  }
  if (isExam && contentType !== "application/pdf") {
    return res.status(400).json({ ok: false, message: "ملف الاختبار يجب أن يكون PDF." });
  }

  const prefix = isStudentSubmission ? "student-submissions" : (folder.split("/")[0] || "teacher-files");
  const ownerDir = path.join(UPLOAD_ROOT, prefix, String(req.user.id).replace(/[^a-zA-Z0-9_-]/g, "_"));
  fs.mkdirSync(ownerDir, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const filePath = path.join(ownerDir, filename);

  let received = 0;
  let tooLarge = false;
  const onData = (chunk) => {
    received += chunk.length;
    const limit = isImage ? 15 * 1024 * 1024 : MAX_UPLOAD_BYTES;
    if (received > limit && !tooLarge) {
      tooLarge = true;
      req.destroy(new Error("UPLOAD_TOO_LARGE"));
    }
  };
  req.on("data", onData);

  try {
    await pipeline(req, createWriteStream(filePath, { flags: "wx" }));
    if (tooLarge || received > (isImage ? 15 * 1024 * 1024 : MAX_UPLOAD_BYTES)) {
      throw Object.assign(new Error("UPLOAD_TOO_LARGE"), { code: "LIMIT_FILE_SIZE" });
    }

    const relativeName = `${prefix}/${req.user.id}/${filename}`;
    const url = `${req.protocol}://${req.get("host")}/uploads/${relativeName.split("/").map(encodeURIComponent).join("/")}`;
    return res.status(201).json({
      ok: true,
      file: {
        file_url: url,
        path: relativeName,
        file_id: filename,
        name: originalName,
        size: received,
        type: contentType,
        provider: "server-storage",
      },
    });
  } catch (error) {
    fs.unlink(filePath, () => {});
    if (error?.code === "LIMIT_FILE_SIZE" || error?.message === "UPLOAD_TOO_LARGE") {
      return res.status(413).json({ ok: false, message: "حجم الملف أكبر من الحد المسموح به." });
    }
    if (req.destroyed && !res.headersSent) {
      return res.status(400).json({ ok: false, message: "انقطع رفع الملف قبل اكتماله." });
    }
    console.error("Upload error:", error);
    return res.status(500).json({ ok: false, message: "تعذر حفظ الملف على الخادم." });
  } finally {
    req.off("data", onData);
  }
});

/* ---------------- Entity layer used by React pages ---------------- */
const ENTITY = {
  User:{table:"users",id:"id",legacy:true,columns:["id","email","full_name","photo_url","role","grade","provider","google_sub","created_at","updated_at"], teacherRead:true},
  Course:{table:"courses",id:"id",legacy:true,teacher:true,columns:["title","description","target_grade","cover_image","status"]},
  CourseSection:{table:"course_sections",id:"id",legacy:true,teacherVia:"course_id",columns:["course_id","title","description","sort_order"]},
  Lesson:{table:"lessons",id:"id",legacy:true,teacher:true,columns:["course_id","section_id","title","description","video_url","thumbnail","target_grade","status","sort_order","duration"]},
  Enrollment:{table:"enrollments",id:"id",legacy:true,columns:["student_id","course_id","progress"]},
  LessonView:{table:"lesson_views",id:"id",legacy:true,columns:["student_id","teacher_id","course_id","lesson_id","completion_percentage","watch_duration","last_watched_at"]},
  Material:{table:"materials",id:"id",teacher:true,columns:["course_id","name","title","description","file_url","file_name","file_type","target_grade","status","download_permission","size_bytes"]},
  MaterialDownload:{table:"material_downloads",id:"id",columns:["student_id","teacher_id","course_id","file_id","material_id"]},
  Exam:{table:"exams",id:"id",teacher:true,columns:["course_id","title","description","target_grade","duration","passing_score","status","exam_mode","pdf_url","pdf_name","questions"]},
  ExamQuestion:{table:"exam_questions",id:"id",teacherVia:"exam_id",columns:["exam_id","question_text","type","options","correct_answer","points","sort_order"]},
  ExamAttempt:{table:"exam_attempts",id:"id",columns:["student_id","teacher_id","course_id","exam_id","student_name","answers","score","possible","earned","passed","status","started_at","submitted_at","graded_at","teacher_note","graded_by","submitted_reason"]},
  Assignment:{table:"assignments",id:"id",teacher:true,columns:["course_id","title","description","target_grade","attachment_url","status","due_date","deadline","max_score"]},
  AssignmentSubmission:{table:"assignment_submissions",id:"id",columns:["student_id","teacher_id","assignment_id","course_id","file_url","text_answer","status","score","grade","feedback","submitted_at"]},
  Announcement:{table:"announcements",id:"id",teacher:true,columns:["course_id","title","message","content","target_grade","status","date"]},
  TeacherProfile:{table:"teacher_profiles",id:"id",teacher:true,uniqueTeacher:true,columns:["slug","page_title","bio","specialization","logo","cover_image","profile_image","theme_color","accent_color","social_links","section_order"]},
  TeacherLink:{table:"teacher_links",id:"id",teacher:true,columns:["slug","status"]},
  TeacherEvaluation:{table:"teacher_evaluations",id:"id",teacher:true,columns:["student_id","student_name","rating","score","level","note"]},
  ProblemReport:{table:"problem_reports",id:"id",teacher:true,columns:["title","description","status"]},
};

const aliases = {created_date:"created_at",updated_date:"updated_at",order:"sort_order"};
const externalAliases = {created_at:"created_date",updated_at:"updated_date",created_date:"created_date",updated_date:"updated_date",photo_url:"photoURL"};

// Existing Lurnova databases may have been created by an older build where
// some tables use created_date/updated_date while the newer PostgreSQL tables
// use created_at/updated_at. Never assume one timestamp naming scheme.
const tableColumnsCache = new Map();
async function getTableColumns(table) {
  if (tableColumnsCache.has(table)) return tableColumnsCache.get(table);
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    [table]
  );
  const set = new Set(rows.map(r => r.column_name));
  tableColumnsCache.set(table, set);
  return set;
}
async function timestampColumn(table, kind) {
  const columns = await getTableColumns(table);
  const candidates = kind === "created" ? ["created_at", "created_date"] : ["updated_at", "updated_date"];
  return candidates.find(c => columns.has(c)) || candidates[0];
}

const normalizeRow = (entity,row) => {
  const out={...row};
  if (entity.legacy) {
    out.created_date = row.created_at ?? row.created_date ?? null;
    out.updated_date = row.updated_at ?? row.updated_date ?? null;
  }
  if (entity==="User") out.photoURL=row.photo_url||"";
  if (entity==="Lesson") out.order=row.sort_order;
  if (entity==="CourseSection") out.order=row.sort_order;
  if (entity==="ExamQuestion") out.order=row.sort_order;
  if (entity==="Announcement") out.content=row.content||row.message||"";
  if (entity==="AssignmentSubmission") out.grade=row.grade ?? row.score ?? null;
  return out;
};
const dbValue=(key,value)=>{
  if (["course_id","section_id","assignment_id","exam_id","student_id","teacher_id","file_id","material_id"].includes(key) && (value === "" || value === null || value === undefined)) return null;
  if (["due_date","deadline","submitted_at","started_at","graded_at"].includes(key) && (value === "" || value === null || value === undefined)) return null;
  if (key==="social_links"||key==="section_order"||key==="questions"||key==="options"||key==="answers") return typeof value==="string" ? value : JSON.stringify(value ?? (key==="questions"||key==="options"?[]:{}));
  if (key==="photoURL") return value;
  return value;
};
function requestedSort(sort) {
  return String(sort || "-created_date").replace(/^-/i, "");
}
function cleanFilters(entity,q={}) {
  const config=ENTITY[entity];
  return Object.entries(q||{}).filter(([key,value])=>value!==""&&value!==null&&value!==undefined&&key!=="teacher_id").filter(([key])=>config.columns.includes(key) || key===config.id);
}
async function teacherOwnsEntity(client,entity,id,teacherId) {
  const c=ENTITY[entity];
  if (!c) return false;
  if (c.teacher) {
    const r=await client.query(`SELECT 1 FROM ${c.table} WHERE id=$1 AND teacher_id=$2 LIMIT 1`,[id,teacherId]);
    return !!r.rowCount;
  }
  if (c.teacherVia) {
    const r=await client.query(`SELECT 1 FROM ${c.table} x JOIN courses c ON c.id=x.course_id WHERE x.id=$1 AND c.teacher_id=$2 LIMIT 1`,[id,teacherId]);
    return !!r.rowCount;
  }
  if (entity==="ExamQuestion") {
    const r=await client.query(`SELECT 1 FROM exam_questions q JOIN exams e ON e.id=q.exam_id WHERE q.id=$1 AND e.teacher_id=$2 LIMIT 1`,[id,teacherId]);
    return !!r.rowCount;
  }
  if (entity==="AssignmentSubmission") {
    const r=await client.query(`SELECT 1 FROM assignment_submissions s WHERE s.id=$1 AND s.teacher_id=$2 LIMIT 1`,[id,teacherId]);
    return !!r.rowCount;
  }
  if (["LessonView","MaterialDownload","ExamAttempt"].includes(entity)) {
    const r=await client.query(`SELECT 1 FROM ${c.table} WHERE id=$1 AND teacher_id=$2 LIMIT 1`,[id,teacherId]);
    return !!r.rowCount;
  }
  if (entity==="TeacherEvaluation"||entity==="TeacherLink"||entity==="TeacherProfile") {
    const r=await client.query(`SELECT 1 FROM ${c.table} WHERE id=$1 AND teacher_id=$2 LIMIT 1`,[id,teacherId]);
    return !!r.rowCount;
  }
  return true;
}

app.get("/api/entities/:entity",requireAuth,async(req,res)=>{
  const entity=req.params.entity; const c=ENTITY[entity];
  if (!c) return res.status(404).json({ok:false,message:"Entity غير مدعومة"});
  try {
    const limit=Math.min(2000,Math.max(1,Number(req.query.limit||100)));
    const sort=String(req.query.sort||"-created_date"); const dir=sort.startsWith("-")?"DESC":"ASC";
    const requested=requestedSort(sort);
    let col = requested;
    if (requested === "created_date" || requested === "created_at") col = await timestampColumn(c.table, "created");
    else if (requested === "updated_date" || requested === "updated_at") col = await timestampColumn(c.table, "updated");
    else if (requested === "order") col = "sort_order";
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) return res.status(400).json({ok:false,message:"ترتيب غير صالح"});
    const tableColumns = await getTableColumns(c.table);
    if (!tableColumns.has(col)) return res.status(400).json({ok:false,message:`حقل الترتيب غير موجود: ${col}`});
    const filters=cleanFilters(entity,req.query);
    const values=[]; const where=[];
    if (entity==="User") {
      where.push(`role='STUDENT'`);
      if(req.user.role!=="TEACHER"){ values.push(req.user.id); where.push(`id=$${values.length}`); }
    }
    if (c.teacher && req.user.role==="TEACHER") { values.push(req.user.id); where.push(`teacher_id=$${values.length}`); }
    if (c.teacherVia && req.user.role==="TEACHER") { values.push(req.user.id); where.push(`c.teacher_id=$${values.length}`); }
    if (entity==="ExamQuestion" && req.user.role==="TEACHER") { values.push(req.user.id); where.push(`e.teacher_id=$${values.length}`); }
    if (["AssignmentSubmission","LessonView","MaterialDownload","ExamAttempt"].includes(entity)) {
      if(req.user.role==="TEACHER") { values.push(req.user.id); where.push(`x.teacher_id=$${values.length}`); }
      else { values.push(req.user.id); where.push(`x.student_id=$${values.length}`); }
    }
    if (entity==="Enrollment" && req.user.role!=="TEACHER") { values.push(req.user.id); where.push(`student_id=$${values.length}`); }
    if (entity==="TeacherProfile" && req.user.role==="TEACHER") { values.push(req.user.id); where.push(`teacher_id=$${values.length}`); }
    if (entity==="TeacherEvaluation" && req.user.role==="TEACHER") { values.push(req.user.id); where.push(`teacher_id=$${values.length}`); }
    if (entity==="TeacherLink" && req.user.role==="TEACHER") { values.push(req.user.id); where.push(`teacher_id=$${values.length}`); }
    if (req.user.role!=="TEACHER" && ["Course","Lesson","Material","Exam","Assignment","Announcement"].includes(entity)) {
      values.push("published");
      where.push(`status=$${values.length}`);
    }
    for (const [key,value] of filters) { const dbKey=aliases[key]||key; values.push(value); where.push(`${entity==="ExamQuestion"?"q.":(["AssignmentSubmission","LessonView","MaterialDownload","ExamAttempt"].includes(entity)?"x.":"")}${dbKey}=$${values.length}`); }
    let from=`${c.table}`; let select="*";
    if (c.teacherVia) select="x.*";
    else if (entity==="ExamQuestion") select="q.*";
    else if (["AssignmentSubmission","LessonView","MaterialDownload","ExamAttempt"].includes(entity)) select="x.*";
    if (c.teacherVia) from=`${c.table} x JOIN courses c ON c.id=x.course_id`;
    else if (entity==="ExamQuestion") from=`exam_questions q JOIN exams e ON e.id=q.exam_id`;
    else if (["AssignmentSubmission","LessonView","MaterialDownload","ExamAttempt"].includes(entity)) from=`${c.table} x`;
    const {rows}=await pool.query(`SELECT ${select} FROM ${from}${where.length?` WHERE ${where.join(" AND ")}`:""} ORDER BY ${entity==="ExamQuestion"?"q.":(["AssignmentSubmission","LessonView","MaterialDownload","ExamAttempt"].includes(entity)?"x.":"")}${col} ${dir} LIMIT ${limit}`,values);
    res.json({ok:true,items:rows.map(r=>normalizeRow(entity,r))});
  } catch(err) { routeError(res,err,`List ${entity}:`); }
});

app.post("/api/entities/:entity",requireTeacher,async(req,res)=>{
  const entity=req.params.entity; const c=ENTITY[entity];
  if (!c || entity==="User") return res.status(404).json({ok:false,message:"Entity غير مدعومة"});
  try {
    const data={...(req.body||{})};
    if (c.teacher) data.teacher_id=req.user.id;

    // A teacher may only attach content to courses they own. Empty course IDs
    // are treated as NULL by dbValue so optional-course content is valid.
    if (data.course_id) {
      const owner=await pool.query(`SELECT 1 FROM courses WHERE id=$1 AND teacher_id=$2 LIMIT 1`,[data.course_id,req.user.id]);
      if(!owner.rowCount) return res.status(404).json({ok:false,message:"الكورس غير موجود أو لا تملكه"});
    }
    if (entity==="TeacherEvaluation"||entity==="TeacherProfile"||entity==="TeacherLink") data.teacher_id=req.user.id;
    if (entity==="CourseSection") {
      const owner=await pool.query(`SELECT 1 FROM courses WHERE id=$1 AND teacher_id=$2`,[data.course_id,req.user.id]);
      if(!owner.rowCount) return res.status(404).json({ok:false,message:"الكورس غير موجود"});
    }
    if (entity==="ExamQuestion") {
      const owner=await pool.query(`SELECT 1 FROM exams WHERE id=$1 AND teacher_id=$2`,[data.exam_id,req.user.id]);
      if(!owner.rowCount) return res.status(404).json({ok:false,message:"الاختبار غير موجود"});
    }
    if (entity==="AssignmentSubmission") data.teacher_id=req.user.id;
    if (entity==="LessonView") data.teacher_id=req.user.id;
    if (entity==="MaterialDownload") data.teacher_id=req.user.id;
    if (entity==="ExamAttempt") data.teacher_id=req.user.id;

    const fields=c.columns.filter(k=>data[k]!==undefined);
    if (entity==="ExamQuestion") fields.push("teacher_id");
    if (entity==="Course") fields.push("teacher_id");
    else if (c.teacher && !fields.includes("teacher_id")) fields.push("teacher_id");
    else if (["TeacherEvaluation","TeacherProfile","TeacherLink","AssignmentSubmission","LessonView","MaterialDownload","ExamAttempt"].includes(entity) && !fields.includes("teacher_id")) fields.push("teacher_id");
    const uniqueFields=[...new Set(fields)];
    if (c.uniqueTeacher) {
      const exists=await pool.query(`SELECT * FROM ${c.table} WHERE teacher_id=$1 LIMIT 1`,[req.user.id]);
      if(exists.rows[0]) return res.status(409).json({ok:false,message:"إعدادات المدرس موجودة بالفعل",item:normalizeRow(entity,exists.rows[0])});
    }
    const vals=uniqueFields.map(k=>dbValue(k,k==="teacher_id"?req.user.id:data[k]));
    const placeholders=vals.map((_,i)=>`$${i+1}`).join(",");
    const {rows}=await pool.query(`INSERT INTO ${c.table} (${uniqueFields.join(",")}) VALUES (${placeholders}) RETURNING *`,vals);
    res.status(201).json({ok:true,item:normalizeRow(entity,rows[0])});
  } catch(err) { routeError(res,err,`Create ${entity}:`); }
});

app.patch("/api/entities/:entity/:id",requireTeacher,async(req,res)=>{
  const entity=req.params.entity; const c=ENTITY[entity];
  if (!c || entity==="User") return res.status(404).json({ok:false,message:"Entity غير مدعومة"});
  try {
    const client=await pool.connect();
    try {
      if(!(await teacherOwnsEntity(client,entity,req.params.id,req.user.id))) return res.status(404).json({ok:false,message:"العنصر غير موجود أو لا تملكه"});
      const data={...(req.body||{})};
      const fields=c.columns.filter(k=>data[k]!==undefined);
      if(!fields.length) { const r=await client.query(`SELECT * FROM ${c.table} WHERE id=$1`,[req.params.id]); return res.json({ok:true,item:normalizeRow(entity,r.rows[0])}); }
      const sets=[]; const vals=[];
      for(const key of fields){ vals.push(dbValue(key,data[key])); sets.push(`${key}=$${vals.length}`); }
      const updatedField=await timestampColumn(c.table,"updated"); sets.push(`${updatedField}=NOW()`);
      vals.push(req.params.id);
      const {rows}=await client.query(`UPDATE ${c.table} SET ${sets.join(",")} WHERE id=$${vals.length} RETURNING *`,vals);
      res.json({ok:true,item:normalizeRow(entity,rows[0])});
    } finally { client.release(); }
  } catch(err) { routeError(res,err,`Update ${entity}:`); }
});

app.delete("/api/entities/:entity/:id",requireTeacher,async(req,res)=>{
  const entity=req.params.entity; const c=ENTITY[entity];
  if(!c || entity==="User") return res.status(404).json({ok:false,message:"Entity غير مدعومة"});
  try {
    const client=await pool.connect();
    try {
      if(!(await teacherOwnsEntity(client,entity,req.params.id,req.user.id))) return res.status(404).json({ok:false,message:"العنصر غير موجود أو لا تملكه"});
      let removedFileUrls = [];
      if (entity === "Material") {
        const old = await client.query(`SELECT file_url FROM materials WHERE id=$1`, [req.params.id]);
        removedFileUrls = old.rows.map(r => r.file_url).filter(Boolean);
      } else if (entity === "Lesson") {
        const old = await client.query(`SELECT video_url,thumbnail FROM lessons WHERE id=$1`, [req.params.id]);
        removedFileUrls = old.rows.flatMap(r => [r.video_url, r.thumbnail]).filter(Boolean);
      } else if (entity === "Course") {
        const old = await client.query(`SELECT cover_image FROM courses WHERE id=$1`, [req.params.id]);
        removedFileUrls = old.rows.map(r => r.cover_image).filter(Boolean);
      } else if (entity === "TeacherProfile") {
        const old = await client.query(`SELECT logo,cover_image,profile_image FROM teacher_profiles WHERE id=$1`, [req.params.id]);
        removedFileUrls = old.rows.flatMap(r => [r.logo, r.cover_image, r.profile_image]).filter(Boolean);
      }
      const r=await client.query(`DELETE FROM ${c.table} WHERE id=$1`,[req.params.id]);
      if(!r.rowCount) return res.status(404).json({ok:false,message:"العنصر غير موجود"});
      removedFileUrls.forEach(removeUploadedFileFromUrl);
      res.json({ok:true,success:true});
    } finally { client.release(); }
  } catch(err) { routeError(res,err,`Delete ${entity}:`); }
});

/* ---------------- Teacher-specific server functions ---------------- */
app.post("/api/functions/:name",requireAuth,async(req,res)=>{
  const name=req.params.name; const p=req.body||{};
  try {
    if(name==="getTeacherAnalytics") {
      if(req.user.role!=="TEACHER") return res.status(403).json({ok:false,message:"غير مصرح"});
      const id=req.user.id;
      const grade=String(p.grade||"").trim();
      const hasGrade=Boolean(grade && grade!=="all");
      const gradeParam=hasGrade ? grade : null;
      const courseGrade = hasGrade ? ` AND c.target_grade=$2` : "";
      const lessonGrade = hasGrade ? ` AND COALESCE(NULLIF(l.target_grade,''), c.target_grade)=$2` : "";
      const materialGrade = hasGrade ? ` AND COALESCE(NULLIF(m.target_grade,''), c.target_grade)=$2` : "";
      const examGrade = hasGrade ? ` AND COALESCE(NULLIF(e.target_grade,''), c.target_grade)=$2` : "";
      const assignmentGrade = hasGrade ? ` AND COALESCE(NULLIF(a.target_grade,''), c.target_grade)=$2` : "";
      const values=hasGrade ? [id,gradeParam] : [id];
      const [r,top,users]=await Promise.all([
        pool.query(`SELECT
          (SELECT COUNT(DISTINCT e.student_id) FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE c.teacher_id=$1${courseGrade})::int total_students,
          (SELECT COUNT(*) FROM lesson_views lv JOIN lessons l ON l.id=lv.lesson_id LEFT JOIN courses c ON c.id=l.course_id WHERE lv.teacher_id=$1${lessonGrade})::int video_views,
          (SELECT COUNT(DISTINCT lv.student_id) FROM lesson_views lv JOIN lessons l ON l.id=lv.lesson_id LEFT JOIN courses c ON c.id=l.course_id WHERE lv.teacher_id=$1${lessonGrade})::int unique_video_viewers,
          (SELECT COUNT(*) FROM material_downloads d JOIN materials m ON m.id=d.material_id LEFT JOIN courses c ON c.id=m.course_id WHERE d.teacher_id=$1${materialGrade})::int file_downloads,
          (SELECT COUNT(DISTINCT d.student_id) FROM material_downloads d JOIN materials m ON m.id=d.material_id LEFT JOIN courses c ON c.id=m.course_id WHERE d.teacher_id=$1${materialGrade})::int unique_file_downloaders,
          COALESCE((SELECT ROUND(AVG(lv.completion_percentage)::numeric,0) FROM lesson_views lv JOIN lessons l ON l.id=lv.lesson_id LEFT JOIN courses c ON c.id=l.course_id WHERE lv.teacher_id=$1${lessonGrade}),0) average_watch_percentage,
          (SELECT COUNT(*) FROM lesson_views lv JOIN lessons l ON l.id=lv.lesson_id LEFT JOIN courses c ON c.id=l.course_id WHERE lv.teacher_id=$1 AND lv.completion_percentage>=90${lessonGrade})::int completed_views,
          (SELECT COUNT(*) FROM courses c WHERE c.teacher_id=$1${hasGrade ? ` AND c.target_grade=$2` : ""})::int total_courses,
          (SELECT COUNT(*) FROM lessons l LEFT JOIN courses c ON c.id=l.course_id WHERE l.teacher_id=$1${lessonGrade})::int total_lessons,
          (SELECT COUNT(*) FROM lessons l LEFT JOIN courses c ON c.id=l.course_id WHERE l.teacher_id=$1 AND l.video_url<>''${lessonGrade})::int total_videos,
          (SELECT COUNT(*) FROM materials m LEFT JOIN courses c ON c.id=m.course_id WHERE m.teacher_id=$1${materialGrade})::int total_files,
          (SELECT COUNT(*) FROM exams e LEFT JOIN courses c ON c.id=e.course_id WHERE e.teacher_id=$1${examGrade})::int total_exams,
          (SELECT COUNT(*) FROM assignments a LEFT JOIN courses c ON c.id=a.course_id WHERE a.teacher_id=$1${assignmentGrade})::int total_assignments`,values),
        pool.query(`SELECT m.id file_id,COALESCE(NULLIF(m.name,''),m.title,'ملف') name,COUNT(*)::int downloads
          FROM material_downloads d JOIN materials m ON m.id=d.material_id LEFT JOIN courses c ON c.id=m.course_id WHERE d.teacher_id=$1${materialGrade} GROUP BY m.id,m.name,m.title ORDER BY downloads DESC LIMIT 10`,values),
        pool.query(`SELECT id,full_name,email,photo_url,role,grade,updated_at FROM users WHERE role='STUDENT' ORDER BY updated_at DESC LIMIT 2000`)
      ]);
      res.json({ok:true,data:{...Object.fromEntries(Object.entries(r.rows[0]).map(([k,v])=>[k,Number(v)||0])),grade:hasGrade?grade:"all",top_files:top.rows,platform_users:users.rows.map(u=>({...u,photoURL:u.photo_url,updated_date:u.updated_at}))}});
      return;
    }
    if(name==="getTeacherStudents") {
      if(req.user.role!=="TEACHER") return res.status(403).json({ok:false,message:"غير مصرح"});
      const id=req.user.id;
      const {rows}=await pool.query(`SELECT u.id student_id,u.full_name name,u.email,u.grade,
        COUNT(DISTINCT e.course_id)::int courses,
        COUNT(DISTINCT lv.id)::int video_views,
        COUNT(DISTINCT md.id)::int downloads,
        COUNT(DISTINCT ea.id)::int exams_taken,
        COALESCE(ROUND(AVG(ea.score)::numeric,0),0) avg_exam_score,
        COUNT(DISTINCT s.id)::int assignments_submitted,
        GREATEST(MAX(lv.last_watched_at),MAX(md.created_date),MAX(ea.updated_date),MAX(s.updated_date)) last_activity
        FROM users u
        LEFT JOIN enrollments e ON e.student_id=u.id
        LEFT JOIN courses c ON c.id=e.course_id AND c.teacher_id=$1
        LEFT JOIN lesson_views lv ON lv.student_id=u.id AND lv.teacher_id=$1
        LEFT JOIN material_downloads md ON md.student_id=u.id AND md.teacher_id=$1
        LEFT JOIN exam_attempts ea ON ea.student_id=u.id AND ea.teacher_id=$1
        LEFT JOIN assignment_submissions s ON s.student_id=u.id AND s.teacher_id=$1
        WHERE u.role='STUDENT'
        GROUP BY u.id,u.full_name,u.email,u.grade ORDER BY last_activity DESC NULLS LAST,u.full_name`,[id]);
      res.json({ok:true,data:{students:rows,total_courses:(await pool.query(`SELECT COUNT(*)::int n FROM courses WHERE teacher_id=$1`,[id])).rows[0].n}});
      return;
    }
    if(name==="getPublicTeacher") {
      const slug=String(p.slug||"").trim().toLowerCase();
      const profile=(await pool.query(`SELECT * FROM teacher_profiles WHERE LOWER(slug)=LOWER($1) LIMIT 1`,[slug])).rows[0];
      if(!profile) return res.json({ok:true,data:{status:"not_found"}});
      const teacher=(await pool.query(`SELECT id,full_name,email,photo_url,role FROM users WHERE id=$1`,[profile.teacher_id])).rows[0];
      if(!teacher) return res.json({ok:true,data:{status:"not_ready"}});
      const [courses,lessons,materials,exams,assignments,announcements]=await Promise.all([
        pool.query(`SELECT * FROM courses WHERE teacher_id=$1 AND status='published' ORDER BY updated_at DESC`,[teacher.id]),
        pool.query(`SELECT * FROM lessons WHERE teacher_id=$1 AND status='published' ORDER BY sort_order,created_at`,[teacher.id]),
        pool.query(`SELECT * FROM materials WHERE teacher_id=$1 AND status='published' ORDER BY updated_date DESC`,[teacher.id]),
        pool.query(`SELECT * FROM exams WHERE teacher_id=$1 AND status='published' ORDER BY updated_date DESC`,[teacher.id]),
        pool.query(`SELECT * FROM assignments WHERE teacher_id=$1 AND status='published' ORDER BY updated_date DESC`,[teacher.id]),
        pool.query(`SELECT * FROM announcements WHERE teacher_id=$1 AND status='published' ORDER BY date DESC`,[teacher.id])
      ]);
      res.json({ok:true,data:{status:"ok",teacher_id:teacher.id,teacher_name:profile.page_title||teacher.full_name||"المدرس",teacher:{...teacher,photoURL:teacher.photo_url},profile:normalizeRow("TeacherProfile",profile),courses:courses.rows.map(x=>normalizeRow("Course",x)),lessons:lessons.rows.map(x=>normalizeRow("Lesson",x)),materials:materials.rows.map(x=>normalizeRow("Material",x)),exams:exams.rows.map(x=>normalizeRow("Exam",x)),assignments:assignments.rows.map(x=>normalizeRow("Assignment",x)),announcements:announcements.rows.map(x=>normalizeRow("Announcement",x))}});
      return;
    }
    if(name==="trackMaterialDownload") {
      if(!req.user) return res.status(401).json({ok:false,message:"يجب تسجيل الدخول قبل التحميل"});
      const materialId=p.material_id||p.file_id; const m=(await pool.query(`SELECT id,teacher_id,course_id FROM materials WHERE id=$1`,[materialId])).rows[0];
      if(!m) return res.status(404).json({ok:false,message:"الملف غير موجود"});
      const existing=(await pool.query(`SELECT * FROM material_downloads WHERE material_id=$1 AND student_id=$2 LIMIT 1`,[m.id,req.user.id])).rows[0];
      if(existing) return res.json({ok:true,data:normalizeRow("MaterialDownload",existing)});
      const {rows}=await pool.query(`INSERT INTO material_downloads(student_id,teacher_id,course_id,file_id,material_id) VALUES($1,$2,$3,$4,$4) RETURNING *`,[req.user.id,m.teacher_id,m.course_id,m.id]);
      return res.json({ok:true,data:normalizeRow("MaterialDownload",rows[0])});
    }
    if(name==="trackLessonView") {
      const lesson=(await pool.query(`SELECT id,teacher_id,course_id FROM lessons WHERE id=$1`,[p.lesson_id])).rows[0];
      if(!lesson) return res.status(404).json({ok:false,message:"الدرس غير موجود"});
      const pct=Math.max(0,Math.min(100,Number(p.completion_percentage)||0));
      const {rows}=await pool.query(`INSERT INTO lesson_views(student_id,teacher_id,course_id,lesson_id,completion_percentage,watch_duration,last_watched_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,NOW(),NOW()) ON CONFLICT(student_id,lesson_id) DO UPDATE SET completion_percentage=GREATEST(lesson_views.completion_percentage,EXCLUDED.completion_percentage),watch_duration=GREATEST(lesson_views.watch_duration,EXCLUDED.watch_duration),last_watched_at=NOW(),updated_at=NOW() RETURNING *`,[req.user.id,lesson.teacher_id,lesson.course_id,lesson.id,pct,Math.max(0,Number(p.watch_duration)||0)]);
      return res.json({ok:true,data:{success:true,view:normalizeRow("LessonView",rows[0])}});
    }
    if(name==="gradeExamAttempt") {
      if(req.user.role!=="TEACHER") return res.status(403).json({ok:false,message:"غير مصرح"});
      const attempt=(await pool.query(`SELECT * FROM exam_attempts WHERE id=$1 AND teacher_id=$2`,[p.attempt_id,req.user.id])).rows[0];
      if(!attempt) return res.status(404).json({ok:false,message:"محاولة الاختبار غير موجودة"});
      const exam=(await pool.query(`SELECT * FROM exams WHERE id=$1 AND teacher_id=$2`,[attempt.exam_id,req.user.id])).rows[0];
      if(!exam) return res.status(404).json({ok:false,message:"الاختبار غير موجود"});
      const q=(await pool.query(`SELECT points FROM exam_questions WHERE exam_id=$1`,[exam.id])).rows;
      const embedded=Array.isArray(exam.questions)?exam.questions:[];
      const possible=q.length?q.reduce((s,x)=>s+Number(x.points||1),0):embedded.reduce((s,x)=>s+Number(x.points||1),0)||100;
      const score=Math.max(0,Math.min(100,Number(p.score)||0));
      const {rows}=await pool.query(`UPDATE exam_attempts SET score=$1,possible=$2,earned=$3,passed=$4,teacher_note=$5,status='graded',graded_at=NOW(),graded_by=$6,updated_date=NOW() WHERE id=$7 RETURNING *`,[score,possible,possible*score/100,score>=Number(exam.passing_score||50),String(p.teacher_note||""),req.user.id,attempt.id]);
      return res.json({ok:true,data:normalizeRow("ExamAttempt",rows[0])});
    }
    if(name==="startExamAttempt") {
      const exam=(await pool.query(`SELECT * FROM exams WHERE id=$1`,[p.exam_id])).rows[0];
      if(!exam) return res.status(404).json({ok:false,message:"الاختبار غير موجود"});
      if(exam.status!=="published" && exam.teacher_id!==req.user.id) return res.status(403).json({ok:false,message:"لا يمكنك دخول هذا الاختبار"});
      const existing=(await pool.query(`SELECT * FROM exam_attempts WHERE exam_id=$1 AND student_id=$2 AND status IN ('in_progress','pending_grading') ORDER BY created_date DESC LIMIT 1`,[exam.id,req.user.id])).rows[0];
      if(existing) return res.json({ok:true,data:normalizeRow("ExamAttempt",existing)});
      const {rows}=await pool.query(`INSERT INTO exam_attempts(student_id,teacher_id,course_id,exam_id,student_name,status) VALUES($1,$2,$3,$4,$5,'in_progress') RETURNING *`,[req.user.id,exam.teacher_id,exam.course_id,exam.id,req.user.full_name||req.user.email]);
      return res.json({ok:true,data:normalizeRow("ExamAttempt",rows[0])});
    }
    if(name==="submitExamAttempt") {
      const attempt=(await pool.query(`SELECT * FROM exam_attempts WHERE exam_id=$1 AND student_id=$2 AND status='in_progress' ORDER BY created_date DESC LIMIT 1`,[p.exam_id,req.user.id])).rows[0];
      if(!attempt) return res.status(404).json({ok:false,message:"محاولة الاختبار غير موجودة"});
      const {rows}=await pool.query(`UPDATE exam_attempts SET answers=$1,status='pending_grading',submitted_at=NOW(),submitted_reason=$2,updated_date=NOW() WHERE id=$3 RETURNING *`,[JSON.stringify(p.answers||{}),String(p.reason||"student"),attempt.id]);
      return res.json({ok:true,data:normalizeRow("ExamAttempt",rows[0])});
    }
    return res.status(404).json({ok:false,message:`الوظيفة "${name}" غير مدعومة`});
  } catch(err) { routeError(res,err,`Function ${name}:`); }
});

app.use("/api",(req,res)=>res.status(404).json({ok:false,message:"API endpoint غير موجود"}));

async function startServer(){
  try {
    await pool.query("SELECT 1");
    await ensureSchema();
    const server = app.listen(PORT, HOST, ()=>{
      console.log(`Lurnova Backend running on http://${HOST}:${PORT}`);
      console.log(`Frontend: ${FRONTEND_URL}`);
      console.log(`Teacher account: ${TEACHER_EMAIL}`);
      console.log("PostgreSQL: connected");
      console.log(`Upload directory: ${UPLOAD_ROOT}`);
    });
    // Large video uploads must not be killed by Node's default 5-minute request timeout.
    server.requestTimeout = 0;
    server.headersTimeout = 120000;
  } catch(err) {
    console.error("Startup error:",err);
    await pool.end().catch(()=>{});
    process.exit(1);
  }
}
process.on("SIGINT",async()=>{await pool.end();process.exit(0);});
process.on("SIGTERM",async()=>{await pool.end();process.exit(0);});
startServer();
