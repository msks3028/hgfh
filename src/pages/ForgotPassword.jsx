import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Mail, Loader2, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { firebaseAuth, sendPasswordResetEmail } from "@/lib/firebase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await sendPasswordResetEmail(firebaseAuth, email.trim());
      setDone(true);
    } catch (err) {
      setError(err?.code === "auth/user-not-found" ? "لا يوجد حساب بهذا البريد." : err?.message || "تعذر إرسال رابط الاستعادة.");
    } finally { setLoading(false); }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#f5f7fb] grid place-items-center px-5">
      <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl">
        <Link to="/login" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600"><ArrowRight className="h-4 w-4" /> العودة للدخول</Link>
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600 text-white"><BookOpen className="h-7 w-7" /></div>
          <h1 className="text-2xl font-black">استعادة كلمة المرور</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">أدخل بريدك وسنرسل لك رابطًا من النظام لإعادة تعيين كلمة المرور.</p>
        </div>
        {done ? (
          <div className="rounded-2xl bg-emerald-50 p-5 text-center text-emerald-700"><CheckCircle2 className="mx-auto mb-2 h-8 w-8" /><p className="font-bold">تم إرسال الرابط</p><p className="mt-1 text-sm">تحقق من بريدك الإلكتروني.</p></div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
            <div className="relative"><Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" className="h-12 rounded-xl pr-10" dir="ltr" /></div>
            <Button disabled={loading} className="h-12 w-full rounded-xl bg-indigo-600 font-bold hover:bg-indigo-700">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "إرسال رابط الاستعادة"}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
