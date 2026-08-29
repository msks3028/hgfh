import React,{useState}from"react";
import{NavLink,Outlet,useLocation,Navigate}from"react-router-dom";
import{Menu,X,LogOut,ChevronRight,Bell,Search,BookOpen,MessageCircle,ChevronDown,Globe,Instagram,Youtube,Facebook,Twitter,Send}from"lucide-react";
import{useAuth}from"@/lib/AuthContext";
import{normalizeRole,roleHome,ROLE_LABEL}from"@/lib/roles";
import{cn}from"@/lib/utils";
import LocalFileImage from "@/components/ui/LocalFileImage";
import { useSiteBrand } from '@/lib/SiteBrandContext';

export default function DashboardLayout({navItems,allowedRole,brandTitle,brandSubtitle}){
 const{user,logout}=useAuth();
 const{settings}=useSiteBrand();
 const location=useLocation();
 const[mobileOpen,setMobileOpen]=useState(false);
 const siteLogo=settings?.logo||"";
 const siteTitle=settings?.page_title||brandTitle||'مدرستي';
 const theme=settings?.theme_color||'#263b49';
 const accent=settings?.accent_color||'#5b66cf';
 const initial=(user?.full_name||"م").charAt(0);
 const socialRaw=settings?.social_links||{};
 const normalizeUrl=(key,value)=>{const raw=String(value||'').trim();if(!raw)return '';if(key==='whatsapp'&&!/^https?:\/\//i.test(raw))return `https://wa.me/${raw.replace(/[^0-9]/g,'')}`;return /^https?:\/\//i.test(raw)?raw:`https://${raw}`};
 const socialItems=[['facebook','Facebook',Facebook],['twitter','Twitter',Twitter],['instagram','Instagram',Instagram],['youtube','Youtube',Youtube],['website','Website',Globe],['whatsapp','WhatsApp',Send]].map(([key,label,Icon])=>({key,label,Icon,url:normalizeUrl(key,socialRaw[key])})).filter(x=>x.url);
 if(user&&normalizeRole(user.role)!==allowedRole)return <Navigate to={roleHome(user.role)} replace/>;
 const avatarFallback=<div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#d9f0e5] to-[#fff0d6] font-black text-slate-700 shadow-sm">{initial}</div>;
 const avatar=user?.photoURL?
   <LocalFileImage src={user.photoURL} alt={user?.full_name||"صورة المستخدم"} fallback={avatarFallback} className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white shadow"/>:
   avatarFallback;

 const sidebar=(<div className="flex h-full flex-col border-r border-[#e8edf0] bg-white text-slate-700" dir="rtl">
   <div className="flex h-[74px] items-center gap-3 border-b border-[#edf0f2] px-6">
     <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-xl text-white" style={{background:`linear-gradient(135deg, ${accent}, ${theme})`}}>{siteLogo?<LocalFileImage src={siteLogo} alt="شعار المنصة" className="h-full w-full object-cover"/>:<BookOpen className="h-5 w-5"/>}</div>
     <div><div className="text-lg font-black tracking-tight" style={{color:theme}}>{siteTitle}</div><div className="text-[10px] text-slate-400">{brandSubtitle}</div></div>
   </div>
   <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5">
    {navItems.map(({label,path,icon:Icon,end})=><NavLink key={path} to={path} end={end} onClick={()=>setMobileOpen(false)} className={({isActive})=>cn("group flex items-center gap-3 rounded-lg px-4 py-3 text-[13px] font-bold transition-all",!isActive&&"text-slate-500 hover:bg-[#f6f8f9] hover:text-[#263b49]")} style={({isActive})=>isActive?{backgroundColor:`${accent}22`,color:theme,boxShadow:`inset 0 0 0 1px ${accent}14`}:undefined}>
      <Icon className="h-[17px] w-[17px]"/><span className="flex-1">{label}</span>{location.pathname===path&&<ChevronRight className="h-4 w-4" style={{color:accent}}/>}
    </NavLink>)}
   </nav>
   <div className="border-t border-[#edf0f2] p-4">
    {socialItems.length>0&&<div className="mb-3 rounded-xl border border-slate-100 bg-[#fafcfd] p-3"><div className="mb-2 text-[10px] font-bold text-slate-400">روابط المستر</div><div className="flex flex-wrap gap-1.5">{socialItems.map(({key,label,Icon,url})=><a key={key} href={url} target="_blank" rel="noreferrer" title={label} aria-label={label} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:-translate-y-0.5 hover:text-[var(--platform-accent)]"><Icon className="h-4 w-4"/></a>)}</div></div>}
    <div className="flex items-center gap-3 rounded-xl bg-[#f7faf9] p-3">{avatar}<div className="min-w-0 flex-1"><div className="truncate text-xs font-black text-slate-700">{user?.full_name||'المستخدم'}</div><div className="truncate text-[10px] text-slate-400">{ROLE_LABEL[user?.role]}</div></div></div>
    <button onClick={()=>logout()} className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold text-[#c45d5d] transition hover:bg-rose-50"><LogOut className="h-4 w-4"/>تسجيل الخروج</button>
   </div>
 </div>);

 return <div dir="rtl" className="site-platform min-h-screen bg-[#f5f8fa] text-slate-800" style={{'--platform-theme':theme,'--platform-accent':accent}}>
   <aside className="fixed inset-y-0 left-0 z-40 hidden w-[230px] lg:block">{sidebar}</aside>
   {mobileOpen&&<><div className="fixed inset-0 z-50 bg-slate-950/35 lg:hidden" onClick={()=>setMobileOpen(false)}/><aside className="fixed inset-y-0 left-0 z-[60] w-[290px] lg:hidden"><button onClick={()=>setMobileOpen(false)} className="absolute left-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white shadow"><X className="h-5 w-5"/></button>{sidebar}</aside></>}
   <div className="lg:pl-[230px]">
    <header className="sticky top-0 z-30 flex h-[74px] items-center gap-4 border-b border-[#e8edf0] bg-white/95 px-5 backdrop-blur lg:px-8">
      <button className="lg:hidden" onClick={()=>setMobileOpen(true)}><Menu/></button>
      <div className="text-lg font-black" style={{color:theme}}>لوحة التحكم</div>
      <div className="relative mr-2 hidden max-w-[360px] flex-1 md:block"><Search className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input className="h-10 w-full rounded-lg border border-[#e8edf0] bg-[#fbfcfd] pr-11 text-xs outline-none transition focus:border-[var(--platform-accent)]" placeholder="ابحث عن كورس أو طالب أو اختبار..."/></div>
      <div className="mr-auto flex items-center gap-2 sm:gap-3"><button className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><Bell className="h-4 w-4"/></button><button className="hidden h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 md:grid"><MessageCircle className="h-4 w-4"/></button><div className="hidden h-7 w-px bg-slate-200 sm:block"/><div className="flex items-center gap-2">{avatar}<div className="hidden text-right sm:block"><div className="text-xs font-black">{user?.full_name||'المستخدم'}</div><div className="text-[10px] text-slate-400">{ROLE_LABEL[user?.role]}</div></div><ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block"/></div></div>
    </header>
    <main className="min-h-[calc(100vh-74px)] p-4 sm:p-6 lg:p-8"><Outlet/></main>
   </div>
 </div>
}
