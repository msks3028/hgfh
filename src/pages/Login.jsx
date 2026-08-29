import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Mail, Lock, Loader2, BookOpen, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import GoogleIcon from "@/components/GoogleIcon";
import { firebaseAuth, signInWithEmailAndPassword } from "@/lib/firebase";
import { api } from "@/api/apiClient";


function friendlyError(error) {
  const message = error?.message || "تعذر تسجيل الدخول. حاول مرة أخرى.";
  const code = error?.code || "";
  const map = {
    "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    "auth/invalid-email": "صيغة البريد الإلكتروني غير صحيحة.",
    "auth/user-disabled": "هذا الحساب تم تعطيله.",
    "auth/too-many-requests": "تمت محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.",
    "auth/network-request-failed": "تعذر الاتصال. تحقق من الإنترنت واتصال خادم المنصة.",
    "auth/popup-closed-by-user": "تم إغلاق نافذة Google قبل إكمال تسجيل الدخول.",
    "auth/popup-blocked": "المتصفح منع نافذة Google. اسمح بالنوافذ المنبثقة لهذا الموقع ثم حاول مرة أخرى.",
    "auth/unauthorized-domain": "النطاق الحالي غير مضاف إلى Authorized domains في Firebase Authentication.",
    "auth/operation-not-allowed": "تسجيل الدخول باستخدام Google غير مفعّل في Firebase Authentication.",
    "auth/invalid-api-key": "إعداد Firebase غير صحيح: تحقق من Firebase API Key وبيانات المشروع.",
    "auth/internal-error": "تعذر إكمال تسجيل الدخول باستخدام Google. حاول مرة أخرى وتأكد من إعداد Google داخل Firebase.",
  };
  return map[code] || message;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const authError = params.get("authError");
    if (authError) setError(authError);
  }, [location.search]);

  const finishBackendSession = async (firebaseUser) => {
    const idToken = await firebaseUser.getIdToken(true);
    const session = await api.auth.createServerSession(idToken);
    if (!session?.user) throw new Error("تعذر إنشاء جلسة المنصة. تأكد أن خادم المنصة متاح.");
    localStorage.setItem("user", JSON.stringify(session.user));
    return session.user;
  };

  const goAfterLogin = (user) => {
    const role = user?.role === "TEACHER" ? "TEACHER" : "STUDENT";
    const returnTo = location.state?.from?.pathname || (role === "TEACHER" ? "/teacher" : "/student");
    const search = location.state?.from?.search || "";
    const target = returnTo + search;
    if (role === "STUDENT" && !user?.grade) {
      navigate("/student/select-grade", { replace: true, state: { from: target || "/student" } });
      return;
    }
    navigate(target || "/", { replace: true });
  };

  const handleGoogleLogin = async () => {
    setError("");
    setLoading("google");
    try {
      const user = await api.auth.loginWithProvider();
      goAfterLogin(user);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading("");
    }
  };

  const handleEmailLogin = async (event) => {
    event.preventDefault();
    setError("");
    setLoading("email");
    try {
      const result = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      const user = await finishBackendSession(result.user);
      goAfterLogin(user);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading("");
    }
  };


  return (
    <div dir="rtl" className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_.95fr]">
        <section className="relative hidden overflow-hidden bg-slate-950 lg:flex">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,.35),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(14,165,233,.25),transparent_30%)]" />
          <div className="relative z-10 flex flex-col justify-between p-12 xl:p-20 text-white">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 border border-white/10 backdrop-blur">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <div className="text-xl font-black">مدرستي</div>
                <div className="text-xs text-white/50">منصة تعليمية ذكية</div>
              </div>
            </div>
            <div className="max-w-xl">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
                <ShieldCheck className="h-4 w-4 text-emerald-300" /> تعلّم منظم، متابعة واضحة
              </p>
              <h1 className="text-5xl font-black leading-tight xl:text-6xl">
                مكان واحد لكل
                <span className="block text-indigo-300">رحلتك التعليمية.</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-8 text-white/60">
                إدارة الدروس والكورسات والطلاب من لوحة واحدة، وتجربة تعلم بسيطة وواضحة للطلاب.
              </p>
            </div>
            <p className="text-sm text-white/35">© 2026 مدرستي التعليمية</p>
          </div>
        </section>

        <section className="flex items-center justify-center p-5 sm:p-10">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-600 text-white">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-lg font-black">مدرستي</div>
                  <div className="text-xs text-slate-400">منصة تعليمية ذكية</div>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-[0_25px_70px_-35px_rgba(15,23,42,.35)] sm:p-9">
              <div className="mb-8">
                <h2 className="text-3xl font-black tracking-tight">مرحبًا بعودتك 👋</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">سجّل الدخول للوصول إلى مساحتك التعليمية.</p>
              </div>

              {error && (
                <div className="mb-5 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                  {error}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleLogin}
                disabled={Boolean(loading)}
                className="h-12 w-full rounded-xl border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
              >
                {loading === "google" ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleIcon className="h-5 w-5" />}
                <span className="mr-2 font-semibold">المتابعة باستخدام Google</span>
              </Button>

              <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
                <div className="h-px flex-1 bg-slate-100" /><span>أو بالبريد الإلكتروني</span><div className="h-px flex-1 bg-slate-100" />
              </div>

              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">البريد الإلكتروني</label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" className="h-12 rounded-xl border-slate-200 pr-10 text-left" dir="ltr" required />
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-semibold text-slate-700">كلمة المرور</label>
                    <Link to="/forgot-password" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">نسيت كلمة المرور؟</Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" className="h-12 rounded-xl border-slate-200 pr-10 text-left" dir="ltr" required />
                  </div>
                </div>
                <Button disabled={Boolean(loading)} className="h-12 w-full rounded-xl bg-indigo-600 font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700">
                  {loading === "email" ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" /> جارٍ تسجيل الدخول...</> : "تسجيل الدخول"}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-500">
                ليس لديك حساب؟{" "}
                <Link to="/register" state={{ from: location.state?.from }} className="font-bold text-indigo-600 hover:text-indigo-700">إنشاء حساب جديد</Link>
              </p>
            </div>
            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4" /> تسجيل الدخول باستخدام Google أو البريد الإلكتروني
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
