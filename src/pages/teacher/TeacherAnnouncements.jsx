import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useTeacherCourses } from '@/lib/useTeacherCourses';
import TeacherGradeFilter, { matchesTeacherGrade } from '@/components/ui/TeacherGradeFilter';
import { readTeacherGrade, saveTeacherGrade } from '@/lib/teacherGrade';
import { Plus, Megaphone, Pencil, Trash2 } from 'lucide-react';

const EMPTY = { title: '', message: '', course_id: '' };

export default function TeacherAnnouncements() {
    const { user } = useAuth();
    const { toast } = useToast();
    const { courses } = useTeacherCourses();
    const [searchParams] = useSearchParams();
    const courseIdFromUrl = searchParams.get('courseId') || '';
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [toDelete, setToDelete] = useState(null);
    const [selectedGrade, setSelectedGrade] = useState(readTeacherGrade);
    const visibleItems = items.filter((item) => matchesTeacherGrade(item, selectedGrade, courses));
    const changeGrade = (grade) => { setSelectedGrade(grade); saveTeacherGrade(grade); };

    const load = async () => {
        setLoading(true);
        try {
            const data = await api.entities.Announcement.list('-created_date', 200);
            setItems(data.filter((a) => a.teacher_id === user.id));
        } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const openCreate = () => { setEditing(null); setForm({ ...EMPTY, course_id: courseIdFromUrl }); setOpen(true); };
    const openEdit = (a) => { setEditing(a); setForm({ title: a.title, message: a.message, course_id: a.course_id || '' }); setOpen(true); };

    const save = async () => {
        if (!form.title || !form.message) { toast({ variant: 'destructive', title: 'أكمل البيانات' }); return; }
        setSaving(true);
        try {
            if (editing) { await api.entities.Announcement.update(editing.id, { ...form, course_id: form.course_id || '' }); toast({ title: 'تم التحديث' }); }
            else { await api.entities.Announcement.create({ ...form, teacher_id: user.id, course_id: form.course_id || '', date: new Date().toISOString() }); toast({ title: 'تم نشر الإعلان' }); }
            setOpen(false); load();
        } catch (err) { toast({ variant: 'destructive', title: 'خطأ', description: err?.message }); }
        finally { setSaving(false); }
    };

    const remove = async () => { await api.entities.Announcement.delete(toDelete.id); toast({ title: 'تم الحذف' }); load(); };
    const courseName = (id) => courses.find((c) => c.id === id)?.title || 'عام';

    return (
        <div>
            <PageHeader title="الإعلانات" description="نشر إعلانات لطلابك"
                actions={<Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> إعلان جديد</Button>} />

            <TeacherGradeFilter value={selectedGrade} onChange={changeGrade} />

            {loading ? (
                <div className="flex justify-center py-16"><div className="h-8 w-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>
            ) : visibleItems.length === 0 ? (
                <EmptyState icon={Megaphone} title="لا توجد إعلانات" description="انشر أول إعلان لطلابك"
                    action={<Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> إعلان جديد</Button>} />
            ) : (
                <div className="space-y-3">
                    {visibleItems.map((a) => (
                        <Card key={a.id} className="border-slate-200 transition hover:shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Megaphone className="h-5 w-5" /></div>
                                        <div>
                                            <p className="font-semibold text-slate-800">{a.title}</p>
                                            <p className="mt-1 text-sm text-slate-600">{a.message}</p>
                                            <div className="mt-2 flex gap-3 text-xs text-slate-400">
                                                <span>{courseName(a.course_id)}</span>
                                                <span>{new Date(a.date || a.created_date).toLocaleDateString('ar-EG')}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button size="sm" variant="ghost" className="h-8" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                                        <Button size="sm" variant="ghost" className="h-8 text-rose-600" onClick={() => setToDelete(a)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>{editing ? 'تعديل الإعلان' : 'إعلان جديد'}</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5"><Label>العنوان</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                        <div className="space-y-1.5"><Label>الرسالة</Label><Textarea rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
                        <div className="space-y-1.5">
                            <Label>الكورس (اختياري)</Label>
                            <Select value={form.course_id || 'none'} onValueChange={(v) => setForm({ ...form, course_id: v === 'none' ? '' : v })}>
                                <SelectTrigger><SelectValue placeholder="عام لكل الطلاب" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">عام لكل الطلاب</SelectItem>
                                    {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
                        <Button onClick={save} disabled={saving}>{saving ? 'جارٍ...' : 'نشر'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={remove} title="حذف الإعلان" message={`حذف "${toDelete?.title}"؟`} destructive confirmText="حذف" />
        </div>
    );
}