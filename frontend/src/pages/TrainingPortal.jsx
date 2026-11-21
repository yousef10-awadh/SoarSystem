import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Sidebar from '../components/shared/Sidebar';
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Award, BarChart3, BookOpen, BookMarked, CheckCircle, Clock3, Download, Loader2,
  PlayCircle, ShieldCheck, Target, XCircle, Trophy,
} from 'lucide-react';

const views = {
  my_path: { title: 'مساري التدريبي', description: 'الدورات المخصصة لك وتقدمك المسجل.' },
  simulations: { title: 'محاكاة التصيد', description: 'نتائج الاختبارات التي سجلها النظام لحسابك.' },
  certificates: { title: 'شهاداتي', description: 'الشهادات التي حصلت عليها بعد اجتياز الدورات.' },
  achievements: { title: 'إنجازاتي', description: 'ملخص مرئي لتقدمك ونتائجك وشهاداتك.' },
};

export default function TrainingPortal() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('موظف');
  const [userRole, setUserRole] = useState('موظف');
  const [activeView, setActiveView] = useState('my_path');
  const [courses, setCourses] = useState([]);
  const [simulations, setSimulations] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyCourse, setBusyCourse] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadPortalData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [courseResponse, simulationResponse, certificateResponse] = await Promise.all([
        api.get('training/courses/'),
        api.get('training/simulations/'),
        api.get('training/certificates/'),
      ]);
      setCourses(courseResponse.data);
      setSimulations(simulationResponse.data);
      setCertificates(certificateResponse.data);
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        localStorage.clear();
        navigate('/login');
        return;
      }
      setError('تعذر تحميل بيانات بوابة التدريب. تأكد من اتصال الخادم ثم أعد المحاولة.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    const storedName = localStorage.getItem('first_name') || localStorage.getItem('username') || 'موظف';
    setUserName(storedName.split('@')[0]);
    const role = localStorage.getItem('role') || 'employee';
    setUserRole({ employee: 'موظف', trainer: 'مدرب', analyst: 'محلل أمني', admin: 'مسؤول النظام' }[role] || 'موظف');
    loadPortalData();
  }, [loadPortalData]);

  const completedCount = useMemo(() => courses.filter((course) => course.is_completed).length, [courses]);
  const progressPercent = courses.length ? Math.round((completedCount / courses.length) * 100) : 0;
  const inProgressCount = courses.filter((course) => course.progress_status === 'in_progress' && !course.is_completed).length;
  const averageScore = courses.length
    ? Math.round(courses.reduce((total, course) => total + Number(course.score || 0), 0) / courses.length)
    : 0;
  const achievementStatus = [
    { name: 'مكتملة', value: completedCount, color: '#10b981' },
    { name: 'قيد التقدم', value: inProgressCount, color: '#f59e0b' },
    { name: 'لم تبدأ', value: Math.max(courses.length - completedCount - inProgressCount, 0), color: '#cbd5e1' },
  ].filter((item) => item.value > 0);
  const scoreChart = courses.filter((course) => Number(course.score || 0) > 0)
    .map((course) => ({ name: course.title.length > 18 ? `${course.title.slice(0, 18)}…` : course.title, score: Number(course.score), passing: Number(course.passing_score) }));
  const monthlyCertificates = certificates.reduce((groups, certificate) => {
    const month = new Date(certificate.issued_at).toLocaleDateString('ar-SA', { month: 'short', year: '2-digit' });
    groups[month] = (groups[month] || 0) + 1;
    return groups;
  }, {});
  const certificateTrend = Object.entries(monthlyCertificates).map(([month, count]) => ({ month, count }));

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  const openCourse = async (course) => {
    setBusyCourse(course.id);
    setMessage('');
    setError('');
    try {
      if (!course.is_completed) await api.post(`training/courses/${course.id}/start/`);
      const launchPath = course.launch_path?.trim();
      if (launchPath && course.content_available) {
        const launchUrl = /^https?:\/\//i.test(launchPath)
          ? launchPath
          : `${api.defaults.baseURL.replace(/api\/$/, '')}${launchPath.replace(/^\//, '')}`;
        window.open(launchUrl, '_blank', 'noopener,noreferrer');
      } else {
        setMessage('بدأ تسجيل تقدمك. محتوى هذه الدورة لم يُرفق بعد.');
      }
      await loadPortalData();
    } catch {
      setError('تعذر بدء الدورة. حاول مرة أخرى.');
    } finally {
      setBusyCourse(null);
    }
  };

  const completeCourse = async (course) => {
    setError('');
    setMessage('');
    if (!course.questions?.length) {
      setError('لم يضف المدرب اختباراً لهذه الدورة بعد.');
      return;
    }
    setSelectedCourse(course);
    setAnswers({});
  };

  const submitQuiz = async (event) => {
    event.preventDefault();
    if (!selectedCourse) return;
    if (Object.keys(answers).length !== selectedCourse.questions.length) {
      setError('أجب عن جميع الأسئلة قبل إرسال الاختبار.');
      return;
    }
    const course = selectedCourse;
    setBusyCourse(course.id);
    setError('');
    setMessage('');
    try {
      const response = await api.post(`training/courses/${course.id}/submit_quiz/`, { answers });
      setMessage(response.data.passed
        ? `أحسنت! نتيجتك ${response.data.score}% واجتزت الدورة. أُضيفت شهادتك إلى صفحة شهاداتي.`
        : `نتيجتك ${response.data.score}%. تحتاج إلى ${response.data.passing_score}% على الأقل للاجتياز.`);
      setSelectedCourse(null);
      await loadPortalData();
    } catch {
      setError('تعذر حفظ نتيجة الدورة. حاول مرة أخرى.');
    } finally {
      setBusyCourse(null);
    }
  };

  const employeeNavItems = [
    { label: 'مساري التدريبي', icon: BookOpen, isActive: activeView === 'my_path', onClick: () => setActiveView('my_path') },
    { label: 'محاكاة التصيد', icon: Target, isActive: activeView === 'simulations', onClick: () => setActiveView('simulations') },
    { label: 'شهاداتي', icon: Award, isActive: activeView === 'certificates', onClick: () => setActiveView('certificates') },
    { label: 'إنجازاتي', icon: BarChart3, isActive: activeView === 'achievements', onClick: () => setActiveView('achievements') },
    ...(localStorage.getItem('is_staff') === 'true' || ['admin', 'analyst', 'trainer'].includes(localStorage.getItem('role'))
      ? [{ label: 'لوحة التحكم الأمنية', icon: ShieldCheck, isActive: false, onClick: () => navigate('/dashboard') }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-brand-bg flex font-cairo" dir="rtl">
      <Sidebar subtitle="بوابة التوعية الأمنية" userName={userName} userRole={userRole} navItems={employeeNavItems} onLogout={handleLogout} />
      <main className="flex-1 p-6 lg:p-12 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <header className="flex flex-wrap justify-between items-center gap-4 mb-8">
            <div>
              <p className="text-sm font-bold text-brand-primary mb-2">بوابة الموظف</p>
              <h1 className="text-3xl font-extrabold text-brand-text mb-2">أهلاً بك، {userName}</h1>
              <p className="text-brand-text/60">{views[activeView].description}</p>
            </div>
            <div className="bg-brand-surface border border-gray-100 px-5 py-4 rounded-2xl shadow-sm min-w-52">
              <div className="flex justify-between items-center gap-4 mb-3">
                <span className="text-sm font-bold text-brand-text/60">تقدمك في الدورات</span>
                <span className="text-lg font-extrabold text-brand-primary">{progressPercent}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden" dir="ltr">
                <div className="h-full bg-brand-primary rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="text-xs text-brand-text/50 mt-2">{completedCount} من {courses.length} دورات مكتملة</p>
            </div>
          </header>

          {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
          {message && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24"><Loader2 className="w-10 h-10 text-brand-primary animate-spin mb-4" /><p className="text-brand-text/50 font-bold">جاري تحميل بياناتك...</p></div>
          ) : (
            <section className="animate-in fade-in duration-300">
              <div className="mb-6">
                <h2 className="text-2xl font-extrabold text-brand-text">{views[activeView].title}</h2>
              </div>

              {activeView === 'my_path' && (
                courses.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {courses.map((course) => (
                      <article key={course.id} className="bg-brand-surface rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col">
                        <div className="flex justify-between items-start mb-5">
                          <div className={`p-3 rounded-2xl ${course.is_completed ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-primary/10 text-brand-primary'}`}>
                            {course.is_completed ? <CheckCircle className="w-6 h-6" /> : <BookMarked className="w-6 h-6" />}
                          </div>
                          <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-gray-50 text-brand-text/60">
                            {course.is_completed ? 'مكتملة' : course.progress_status === 'in_progress' ? 'قيد التقدم' : 'لم تبدأ'}
                          </span>
                        </div>
                        <h3 className="text-lg font-extrabold text-brand-text mb-2">{course.title}</h3>
                        <p className="text-xs text-brand-primary font-bold mb-2 flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" />{course.estimated_minutes || 15} دقيقة تقريبًا · {course.questions?.length || 0} أسئلة</p>
                        <p className="text-sm text-brand-text/60 leading-6 flex-1">{course.description}</p>
                        <div className="mt-5 mb-4">
                          <div className="flex justify-between text-xs font-bold text-brand-text/50 mb-2"><span>النتيجة الحالية</span><span>{course.is_completed ? 100 : course.score || 0}%</span></div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden" dir="ltr"><div className="h-full bg-brand-primary rounded-full" style={{ width: `${course.is_completed ? 100 : course.score || 0}%` }} /></div>
                          <p className="text-xs text-brand-text/40 mt-2">درجة الاجتياز: {course.passing_score}%</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => openCourse(course)} disabled={busyCourse === course.id} className="py-3 rounded-xl text-sm font-bold bg-brand-primary text-white hover:bg-brand-primary/90 disabled:opacity-60 flex items-center justify-center gap-2">
                            {busyCourse === course.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}{course.is_completed ? 'مراجعة' : 'ابدأ الدورة'}
                          </button>
                          <button type="button" onClick={() => completeCourse(course)} disabled={busyCourse === course.id || !course.questions?.length} className="py-3 rounded-xl text-sm font-bold bg-gray-50 border border-gray-200 text-brand-text hover:bg-gray-100 disabled:opacity-60">{course.is_completed ? 'إعادة الاختبار' : 'ابدأ الاختبار'}</button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <EmptyState icon={BookMarked} title="لا توجد دورات مخصصة لك" description="ستظهر هنا الدورات النشطة المخصصة لك أو لقسمك." />
              )}

              {activeView === 'simulations' && (
                simulations.length ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-800">نتائجك سرية وتظهر لك وحدك. يعرض النظام بيانات القسم للمدربين بصورة مجمعة دون أسماء.</div>
                    {simulations.map((simulation) => (
                      <article key={simulation.id} className="bg-brand-surface rounded-2xl p-5 border border-gray-100 flex items-start gap-4">
                        <div className={`p-3 rounded-xl ${simulation.result === 'reported' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{simulation.result === 'reported' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}</div>
                        <div className="flex-1"><div className="flex flex-wrap justify-between gap-2 mb-1"><h3 className="font-extrabold text-brand-text">{simulation.subject}</h3><span className="text-xs text-brand-text/50 flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" />{new Date(simulation.occurred_at).toLocaleDateString('ar-SA')}</span></div><p className="text-sm font-bold text-brand-primary">{simulation.result_label}</p>{simulation.note && <p className="text-sm text-brand-text/60 mt-2">{simulation.note}</p>}</div>
                      </article>
                    ))}
                  </div>
                ) : <EmptyState icon={Target} title="لا توجد نتائج محاكاة مسجلة" description="ستظهر نتائجك هنا بعد إطلاق حملة محاكاة وتسجيل تفاعلك فيها." />
              )}

              {activeView === 'certificates' && (
                certificates.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {certificates.map((certificate) => (
                      <article key={certificate.id} className="bg-brand-surface rounded-3xl p-6 border border-gray-100 shadow-sm">
                        <div className="flex items-start justify-between gap-3"><div className="p-3 rounded-2xl bg-amber-50 text-amber-600"><Award className="w-7 h-7" /></div><span className="text-sm font-extrabold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">اجتياز {certificate.score}%</span></div>
                        <h3 className="text-lg font-extrabold text-brand-text mt-5">{certificate.course_title}</h3>
                        <p className="text-sm text-brand-text/50 mt-2">تاريخ الإصدار: {new Date(certificate.issued_at).toLocaleDateString('ar-SA')}</p>
                        <p className="text-xs text-brand-text/40 mt-3">رقم الشهادة: {certificate.certificate_code}</p>
                        <button type="button" onClick={() => window.print()} className="mt-5 w-full py-3 rounded-xl border border-gray-200 text-sm font-bold text-brand-text hover:bg-gray-50 flex items-center justify-center gap-2"><Download className="w-4 h-4" />طباعة / حفظ الشهادة</button>
                      </article>
                    ))}
                  </div>
                ) : <EmptyState icon={Award} title="لم تصدر لك شهادات بعد" description="أكمل دورة واحصل على درجة الاجتياز المحددة لتظهر شهادتك هنا." />
              )}

              {activeView === 'achievements' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    <AchievementCard label="الدورات الكلية" value={courses.length} icon={BookOpen} tone="teal" />
                    <AchievementCard label="دورات مكتملة" value={completedCount} icon={CheckCircle} tone="green" />
                    <AchievementCard label="متوسط النتائج" value={`${averageScore}%`} icon={Trophy} tone="amber" />
                    <AchievementCard label="الشهادات" value={certificates.length} icon={Award} tone="violet" />
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                    <article className="xl:col-span-2 bg-brand-surface border border-gray-100 rounded-3xl p-6 shadow-sm">
                      <h3 className="font-extrabold text-brand-text">حالة مسارك التدريبي</h3>
                      <p className="text-xs text-brand-text/50 mt-1">توزيع الدورات حسب حالة الإنجاز</p>
                      <div className="h-64 mt-3" dir="ltr">
                        {courses.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={achievementStatus} dataKey="value" nameKey="name" innerRadius={67} outerRadius={94} paddingAngle={5} stroke="none">{achievementStatus.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip formatter={(value, name) => [`${value} دورة`, name]} /></PieChart></ResponsiveContainer> : <ChartEmpty />}
                      </div>
                      <div className="flex flex-wrap justify-center gap-4">{achievementStatus.map((entry) => <span key={entry.name} className="flex items-center gap-2 text-xs font-bold text-brand-text/60"><i className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />{entry.name}: {entry.value}</span>)}</div>
                    </article>

                    <article className="xl:col-span-3 bg-brand-surface border border-gray-100 rounded-3xl p-6 shadow-sm">
                      <h3 className="font-extrabold text-brand-text">نتائج الاختبارات</h3>
                      <p className="text-xs text-brand-text/50 mt-1">درجتك مقارنة بدرجة الاجتياز لكل دورة</p>
                      <div className="h-72 mt-5" dir="ltr">
                        {scoreChart.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={scoreChart} margin={{ top: 8, right: 8, left: -20, bottom: 35 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" /><XAxis dataKey="name" angle={-18} textAnchor="end" interval={0} tick={{ fontSize: 11, fill: '#64748b' }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} /><Tooltip formatter={(value, name) => [`${value}%`, name === 'score' ? 'نتيجتك' : 'درجة الاجتياز']} /><Bar dataKey="score" name="نتيجتك" fill="#0f9f83" radius={[7, 7, 0, 0]} /><Bar dataKey="passing" name="درجة الاجتياز" fill="#cbd5e1" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer> : <ChartEmpty label="ستظهر نتائج الاختبارات هنا بعد حلها." />}
                      </div>
                    </article>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <article className="bg-gradient-to-br from-teal-900 to-emerald-700 text-white rounded-3xl p-6 relative overflow-hidden">
                      <div className="relative flex justify-between items-start"><div><p className="text-sm text-white/70 font-bold">إنجازك العام</p><p className="text-5xl font-extrabold mt-3">{progressPercent}%</p><p className="text-sm text-white/70 mt-2">أكملت {completedCount} من أصل {courses.length} دورة متاحة</p></div><div className="p-3 rounded-2xl bg-white/10"><Trophy className="w-7 h-7" /></div></div>
                      <div className="mt-6 h-2 rounded-full bg-white/15 overflow-hidden"><div className="h-full rounded-full bg-emerald-300" style={{ width: `${progressPercent}%` }} /></div>
                    </article>
                    <article className="bg-brand-surface border border-gray-100 rounded-3xl p-6 shadow-sm">
                      <h3 className="font-extrabold text-brand-text">الشهادات عبر الوقت</h3>
                      <p className="text-xs text-brand-text/50 mt-1">عدد الشهادات الصادرة لكل شهر</p>
                      <div className="h-44 mt-3" dir="ltr">
                        {certificateTrend.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={certificateTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" /><XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} /><Tooltip formatter={(value) => [`${value} شهادة`, 'الصادرة']} /><Bar dataKey="count" fill="#8b5cf6" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer> : <ChartEmpty label="أكمل دورة بنجاح لتظهر شهادتك في هذا الرسم." />}
                      </div>
                    </article>
                  </div>
                </div>
              )}
            </section>
          )}

          {selectedCourse && (
            <div className="fixed inset-0 z-50 bg-slate-950/50 p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="quiz-title">
              <form onSubmit={submitQuiz} className="bg-brand-surface w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 md:p-8 shadow-2xl">
                <div className="mb-6"><p className="text-sm text-brand-primary font-bold">اختبار الدورة</p><h2 id="quiz-title" className="text-2xl font-extrabold text-brand-text mt-1">{selectedCourse.title}</h2><p className="text-sm text-brand-text/50 mt-2">أجب عن جميع الأسئلة. درجة الاجتياز {selectedCourse.passing_score}%.</p></div>
                <div className="space-y-6">
                  {selectedCourse.questions.map((question, index) => (
                    <fieldset key={question.id} className="border-b border-gray-100 pb-5">
                      <legend className="font-bold text-brand-text mb-3">{index + 1}. {question.prompt}</legend>
                      {['a', 'b', 'c', 'd'].map((option) => (
                        <label key={option} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer text-sm text-brand-text">
                          <input type="radio" name={`question-${question.id}`} value={option} checked={answers[question.id] === option} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))} />
                          {question[`option_${option}`]}
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
                <div className="flex gap-3 mt-6"><button type="button" onClick={() => setSelectedCourse(null)} className="flex-1 py-3 rounded-xl border border-gray-200 font-bold">إلغاء</button><button type="submit" disabled={busyCourse === selectedCourse.id} className="flex-1 py-3 rounded-xl bg-brand-primary text-white font-bold disabled:opacity-60">{busyCourse === selectedCourse.id ? 'جاري التصحيح...' : 'إرسال الإجابات'}</button></div>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return <div className="bg-brand-surface border border-gray-100 rounded-3xl p-10 text-center"><div className="mx-auto w-14 h-14 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center mb-4"><Icon className="w-7 h-7" /></div><h3 className="font-extrabold text-brand-text mb-2">{title}</h3><p className="text-sm text-brand-text/55">{description}</p></div>;
}

function AchievementCard({ label, value, icon: Icon, tone }) {
  const tones = {
    teal: 'bg-teal-50 text-teal-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
  };
  return <article className="bg-brand-surface border border-gray-100 rounded-2xl p-5 shadow-sm"><div className="flex justify-between items-start"><div><p className="text-xs font-bold text-brand-text/50">{label}</p><p className="text-3xl font-extrabold text-brand-text mt-2">{value}</p></div><span className={`p-3 rounded-xl ${tones[tone]}`}><Icon className="w-5 h-5" /></span></div></article>;
}

function ChartEmpty({ label = 'لا توجد بيانات كافية لعرض الرسم بعد.' }) {
  return <div className="h-full flex items-center justify-center text-center text-sm text-brand-text/45">{label}</div>;
}
