import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus, Mail, Lock, Loader2, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { firebaseAuth, createUserWithEmailAndPassword, updateProfile } from "@/lib/firebase";
import { GRADES } from "@/lib/grades";
import { api } from "@/api/apiClient";

function message(error) {
  const map = {
    "auth/email-already-in-use": "هذا البريد مستخدم بالفعل. سجّل الدخول بدلًا من إنشاء حساب جديد.",
    "auth/weak-password": "كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل.",
    "auth/invalid-email": "صيغة البريد الإلكتروني غير صحيحة.",
  };
  return map[error?.code] || error?.message || "تعذر إنشاء الحساب.";
}

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", grade: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.grade) return setError("اختر الصف الدراسي أولًا.");
    if (form.password !== form.confirm) return setError("كلمتا المرور غير متطابقتين.");
    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(firebaseAuth, form.email.trim(), form.password);
      if (form.name.trim()) await updateProfile(result.user, { displayName: form.name.trim() });
      const idToken = await result.user.getIdToken(true);
      await api.auth.createServerSession(idToken);
      await api.auth.updateMe({ grade: form.grade });
      navigate("/student", { replace: true });
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#f5f7fb] px-5 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <div className="w-full rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_25px_70px_-35px_rgba(15,23,42,.35)]">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"><BookOpen className="h-7 w-7" /></div>
            <h1 className="text-3xl font-black">إنشاء حساب طالب</h1>
            <p className="mt-2 text-sm text-slate-500">أنشئ حسابك وابدأ رحلة التعلم.</p>
          </div>
          {error && <div className="mb-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><label className="text-sm font-semibold text-slate-700">الصف الدراسي</label><select required value={form.grade} onChange={(e)=>setForm({...form,grade:e.target.value})} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">اختر صفك الدراسي</option>{GRADES.map(g=><option key={g} value={g}>{g}</option>)}</select></div>
            {[
              ["name","الاسم الكامل","text","اسمك"],
              ["email","البريد الإلكتروني","email","name@example.com"],
              ["password","كلمة المرور","password","••••••••"],
              ["confirm","تأكيد كلمة المرور","password","••••••••"],
            ].map(([key,label,type,placeholder]) => (
              <div key={key}>
                <label className="mb-2 block text-sm font-semibold text-slate-700">{label}</label>
                <div className="relative">
                  {key === "name" || key === "email" ? <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /> : <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
                  <Input required={key !== "name"} type={type} placeholder={placeholder} value={form[key]} onChange={e => setForm({...form,[key]:e.target.value})} className="h-12 rounded-xl pr-10" dir={type==="email"||type==="password" ? "ltr" : "rtl"} />
                </div>
              </div>
            ))}
            <Button disabled={loading} className="h-12 w-full rounded-xl bg-indigo-600 font-bold hover:bg-indigo-700">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><UserPlus className="ml-2 h-4 w-4" /> إنشاء الحساب</>}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">لديك حساب بالفعل؟ <Link to="/login" className="font-bold text-indigo-600">تسجيل الدخول</Link></p>
        </div>
      </div>
    </div>
  );
}
