import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Sidebar from '../components/shared/Sidebar';
import {
  ArrowRight, BookOpen, CheckCircle, CirclePlus, ClipboardList, Loader2,
  Pencil, Plus, Save, ShieldCheck, Trash2,
} from 'lucide-react';

const blankQuestion = () => ({ prompt: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'a', order: 0 });
const blankCourse = () => ({ title: '', description: '', passing_score: 70, estimated_minutes: 15, launch_path: '', target_ou: '', is_active: true, questions: [blankQuestion()] });

export default function CourseManagement() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(blankCourse);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('training/courses/');
      setCourses(response.data);
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        localStorage.clear();
        navigate('/login');
      } else setError('تعذر جلب الدورات. تأكد من تشغيل الخادم والترحيلات.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    const role = localStorage.getItem('role');
    if (localStorage.getItem('is_staff') !== 'true' && !['admin', 'trainer', 'analyst'].includes(role)) {
      navigate('/training', { replace: true });
      return;
    }
    loadCourses();
  }, [loadCourses, navigate]);

  const updateQuestion = (index, field, value) => {
    setForm((current) => ({ ...current, questions: current.questions.map((question, questionIndex) => questionIndex === index ? { ...question, [field]: value } : question) }));
  };

  const resetForm = () => {
    setForm(blankCourse());
    setEditingId(null);
  };

  const editCourse = (course) => {
    setEditingId(course.id);
    setForm({
      title: course.title,
      description: course.description,
      passing_score: course.passing_score,
      estimated_minutes: course.estimated_minutes,
      launch_path: course.launch_path || '',
      target_ou: course.target_ou || '',
      is_active: course.is_active,
      questions: course.questions?.length ? course.questions.map((question, index) => ({ ...question, order: index })) : [blankQuestion()],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submitCourse = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const validQuestions = form.questions.filter((question) => question.prompt.trim() && question.option_a.trim() && question.option_b.trim() && question.option_c.trim() && question.option_d.trim());
    if (!validQuestions.length) {
      setError('أضف سؤالاً واحداً على الأقل وأكمل خياراته الأربعة.');
      return;
    }
    const payload = { ...form, questions: validQuestions.map((question, index) => ({ ...question, order: index })) };
    setSaving(true);
    try {
      if (editingId) await api.patch(`training/courses/${editingId}/`, payload);
      else await api.post('training/courses/', payload);
      setNotice(editingId ? 'تم تحديث الدورة وأسئلتها.' : 'تمت إضافة الدورة، وستظهر للموظفين ضمن مساراتهم التدريبية.');
      resetForm();
      await loadCourses();
    } catch (requestError) {
      const data = requestError.response?.data;
      if (requestError.response?.status === 403) {
        setError('الخادم رفض الصلاحية لهذا الحساب. سجّل الخروج وادخل بحساب مدير أو مدرب، وتأكد أن دور المستخدم admin أو trainer في قاعدة البيانات.');
      } else if (requestError.response?.status === 400 && data && typeof data === 'object') {
        const details = Object.entries(data).map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join('، ') : String(messages)}`).join(' | ');
        setError(`راجع بيانات الدورة: ${details}`);
      } else {
        setError(typeof data === 'string' ? data : `تعذر حفظ الدورة${requestError.response?.status ? ` (HTTP ${requestError.response.status})` : ''}. ${data?.detail || 'تأكد من الاتصال بالخادم.'}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleCourse = async (course) => {
    try {
      await api.patch(`training/courses/${course.id}/`, { is_active: !course.is_active });
      await loadCourses();
    } catch {
      setError('تعذر تحديث حالة الدورة.');
    }
  };

  const adminNavItems = [
    { label: 'إدارة الدورات', icon: BookOpen, isActive: true, onClick: () => navigate('/admin/courses') },
    { label: 'لوحة الأمن', icon: ShieldCheck, isActive: false, onClick: () => navigate('/dashboard') },
    { label: 'بوابة الموظف', icon: ArrowRight, isActive: false, onClick: () => navigate('/training') },
  ];

  return (
    <div className="min-h-screen bg-brand-bg flex font-cairo" dir="rtl">
      <Sidebar subtitle="إدارة التدريب" userName={localStorage.getItem('first_name') || localStorage.getItem('username') || 'مدير'} userRole="مدير التدريب" navItems={adminNavItems} onLogout={() => { localStorage.clear(); navigate('/login'); }} />
      <main className="flex-1 p-6 lg:p-10 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-7">
          <header><p className="text-sm font-bold text-brand-primary mb-2">إدارة المحتوى التدريبي</p><h1 className="text-3xl font-extrabold text-brand-text">الدورات والاختبارات</h1><p className="text-brand-text/60 mt-2">أضف دورة وأسئلتها، وستظهر مباشرة للموظفين المستهدفين.</p></header>
          {error && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 font-bold">{error}</div>}
          {notice && <div role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-700 font-bold">{notice}</div>}

          <form onSubmit={submitCourse} className="bg-brand-surface rounded-3xl border border-gray-100 p-6 lg:p-8 shadow-sm space-y-6">
            <div className="flex items-center gap-3"><div className="p-3 bg-brand-primary/10 text-brand-primary rounded-xl"><CirclePlus className="w-6 h-6" /></div><div><h2 className="text-xl font-extrabold text-brand-text">{editingId ? 'تعديل الدورة' : 'إضافة دورة جديدة'}</h2><p className="text-xs text-brand-text/50 mt-1">الحقول ذات النجمة مطلوبة</p></div></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="عنوان الدورة *"><input required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} placeholder="مثال: اكتشاف رسائل التصيد" /></Field>
              <Field label="القسم المستهدف"><input value={form.target_ou} onChange={(event) => setForm({ ...form, target_ou: event.target.value })} className={inputClass} placeholder="اتركه فارغاً لجميع الموظفين" /></Field>
              <Field label="درجة الاجتياز (%)"><input type="number" min="0" max="100" value={form.passing_score} onChange={(event) => setForm({ ...form, passing_score: Number(event.target.value) })} className={inputClass} /></Field>
              <Field label="المدة التقريبية (دقيقة)"><input type="number" min="1" max="600" value={form.estimated_minutes} onChange={(event) => setForm({ ...form, estimated_minutes: Number(event.target.value) })} className={inputClass} /></Field>
              <Field label="وصف الدورة"><textarea required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${inputClass} min-h-12`} rows="2" /></Field>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><ClipboardList className="w-5 h-5 text-brand-primary" /><h3 className="font-extrabold text-brand-text">أسئلة الاختبار</h3></div><button type="button" onClick={() => setForm((current) => ({ ...current, questions: [...current.questions, blankQuestion()] }))} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary/10 text-brand-primary text-sm font-bold"><Plus className="w-4 h-4" />إضافة سؤال</button></div>
              {form.questions.map((question, index) => (
                <section key={index} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 space-y-3">
                  <div className="flex justify-between items-center"><h4 className="font-bold text-brand-text">السؤال {index + 1}</h4>{form.questions.length > 1 && <button type="button" aria-label="حذف السؤال" onClick={() => setForm((current) => ({ ...current, questions: current.questions.filter((_, questionIndex) => questionIndex !== index) }))} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>}</div>
                  <input value={question.prompt} onChange={(event) => updateQuestion(index, 'prompt', event.target.value)} className={inputClass} placeholder="اكتب السؤال" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {['a', 'b', 'c', 'd'].map((option) => <div key={option} className="flex items-center gap-2"><input type="radio" name={`correct-${index}`} checked={question.correct_option === option} onChange={() => updateQuestion(index, 'correct_option', option)} aria-label={`الخيار ${option} هو الإجابة الصحيحة`} /><input value={question[`option_${option}`]} onChange={(event) => updateQuestion(index, `option_${option}`, event.target.value)} className={inputClass} placeholder={`الخيار ${option.toUpperCase()}${question.correct_option === option ? ' — الصحيح' : ''}`} /></div>)}
                  </div>
                </section>
              ))}
            </div>
            <label className="flex items-center gap-3 text-sm font-bold text-brand-text"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />نشر الدورة للموظفين فور الحفظ</label>
            <div className="flex gap-3"><button type="submit" disabled={saving} className="flex-1 md:flex-none px-7 py-3 rounded-xl bg-brand-primary text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{editingId ? 'حفظ التعديلات' : 'إنشاء الدورة'}</button>{editingId && <button type="button" onClick={resetForm} className="px-6 py-3 rounded-xl border border-gray-200 font-bold">إلغاء التعديل</button>}</div>
          </form>

          <section className="bg-brand-surface rounded-3xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5"><BookOpen className="w-5 h-5 text-brand-primary" /><h2 className="text-xl font-extrabold text-brand-text">الدورات المسجلة</h2></div>
            {loading ? <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-brand-primary" /></div> : courses.length ? <div className="space-y-3">{courses.map((course) => <article key={course.id} className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-gray-100"><div><h3 className="font-bold text-brand-text">{course.title}</h3><p className="text-xs text-brand-text/50 mt-1">{course.questions?.length || 0} أسئلة · اجتياز {course.passing_score}% · {course.target_ou || 'جميع الأقسام'}</p></div><div className="flex items-center gap-2"><span className={`text-xs font-bold px-3 py-1.5 rounded-full ${course.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{course.is_active ? 'منشورة' : 'مسودة'}</span><button type="button" onClick={() => editCourse(course)} className="p-2 rounded-lg text-brand-primary hover:bg-brand-primary/10" aria-label="تعديل الدورة"><Pencil className="w-4 h-4" /></button><button type="button" onClick={() => toggleCourse(course)} className="text-xs font-bold px-3 py-2 rounded-lg border border-gray-200">{course.is_active ? 'إيقاف النشر' : 'نشر'}</button></div></article>)}</div> : <p className="text-sm text-brand-text/50 py-5">لا توجد دورات مضافة بعد.</p>}
          </section>
        </div>
      </main>
    </div>
  );
}

const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-brand-text outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10';

function Field({ label, children }) {
  return <label className="block space-y-2"><span className="text-sm font-bold text-brand-text/75">{label}</span>{children}</label>;
}
