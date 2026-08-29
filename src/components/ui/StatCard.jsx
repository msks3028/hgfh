import React from 'react';
import { cn } from '@/lib/utils';

export default function StatCard({ icon: Icon, label, value, hint, tone = 'default' }) {
    const tones = {
        default: 'bg-white text-slate-900 border-slate-200',
        blue: 'bg-blue-50 text-blue-900 border-blue-200',
        green: 'bg-emerald-50 text-emerald-900 border-emerald-200',
        amber: 'bg-amber-50 text-amber-900 border-amber-200',
        violet: 'bg-violet-50 text-violet-900 border-violet-200',
    };
    const iconTones = {
        default: 'bg-slate-100 text-slate-600',
        blue: 'bg-blue-100 text-blue-600',
        green: 'bg-emerald-100 text-emerald-600',
        amber: 'bg-amber-100 text-amber-600',
        violet: 'bg-violet-100 text-violet-600',
    };
    return (
        <div className={cn('rounded-2xl border p-5 shadow-sm transition hover:shadow-md', tones[tone])}>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-500 truncate">{label}</p>
                    <p className="mt-1 text-3xl font-extrabold tracking-tight">{value}</p>
                    {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
                </div>
                {Icon && (
                    <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', iconTones[tone])}>
                        <Icon className="h-6 w-6" />
                    </div>
                )}
            </div>
        </div>
    );
}