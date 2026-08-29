import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/apiClient';
import LocalFileImage from '@/components/ui/LocalFileImage';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import FileUpload from '@/components/ui/FileUpload';
import { useTeacherCourses } from '@/lib/useTeacherCourses';
import { GRADES } from '@/lib/grades';
import TeacherGradeFilter, { matchesTeacherGrade } from '@/components/ui/TeacherGradeFilter';
import { readTeacherGrade, saveTeacherGrade } from '@/lib/teacherGrade';
import { Plus, BookOpen, Pencil, Trash2, Globe, Video, Eye, EyeOff } from 'lucide-react';

const EMPTY = { title: '', description: '', course_id: '', target_grade: '', section_id: '', thumbnail: '', video_url: '', status: 'draft', is_free: false, order: 0 };

export default function TeacherLessons() {
    const { user } = useAuth();
    const { toast } = useToast();
    const { courses } = useTeacherCourses();
    const [searchParams] = useSearchParams();
    const courseIdFromUrl = searchParams.get('courseId') || '';
    const [lessons, setLessons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [toDelete, setToDelete] = useState(null);
    const [selectedGrade, setSelectedGrade] = useState(readTeacherGrade);
    const visibleLessons = lessons.filter((lesson) => matchesTeacherGrade(lesson, selectedGrade, courses));
    const changeGrade = (grade) => { setSelectedGrade(grade); saveTeacherGrade(grade); };

    const load = async () => {
        setLoading(true);
        try {
            const data = await api.entities.Lesson.list('-created_date', 200);
            setLessons(data.filter((l) => l.teacher_id === user.id));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const openCreate = () => { setEditing(null); setForm({ ...EMPTY, course_id: courseIdFromUrl }); setSaveError(''); setOpen(true); };
    const openEdit = (l) => { setEditing(l); setForm({ ...l }); setSaveError(''); setOpen(true); };

    const save = async () => {
        if (!form.title.trim()) {
            setSaveError('أدخل عنوان الحصة أولاً.');
            toast({ variant: 'destructive', title: 'أدخل عنوان الحصة' });
            return;
        }
        if (!user?.id) {
            setSaveError('انتهت جلسة تسجيل الدخول. سجّل الخروج ثم ادخل مرة أخرى.');
            return;
        }

        setSaving(true);
        setSaveError('');
        try {
            const payload = {
                ...form,
                title: form.title.trim(),
                teacher_id: user.id,
                course_id: form.course_id || '',
                section_id: form.section_id || '',
            };

            if (editing?.id) {
                await api.entities.Lesson.update(editing.id, payload);
                toast({ title: 'تم تحديث الحصة' });
            } else {
                await api.entities.Lesson.create(payload);
                toast({ title: 'تم إنشاء الحصة' });
            }

            // Do not close the dialog until Firestore has accepted the record.
            await load();
            setOpen(false);
        } catch (err) {
            console.error('Lesson save failed:', err);
            const message = err?.data?.error || err?.message || 'تعذر حفظ الحصة في Firestore. حاول مرة أخرى.';
            setSaveError(message);
            toast({ variant: 'destructive', title: 'تعذر حفظ الحصة', description: message });
        } finally {
            setSaving(false);
        }
    };

    const togglePublish = async (l) => {
        const next = l.status === 'published' ? 'draft' : 'published';
        await api.entities.Lesson.update(l.id, { status: next });
        toast({ title: next === 'published' ? 'تم النشر' : 'تم إلغاء النشر' });
        load();
    };

    const remove = async () => {
        await api.entities.Lesson.delete(toDelete.id);
        toast({ title: 'تم حذف الحصة' });
        load();
    };

    const courseName = (id) => courses.find((c) => c.id === id)?.title || 'بدون كورس';

    return (
        <div>
            <PageHeader title="الحصص المسجلة" description="إنشاء وإدارة الحصص والفيديوهات المسجلة"
                actions={<Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> حصة جديدة</Button>} />

            <TeacherGradeFilter value={selectedGrade} onChange={changeGrade} />

            {loading ? (
                <div className="flex justify-center py-16"><div className="h-8 w-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>
            ) : visibleLessons.length === 0 ? (
                <EmptyState icon={BookOpen} title="لا توجد حصص بعد" description="ابدأ بإضافة أول حصة مسجلة"
                    action={<Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> حصة جديدة</Button>} />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleLessons.map((l) => (
                        <Card key={l.id} className="course-reference-card">
                            <div className="course-reference-media">
                                {l.thumbnail ? <LocalFileImage src={l.thumbnail} alt={l.title} className="h-full w-full object-cover" /> : (
                                    <div className="flex h-full items-center justify-center text-slate-300"><Video className="h-10 w-10" /></div>
                                )}
                                <span className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-xs font-medium ${l.status === 'published' ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-white'}`}>
                                    {l.status === 'published' ? 'منشور' : 'مسودة'}
                                </span>
                                {l.is_free && <span className="absolute top-2 left-2 rounded-full bg-blue-500 px-2 py-0.5 text-xs font-medium text-white">مجاني</span>}
                            </div>
                            <CardContent className="course-reference-body">
                                <span className="course-reference-chip">{courseName(l.course_id)}</span><p className="course-reference-title line-clamp-1">{l.title}</p>
                                <p className="course-reference-text">{l.description || "فيديو تعليمي مخصص لطلاب الصف المحدد."}</p>
                                <div className="course-reference-footer">
                                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => togglePublish(l)}>
                                        {l.status === 'published' ? <><EyeOff className="h-3.5 w-3.5" /> إلغاء</> : <><Eye className="h-3.5 w-3.5" /> نشر</>}
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-8" onClick={() => openEdit(l)}><Pencil className="h-4 w-4" /></Button>
                                    <Button size="sm" variant="ghost" className="h-8 text-rose-600" onClick={() => setToDelete(l)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>{editing ? 'تعديل الحصة' : 'حصة جديدة'}</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
                        {saveError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{saveError}</div>}
                        <div className="space-y-1.5"><Label>عنوان الحصة</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                        <div className="space-y-1.5"><Label>الوصف</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>الكورس</Label>
                                <Select value={form.course_id || 'none'} onValueChange={(v) => setForm({ ...form, course_id: v === 'none' ? '' : v })}>
                                    <SelectTrigger><SelectValue placeholder="بدون كورس" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">بدون كورس</SelectItem>
                                        {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div><div className="space-y-1.5"><Label>الصف الدراسي المستهدف</Label><Select value={form.target_grade || 'all'} onValueChange={(v)=>setForm({ ...form, target_grade: v === 'all' ? '' : v })}><SelectTrigger><SelectValue placeholder="كل الصفوف"/></SelectTrigger><SelectContent><SelectItem value="all">كل الصفوف</SelectItem>{GRADES.map((g)=><SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div>
                            <div className="space-y-1.5"><Label>الترتيب</Label><Input type="number" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} /></div>
                        </div>
                        <FileUpload label="رابط الفيديو" folder="teacher-videos" accept="video/*" value={form.video_url || ''} onChange={(v) => setForm({ ...form, video_url: v })} hint="MP4, WebM..." />
                        <FileUpload label="صورة مصغّرة" folder="teacher-thumbnails" type="image" accept="image/*" value={form.thumbnail || ''} onChange={(v) => setForm({ ...form, thumbnail: v })} />
                        <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                            <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-blue-500" /><span className="text-sm">محتوى مجاني (متاح للجميع)</span></div>
                            <Switch checked={!!form.is_free} onCheckedChange={(v) => setForm({ ...form, is_free: v })} />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
                        <Button onClick={save} disabled={saving}>{saving ? 'جارٍ...' : 'حفظ'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} title="حذف الحصة" message={`حذف "${toDelete?.title}"؟`} destructive confirmText="حذف" />
        </div>
    );
}