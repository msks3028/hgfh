import {
  firebaseAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  updateProfile as updateFirebaseProfile,
  googleProvider,
  signInWithPopup,
} from "@/lib/firebase";
import { apiUrl } from "@/lib/apiBase";

const N = [
  "Announcement",
  "Assignment",
  "AssignmentSubmission",
  "Course",
  "CourseSection",
  "Enrollment",
  "Exam",
  "ExamAttempt",
  "ExamQuestion",
  "Lesson",
  "LessonView",
  "Material",
  "MaterialDownload",
  "ProblemReport",
  "TeacherLink",
  "TeacherProfile",
  "TeacherEvaluation",
  "User",
];

async function readResponse(response) {
  let body = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try { body = await response.json(); } catch { body = null; }
  } else {
    try { body = await response.text(); } catch { body = null; }
  }
  if (!response.ok) {
    const message = body?.message || body?.error || (typeof body === "string" ? body : `فشل الطلب (${response.status})`);
    const error = new Error(message);
    error.status = response.status;
    error.data = body;
    throw error;
  }
  return body;
}

async function jsonFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    cache: options.cache || "no-store",
    ...options,
    headers,
  });
  return readResponse(response);
}

const queryString = (params = {}) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") q.set(key, String(value));
  });
  const result = q.toString();
  return result ? `?${result}` : "";
};

const entity = (name) => ({
  async list(sort = "-created_date", limit = 100) {
    const result = await jsonFetch(`/api/entities/${encodeURIComponent(name)}${queryString({ sort, limit })}`);
    return Array.isArray(result?.items) ? result.items : [];
  },

  async filter(filters = {}, sort, limit = 100) {
    const result = await jsonFetch(`/api/entities/${encodeURIComponent(name)}${queryString({ ...filters, sort, limit })}`);
    return Array.isArray(result?.items) ? result.items : [];
  },

  async get(id) {
    const rows = await this.filter({ id }, undefined, 1);
    return rows[0] || null;
  },

  async create(data = {}) {
    const result = await jsonFetch(`/api/entities/${encodeURIComponent(name)}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return result?.item || null;
  },

  async update(id, data = {}) {
    const result = await jsonFetch(`/api/entities/${encodeURIComponent(name)}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return result?.item || null;
  },

  async delete(id) {
    return jsonFetch(`/api/entities/${encodeURIComponent(name)}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
});

const functions = {
  async invoke(name, payload = {}) {
    return jsonFetch(`/api/functions/${encodeURIComponent(name)}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

const auth = {
  async me() {
    try {
      const result = await jsonFetch("/api/auth/me");
      return result?.user || null;
    } catch (error) {
      if (error.status === 401) return null;
      throw error;
    }
  },

  async createServerSession(idToken) {
    const result = await jsonFetch("/api/auth/firebase", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    });
    return result;
  },

  async loginViaEmailPassword(email, password) {
    const result = await signInWithEmailAndPassword(firebaseAuth, String(email || "").trim(), password);
    return result.user;
  },

  async register({ email, password }) {
    const result = await createUserWithEmailAndPassword(firebaseAuth, String(email || "").trim(), password);
    return result.user;
  },

  async updateMe(data) {
    const current = firebaseAuth.currentUser;
    if (current && (data?.full_name || data?.photoURL)) {
      await updateFirebaseProfile(current, {
        ...(data.full_name ? { displayName: String(data.full_name).trim() } : {}),
        ...(data.photoURL ? { photoURL: String(data.photoURL) } : {}),
      });
    }
    const result = await jsonFetch("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(data || {}),
    });
    return result?.user || null;
  },

  async resetPasswordRequest(email) {
    return firebaseSendPasswordResetEmail(firebaseAuth, String(email || "").trim());
  },

  async resetPassword() {
    throw new Error("استخدم رابط استعادة كلمة المرور المرسل إلى بريدك.");
  },

  verifyOtp: async () => ({ access_token: "server-session" }),
  resendOtp: async () => ({ success: true }),
  setToken: () => {},

  async logout() {
    try {
      await jsonFetch("/api/auth/logout", { method: "POST" });
    } finally {
      await firebaseSignOut(firebaseAuth).catch(() => {});
    }
  },

  redirectToLogin(returnTo = "/") {
    window.location.href = "/login" + (returnTo && returnTo !== "/" ? `?returnTo=${encodeURIComponent(returnTo)}` : "");
  },

  async loginWithProvider() {
    const result = await signInWithPopup(firebaseAuth, googleProvider);
    const idToken = await result.user.getIdToken(true);
    const session = await auth.createServerSession(idToken);
    if (!session?.user) throw new Error("تعذر إنشاء جلسة الحساب.");
    return session.user;
  },
};

function uploadFileToServer({ file, onProgress, onStatus, signal, folder = "teacher-files" }) {
  if (!file) throw new Error("لم يتم اختيار ملف.");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const startedAt = performance.now();
    let lastTime = startedAt;
    let lastBytes = 0;
    const speeds = [];

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      fn(value);
    };

    const abort = () => {
      try { xhr.abort(); } catch {}
    };

    const report = (bytes, state = "running") => {
      const now = performance.now();
      const deltaBytes = Math.max(0, bytes - lastBytes);
      const deltaSeconds = Math.max(0.001, (now - lastTime) / 1000);
      if (deltaBytes > 0) {
        speeds.push(deltaBytes / deltaSeconds);
        if (speeds.length > 6) speeds.shift();
      }
      lastBytes = bytes;
      lastTime = now;
      const speed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
      onProgress?.({
        percent: file.size ? (bytes / file.size) * 100 : 100,
        bytesTransferred: bytes,
        totalBytes: file.size,
        speed,
        state,
      });
    };

    signal?.addEventListener("abort", abort, { once: true });
    onStatus?.({ state: "connecting", message: "جاري الاتصال بخادم الملفات..." });
    report(0, "connecting");

    const query = new URLSearchParams({
      folder: String(folder || "teacher-files"),
      name: file.name || "file",
    });
    xhr.open("PUT", apiUrl(`/api/uploads?${query.toString()}`), true);
    xhr.withCredentials = true;
    xhr.responseType = "text";
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.addEventListener("loadstart", () => {
      onStatus?.({ state: "running", message: "بدأ رفع الملف إلى الخادم..." });
    });

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      report(event.loaded, "running");
      onStatus?.({ state: "running", message: "جاري رفع الملف..." });
    });

    xhr.addEventListener("load", () => {
      if (signal?.aborted) return;
      let body = null;
      try { body = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch {}
      if (xhr.status < 200 || xhr.status >= 300) {
        const error = new Error(body?.message || `فشل رفع الملف (${xhr.status}).`);
        error.status = xhr.status;
        error.data = body;
        finish(reject, error);
        return;
      }
      const result = body?.file;
      if (!result?.file_url) {
        finish(reject, new Error("تم رفع الملف لكن الخادم لم يرجع رابط الملف."));
        return;
      }
      report(file.size, "success");
      onStatus?.({ state: "success", message: "تم رفع الملف بنجاح وأصبح جاهزًا للطلاب." });
      finish(resolve, result);
    });

    xhr.addEventListener("error", () => {
      finish(reject, new Error("تعذر رفع الملف بسبب مشكلة في الاتصال بالخادم."));
    });

    xhr.addEventListener("abort", () => {
      if (signal?.aborted) {
        finish(reject, Object.assign(new Error("تم إلغاء رفع الملف."), { code: "upload-canceled" }));
      } else {
        finish(reject, Object.assign(new Error("تم إلغاء رفع الملف."), { code: "upload-canceled" }));
      }
    });

    try {
      xhr.send(file);
    } catch (error) {
      finish(reject, error);
    }
  });
}

export const api = {
  entities: Object.fromEntries(N.map((name) => [name, entity(name)])),
  auth,
  functions,
  integrations: {
    Core: {
      async UploadFile({ file, onProgress, onStatus, signal, folder }) {
        return uploadFileToServer({ file, onProgress, onStatus, signal, folder });
      },
    },
  },
};

export default api;
