import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import EmptyState from '@/components/ui/EmptyState';
import { ArrowRight, Play, AlertCircle, Lock } from 'lucide-react';
import { resolveFileUrl, revokeResolvedFileUrl } from '@/lib/localFiles';

const driveIdFromUrl = (value = '') => {
    const text = String(value);
    const patterns = [/\/d\/([^/]+)/, /[?&]id=([^&]+)/];
    for (const pattern of patterns) { const m = text.match(pattern); if (m?.[1]) return decodeURIComponent(m[1]); }
    return '';
};

export default function LessonViewPage() {
    const { slug, lessonId } = useParams();
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const requestedReturn = searchParams.get('returnTo') || '';
    const backTo = requestedReturn.startsWith('/student') ? requestedReturn : (user?.role === 'STUDENT' ? '/student/videos' : (slug ? `/teacher/${slug}` : '/teacher/lessons'));
    const [lesson, setLesson] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [accessDenied, setAccessDenied] = useState(false);
    const [accessMessage, setAccessMessage] = useState('لا يمكنك الوصول إلى هذه الحصة');
    const [videoSrc, setVideoSrc] = useState('');
    const driveVideoId = driveIdFromUrl(lesson?.video_url);
    const videoRef = useRef(null);
    const lastSync = useRef(0);

    useEffect(() => {
        (async () => {
            try {
                const [lessons, enrollments] = await Promise.all([
                    api.entities.Lesson.filter({ id: lessonId }),
                    api.entities.Enrollment.list('-created_date', 500),
                ]);
                const l = lessons[0];
                if (!l) { setNotFound(true); return; }
                const isOwner = l.teacher_id === user?.id;
                const enrolled = !l.course_id || l.is_free === true || enrollments.some(e => e.student_id === user?.id && e.course_id === l.course_id);
                if ((l.status !== 'published' && !isOwner) || (!isOwner && !enrolled)) { setAccessMessage(l.course_id ? 'هذه الحصة متاحة للمشتركين في الكورس فقط' : 'لا يمكنك الوصول إلى هذه الحصة'); setAccessDenied(true); return; }
                setLesson(l);
            } catch {
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        })();
    }, [slug, lessonId]);

    useEffect(() => { let live=true; const value=lesson?.video_url; if(!value){setVideoSrc('');return;} resolveFileUrl(value).then(u=>{if(live)setVideoSrc(u)}).catch(()=>{if(live)setVideoSrc('')}); return()=>{live=false;revokeResolvedFileUrl(value)}; }, [lesson?.video_url]);

    const trackView = async (completionPercentage = 0, watchDuration = null) => {
        if (!lesson || !user) return;
        try {
            await api.functions.invoke('trackLessonView', {
                lesson_id: lesson.id,
                course_id: lesson.course_id || '',
                teacher_id: lesson.teacher_id,
                watch_duration: watchDuration ?? Math.round(videoRef.current?.currentTime || 0),
                completion_percentage: completionPercentage
            });
        } catch { /* ignore tracking errors */ }
    };

    const handleTimeUpdate = async () => {
        const v = videoRef.current;
        if (!v || !lesson || !user) return;
        const now = Date.now();
        if (now - lastSync.current < 5000) return; // throttle to every 5s
        lastSync.current = now;
        const duration = v.duration || 0;
        const completion = duration > 0 ? Math.round((v.currentTime / duration) * 100) : 0;
        await trackView(completion, Math.round(v.currentTime));
    };

    if (loading) return <div className="flex justify-center py-24"><div className="h-8 w-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>;
    if (notFound) return <div className="py-24"><EmptyState icon={AlertCircle} title="الحصة غير موجودة" /></div>;
    if (accessDenied) return <div className="py-24"><EmptyState icon={Lock} title={accessMessage} /></div>;

    return (
        <div className="min-h-screen bg-slate-900 text-white">
            <div className="mx-auto max-w-5xl px-4 py-6">
                <Link to={backTo} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-white">
                    <ArrowRight className="h-4 w-4" /> العودة
                </Link>
                <div className="overflow-hidden rounded-2xl bg-black">
                    {lesson?.video_url && (driveVideoId || videoSrc) ? (
                        driveVideoId ? (
                            <iframe
                                src={`https://drive.google.com/file/d/${driveVideoId}/preview`}
                                title={lesson?.title || 'الفيديو'}
                                className="aspect-video w-full border-0"
                                allow="autoplay; encrypted-media"
                                allowFullScreen
                                onLoad={() => trackView(0, 0)}
                            />
                        ) : (
                            <video
                                ref={videoRef}
                                src={videoSrc}
                                controls
                                autoPlay
                                className="aspect-video w-full"
                                onPlay={() => trackView(0, Math.round(videoRef.current?.currentTime || 0))}
                                onTimeUpdate={handleTimeUpdate}
                                onEnded={() => trackView(100, Math.round(videoRef.current?.duration || 0))}
                            />
                        )
                    ) : (
                        <div className="flex aspect-video w-full items-center justify-center text-slate-400"><Play className="h-12 w-12" /></div>
                    )}
                </div>
                <div className="mt-5">
                    <h1 className="text-2xl font-bold">{lesson?.title}</h1>
                    {lesson?.description && <p className="mt-2 text-slate-300 leading-relaxed">{lesson.description}</p>}
                </div>
            </div>
        </div>
    );
}