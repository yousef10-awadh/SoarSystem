import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import Sidebar from '../components/shared/Sidebar';
import { ArrowRight, CalendarClock, Loader2, MailWarning, Plus, Save, ShieldCheck, Users } from 'lucide-react';

const emptyForm = { name: '', target_department_name: '', email_subject: '', email_template_body: '', scheduled_date: '', status: 'draft' };

export default function CampaignManagement() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [campaigns, setCampaigns] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [simulating, setSimulating] = useState(null);
  const [testRecipient, setTestRecipient] = useState('yousefawadh10@gmail.com');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignResponse, metricsResponse] = await Promise.all([
        api.get('phishing/campaigns/'),
        api.get('phishing/campaign-metrics/'),
      ]);
      setCampaigns(campaignResponse.data);
      setMetrics(metricsResponse.data);
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        localStorage.clear();
        navigate('/login');
      } else if (requestError.response?.status === 403) {
        setError('تحتاج إلى حساب مسؤول لإنشاء الحملات. سجّل الخروج وادخل بحساب المدير.');
      } else setError('تعذر تحميل الحملات. تأكد من تشغيل الخلفية وتطبيق الترحيلات.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { loadData(); }, [loadData]);

  const saveCampaign = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        scheduled_date: form.scheduled_date ? new Date(form.scheduled_date).toISOString() : null,
      };
      await api.post('phishing/campaigns/', payload);
      setForm(emptyForm);
      setMessage('تم حفظ الحملة كمسودة. لم تُرسل رسائل؛ استخدم «إرسال الحملة» بعد إعداد SMTP ومعاينة القسم.');
      await loadData();
    } catch (requestError) {
      const data = requestError.response?.data;
      const detail = data && typeof data === 'object'
        ? Object.entries(data).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join('، ') : String(value)}`).join(' | ')
        : data?.detail || data;
      setError(detail ? `تعذر حفظ الحملة: ${detail}` : 'تعذر حفظ الحملة. تحقق من صلاحية الحساب والحقول.');
    } finally {
      setSaving(false);
    }
  };

  const sendTestEmail = async (campaignId) => {
    setSimulating(`${campaignId}-email`);
    setError('');
    setMessage('');
    try {
      const response = await api.post(`phishing/campaigns/${campaignId}/send-test/`, { recipient_email: testRecipient });
      setMessage(`${response.data.message}${response.data.mailpit_url ? ' افتح Mailpit لمشاهدة الرسالة.' : ''}`);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'تعذر إرسال رسالة الاختبار إلى Mailpit.');
    } finally {
      setSimulating(null);
    }
  };

  const assignCampaignDepartment = async (campaign) => {
    const departmentName = window.prompt('اكتب اسم القسم كما يظهر في حسابات الموظفين المستهدفين:');
    if (!departmentName?.trim()) return;
    setSimulating(`${campaign.id}-department`);
    setError('');
    setMessage('');
    try {
      await api.patch(`phishing/campaigns/${campaign.id}/`, { target_department_name: departmentName.trim() });
      setMessage(`تم ربط الحملة بقسم «${departmentName.trim()}».`);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.target_department_name?.[0] || requestError.response?.data?.detail || 'تعذر تحديث القسم المستهدف.');
    } finally {
      setSimulating(null);
    }
  };

  const launchCampaign = async (campaign) => {
    setSimulating(`${campaign.id}-launch`);
    setError('');
    setMessage('');
    try {
      const preview = await api.get(`phishing/campaigns/${campaign.id}/delivery-preview/`);
      const { recipient_count, recipient_domain, department } = preview.data;
      const approved = window.confirm(
        `سيتم إرسال «${campaign.email_subject}» إلى ${recipient_count} موظفًا من قسم ${department} (${recipient_domain.join(', ')}). هل تريد المتابعة؟`
      );
      if (!approved) return;
      const response = await api.post(`phishing/campaigns/${campaign.id}/launch/`, { confirm: true });
      setMessage(`انتهى الإرسال: وصل إلى ${response.data.sent} مستلم، وتعذر على ${response.data.failed}. النقرات والبلاغات تُجمع على مستوى القسم.`);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'تعذر إرسال الحملة. تحقق من إعدادات SMTP والقسم المستهدف.');
    } finally {
      setSimulating(null);
    }
  };

  const navItems = [
    { label: 'إدارة الحملات', icon: MailWarning, isActive: true, onClick: () => navigate('/admin/campaigns') },
    { label: 'لوحة الأمن', icon: ShieldCheck, isActive: false, onClick: () => navigate('/dashboard') },
    { label: 'إدارة الدورات', icon: Users, isActive: false, onClick: () => navigate('/admin/courses') },
    { label: 'بوابة الموظف', icon: ArrowRight, isActive: false, onClick: () => navigate('/training') },
  ];

  const statusLabel = { draft: 'مسودة', scheduled: 'مجدولة', running: 'قيد التشغيل', completed: 'مكتملة' };

  return (
    <div className="min-h-screen bg-brand-bg flex font-cairo" dir="rtl">
      <Sidebar subtitle="إدارة حملات التوعية" userName={localStorage.getItem('first_name') || localStorage.getItem('username') || 'مسؤول'} userRole="مسؤول" navItems={navItems} onLogout={() => { localStorage.clear(); navigate('/login'); }} />
      <main className="flex-1 p-6 lg:p-10 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-7">
          <header><p className="text-sm font-bold text-brand-primary mb-2">تدريب أمني مصرح به</p><h1 className="text-3xl font-extrabold text-brand-text">إدارة حملات التصيّد</h1><p className="text-brand-text/60 mt-2">اختبر الإرسال محليًا عبر Mailpit، أو أرسل لقسم محدد بعد ضبط SMTP ونطاقات المؤسسة المسموح بها.</p></header>

          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold text-sky-950">اختبار إعداد البريد</h2><p className="text-sm text-sky-900/70 mt-1">Mailpit يحفظ الرسائل محليًا. وفي وضع SMTP، يسمح فقط بعنوان اختبار مدرج صراحةً في الإعدادات.</p></div><a href="http://localhost:8025" target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-white border border-sky-200 text-sky-900 text-sm font-bold">فتح Mailpit</a></div><div className="max-w-md mt-4"><Field label="عنوان البريد الاختباري"><input type="email" required value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} className={inputClass} /></Field></div></div>

          {error && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 font-bold">{error}</div>}
          {message && <div role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-700 font-bold">{message}</div>}

          <form onSubmit={saveCampaign} className="bg-brand-surface rounded-3xl border border-gray-100 p-6 lg:p-8 shadow-sm space-y-5">
            <div className="flex items-center gap-3"><div className="p-3 rounded-xl bg-brand-primary/10 text-brand-primary"><Plus className="w-6 h-6" /></div><div><h2 className="text-xl font-extrabold text-brand-text">إنشاء حملة تجريبية</h2><p className="text-xs text-brand-text/50 mt-1">يمكنك استخدام قسم تجريبي حتى قبل إضافة الموظفين.</p></div></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="اسم الحملة"><input required maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="مثال: توعية الفواتير" /></Field>
              <Field label="القسم المستهدف *"><input required value={form.target_department_name} onChange={(e) => setForm({ ...form, target_department_name: e.target.value })} className={inputClass} placeholder="اكتب اسم قسم الموظفين كما هو في حساباتهم" /></Field>
              <Field label="عنوان الرسالة"><input required maxLength={255} value={form.email_subject} onChange={(e) => setForm({ ...form, email_subject: e.target.value })} className={inputClass} placeholder="يرجى مراجعة الفاتورة" /></Field>
              <Field label="موعد الحملة (اختياري)"><input type="datetime-local" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} className={inputClass} /></Field>
              <Field label="نص قالب الرسالة"><textarea required rows="5" value={form.email_template_body} onChange={(e) => setForm({ ...form, email_template_body: e.target.value })} className={`${inputClass} md:col-span-2`} placeholder="اكتب نص المحاكاة التوعوية التجريبية هنا" /></Field>
              <Field label="الحالة"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}><option value="draft">مسودة</option><option value="scheduled">مجدولة</option></select></Field>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-800">الحفظ لا يرسل بريداً ولا يبدأ الحملة؛ هذه المرحلة لإعدادها فقط.</div>
            <button type="submit" disabled={saving} className="px-7 py-3 rounded-xl bg-brand-primary text-white font-bold flex items-center gap-2 disabled:opacity-60">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}حفظ الحملة</button>
          </form>

          <section className="bg-brand-surface rounded-3xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5"><CalendarClock className="w-5 h-5 text-brand-primary" /><h2 className="text-xl font-extrabold text-brand-text">الحملات المحفوظة ومقاييس الأقسام</h2></div>
            {loading ? <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-brand-primary" /></div> : campaigns.length ? <div className="space-y-3">{campaigns.map((campaign) => {
              const campaignMetrics = metrics.find((item) => item.campaign === campaign.id);
              return (
                <article key={campaign.id} className="rounded-2xl border border-gray-100 p-5">
                  <div className="flex flex-wrap justify-between gap-3">
                    <div><h3 className="font-extrabold text-brand-text">{campaign.name}</h3><p className="text-sm text-brand-text/55 mt-1">{campaign.email_subject} · {campaign.department_name || campaign.target_ou || 'بلا قسم محدد'}</p>{campaign.scheduled_date && <p className="text-xs text-brand-text/45 mt-2">الموعد: {new Date(campaign.scheduled_date).toLocaleString('ar-SA')}</p>}</div>
                    <span className="h-fit px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">{statusLabel[campaign.status] || campaign.status}</span>
                  </div>
                  <div className="mt-4 rounded-2xl border border-dashed border-sky-200 bg-sky-50/60 p-4">
                    {!campaign.department_name && <div className="mb-3"><p className="text-sm text-amber-800 mb-2">هذه الحملة محفوظة بلا قسم، لذلك لن يمكن إرسالها حتى تحدد القسم.</p><button type="button" onClick={() => assignCampaignDepartment(campaign)} disabled={Boolean(simulating)} className="px-4 py-2 rounded-xl border border-amber-300 bg-white text-amber-900 text-sm font-bold disabled:opacity-50">{simulating === `${campaign.id}-department` ? 'جارٍ تحديث القسم…' : 'تحديد القسم لهذه الحملة'}</button></div>}
                    <button type="button" onClick={() => sendTestEmail(campaign.id)} disabled={Boolean(simulating) || !testRecipient.includes('@')} className="mt-3 px-4 py-2.5 rounded-xl bg-sky-900 text-white text-sm font-bold disabled:opacity-50">{simulating === `${campaign.id}-email` ? 'جاري إرسال الاختبار…' : 'إرسال رسالة اختبار'}</button>
                  </div>
                  <div className="mt-3"><p className="text-xs font-bold text-brand-text/50 mb-2">مقاييس فعلية مجمعة على مستوى القسم؛ فتح الرسالة غير محسوب</p><div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{[['مرسلة', campaignMetrics?.total_sent || 0], ['نقرات رابط التوعية', campaignMetrics?.total_clicked || 0], ['مُبلّغ عنها', campaignMetrics?.total_reported || 0]].map(([label, value]) => <div key={label} className="rounded-xl bg-gray-50 p-3"><p className="text-[11px] text-brand-text/50">{label}</p><p className="text-lg font-extrabold text-brand-text mt-1">{value}</p></div>)}</div></div>
                  {campaign.status !== 'completed' && <button type="button" onClick={() => launchCampaign(campaign)} disabled={Boolean(simulating)} className="mt-4 px-5 py-3 rounded-xl bg-brand-primary text-white text-sm font-bold disabled:opacity-50">{simulating === `${campaign.id}-launch` ? 'جاري مراجعة المستلمين…' : 'معاينة وإرسال الحملة للقسم'}</button>}
                </article>
              );
            })}</div> : <p className="text-sm text-brand-text/50 py-5">لا توجد حملات بعد.</p>}
          </section>
        </div>
      </main>
    </div>
  );
}

const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-brand-text outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10';
function Field({ label, children }) { return <label className="block space-y-2"><span className="text-sm font-bold text-brand-text/75">{label}</span>{children}</label>; }
