import React from 'react';
import { GraduationCap } from 'lucide-react';
import { GRADES } from '@/lib/grades';

export function getContentGrade(item, courses = []) {
  if (!item) return '';
  if (item.target_grade && item.target_grade !== 'all') return item.target_grade;
  if (item.course_id) {
    const course = courses.find((c) => String(c.id) === String(item.course_id));
    if (course?.target_grade && course.target_grade !== 'all') return course.target_grade;
  }
  return '';
}

export function matchesTeacherGrade(item, selectedGrade, courses = []) {
  if (!selectedGrade || selectedGrade === 'all') return true;
  return getContentGrade(item, courses) === selectedGrade;
}

export default function TeacherGradeFilter({ value, onChange, counts = {}, className = '' }) {
  return (
    <div className={`mb-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ${className}`} dir="rtl">
      <div className="mb-2 flex items-center gap-2 px-1 text-sm font-black text-slate-700">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
          <GraduationCap className="h-4 w-4" />
        </span>
        <span>اختر الصف الدراسي</span>
        <span className="text-xs font-normal text-slate-400">لعرض محتوى هذا الصف فقط</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => onChange('all')}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black transition ${value === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          كل الصفوف{counts.all != null ? ` (${counts.all})` : ''}
        </button>
        {GRADES.map((grade) => (
          <button
            key={grade}
            type="button"
            onClick={() => onChange(grade)}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black transition ${value === grade ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {grade}{counts[grade] != null ? ` (${counts[grade]})` : ''}
          </button>
        ))}
      </div>
    </div>
  );
}
