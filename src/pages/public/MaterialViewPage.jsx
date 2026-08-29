import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { gradeMatches } from '@/lib/grades';
import EmptyState from '@/components/ui/EmptyState';
import { ArrowRight, FileText, Download, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isLocalFileUrl, openLocalFile, resolveFileUrl } from '@/lib/localFiles';

const driveId = (value='') => {
  const m = String(value).match(/\/d\/([^/?]+)/) || String(value).match(/[?&]id=([^&]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : '';
};
const isPdf = (m) => /pdf/i.test(m?.file_type||'') || /\.pdf(?:$|[?#])/i.test(m?.file_url||'');

export default function MaterialViewPage(){
  const { materialId } = useParams(); const { user }=useAuth(); const [searchParams]=useSearchParams();
  const requestedReturn=searchParams.get('returnTo')||'';
  const backTo=requestedReturn.startsWith('/student')?requestedReturn:'/student/files';
  const [material,setMaterial]=useState(null); const [loading,setLoading]=useState(true); const [denied,setDenied]=useState(false); const [previewUrl,setPreviewUrl]=useState('');
  useEffect(()=>{let alive=true;(async()=>{try{
    const [items,courses,users]=await Promise.all([api.entities.Material.filter({id:materialId}),api.entities.Course.list('-created_date',500),api.entities.User.filter({id:user?.id})]);
    const m=items[0]; if(!m){setDenied(true);return;}
    const course=courses.find(c=>c.id===m.course_id); const effectiveGrade=m.target_grade||course?.target_grade||''; if(m.status!=='published' || !gradeMatches(effectiveGrade,users[0]?.grade||user?.grade)){setDenied(true);return;}
    if(alive){setMaterial(m); const raw=m.file_url||''; try{setPreviewUrl(isLocalFileUrl(raw)?await resolveFileUrl(raw):raw)}catch{setPreviewUrl(raw)}}
  }catch{if(alive)setDenied(true)}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[materialId,user?.id]);
  if(loading)return <div className="flex justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600"/></div>;
  if(denied)return <div className="py-24"><EmptyState icon={Lock} title="لا يمكنك الوصول إلى هذا الملف" /></div>;
  const id=driveId(previewUrl||material.file_url); const preview=id?`https://drive.google.com/file/d/${id}/preview`:(previewUrl||material.file_url);
  const download=async()=>{await api.functions.invoke('trackMaterialDownload',{file_id:material.id,teacher_id:material.teacher_id,course_id:material.course_id||''}).catch(()=>{}); if(isLocalFileUrl(material.file_url)) await openLocalFile(material.file_url,{download:true}); else window.open(material.file_url,'_blank','noopener');};
  return <div className="min-h-screen bg-slate-100 py-6"><div className="mx-auto max-w-6xl px-4"><Link to={backTo} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600"><ArrowRight className="h-4 w-4"/> العودة للمحتوى</Link><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-black text-slate-900">{material.name||material.title}</h1>{material.description&&<p className="mt-1 text-sm text-slate-500">{material.description}</p>}</div><Button variant="outline" onClick={download} className="gap-2"><Download className="h-4 w-4"/>تحميل نسخة</Button></div><div className="overflow-hidden rounded-2xl border bg-white shadow-sm">{isPdf(material)||id?<object data={preview} type="application/pdf" className="h-[78vh] w-full"><iframe title={material.name||'الملف'} src={preview} className="h-full w-full border-0"/></object>:<div className="p-10 text-center"><FileText className="mx-auto h-12 w-12 text-slate-300"/><p className="mt-3 text-slate-500">المعاينة داخل الموقع غير متاحة لهذا النوع من الملفات.</p><Button className="mt-4" onClick={download}>فتح أو تحميل الملف</Button></div>}</div></div></div>;
}
