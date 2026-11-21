import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import api from '../api/axios';
import {
  RefreshCw, LogOut, ShieldCheck, MailWarning, FileSearch, Search, X, 
  LayoutGrid, CheckCircle, BarChart3, Loader2, ArrowRight, FileText, Printer, UserCheck, BookPlus
} from 'lucide-react';
import Sidebar from '../components/shared/Sidebar'; // أضف هذا السطر
import { BookOpen } from 'lucide-react'; // أيقونة لزر التدريب
// استيراد المكونات المشتركة
import { StatCard } from '../components/shared/StatCard';
import { StatusBadge } from '../components/shared/StatusBadge';
import Statistics from '../components/Statistics';

function mapEmailReport(report) {
  return {
    ...report,
    record_source: 'email',
    target: report.sender_email,
    scan_type: 'n8n / VirusTotal',
    output_data: report.analyst_notes || report.email_body || '',
    status: 'SUCCESS',
    created_at: report.reported_at || report.email_date,
  };
}

function getReportDomains(report) {
  if (!report) return [];
  const domains = new Set();
  const body = String(report.email_body || '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ');
  for (const rawUrl of body.match(/https?:\/\/[^\s<>"')\]]+/gi) || []) {
    try { domains.add(new URL(rawUrl.replace(/[.,;!?]+$/, '')).hostname.toLowerCase()); } catch { /* Ignore malformed links. */ }
  }
  for (const match of body.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,63}\b/gi) || []) domains.add(match.toLowerCase());
  const isReservedExample = (domain) => ['example.com', 'example.net', 'example.org'].some(root => domain === root || domain.endsWith(`.${root}`));
  return [...domains].filter(domain => domain.includes('.') && !isReservedExample(domain) && !['.example', '.test', '.invalid', '.local', '.internal', '.localhost'].some(suffix => domain.endsWith(suffix))).sort();
}

export default function MainDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const hasAutoScanned = useRef(false);

  // ==========================================
  // 1. إدارة الحالات (State Management)
  // ==========================================
  
  // الحالة المسؤولة عن تبديل الشاشات: 'overview', 'statistics', 'new', 'toolSelect', 'history', 'report'
  const [activeView, setActiveView] = useState(location.state?.view || 'overview');
  
  // بيانات النظام والمستخدم
  const [userName, setUserName] = useState('محلل الأمن');
  const [reports, setReports] = useState([]);
  const [emailReports, setEmailReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);
  const [runningReportTool, setRunningReportTool] = useState('');
  const [reportToolError, setReportToolError] = useState('');

  // حالات شاشة "الفحص السريع" في النظرة العامة
  const [quickSearchTarget, setQuickSearchTarget] = useState('');
  const [quickSearchType, setQuickSearchType] = useState('email'); 

  // حالات شاشة "الفحص الجديد" المتقدم
  const [target, setTarget] = useState('');
  const [scanOption, setScanOption] = useState('wf_step1'); 
  const [hiddenData, setHiddenData] = useState(null);
  const [isScanning, setIsScanning] = useState(false);

  // ==========================================
  // 2. الدوال والمؤثرات (Effects & Functions)
  // ==========================================

  const fetchReports = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [scanResult, emailResult] = await Promise.allSettled([
        axios.get('http://127.0.0.1:8000/api/phishing/scan-reports/', { headers }),
        axios.get('http://127.0.0.1:8000/api/phishing/reports/', { headers })
      ]);

      if (scanResult.status === 'fulfilled') {
        setReports(scanResult.value.data);
      } else {
        setReports([]);
      }

      if (emailResult.status === 'fulfilled') {
        const data = emailResult.value.data;
        const rows = Array.isArray(data) ? data : (data.results || []);
        setEmailReports(rows.map(mapEmailReport));
      } else {
        setEmailReports([]);
      }

      const error = scanResult.status === 'rejected' ? scanResult.reason : emailResult.status === 'rejected' ? emailResult.reason : null;
      if (error?.response?.status === 401) navigate('/login');
      return scanResult.status === 'fulfilled' ? scanResult.value.data : [];
    } catch (error) {
      if (error.response && error.response.status === 401) navigate('/login');
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedName = localStorage.getItem('first_name') || localStorage.getItem('username') || 'محلل الأمن';
    setUserName(storedName);
    fetchReports();
  }, []);

  // دالة الفحص (موحدة وتعمل من الشاشتين)
  const runScan = async (overrideTarget = null, overrideOption = null, overrideHidden = null) => {
    const finalTarget = typeof overrideTarget === 'string' ? overrideTarget : target;
    const finalOption = typeof overrideOption === 'string' ? overrideOption : scanOption;
    const finalHidden = typeof overrideHidden === 'string' ? overrideHidden : hiddenData;

    if (!finalTarget) return alert("الرجاء إدخال الهدف أولاً");
    
    setIsScanning(true);
    setActiveView('new'); // التأكد من عرض شاشة التحميل
    
    try {
      const token = localStorage.getItem('access_token');
      const scanResponse = await axios.post('http://127.0.0.1:8000/api/phishing/run-scan/', 
        { target: finalTarget, scan_option: finalOption, hidden_data: finalHidden }, 
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTarget(finalTarget);
      
      const updatedReports = await fetchReports();
      const createdReport = updatedReports.find(report => report.id === scanResponse.data.report_id) || updatedReports[0];
      if (createdReport) {
        setSelectedReport(createdReport);
        setActiveView('report');
      }
    } catch (error) {
      alert(error.response?.data?.error || "حدث خطأ أثناء الفحص.");
      setActiveView('history');
    } finally {
      setIsScanning(false);
    }
  };

  // معالجة الفحص السريع من شاشة "نظرة عامة"
  const handleQuickScan = () => {
    if (!quickSearchTarget.trim()) return alert("الرجاء إدخال بريد إلكتروني أو دومين للفحص.");
    
    const mappedOption = quickSearchType === 'email' ? 'wf_step2' : '1';
    
    // تحديث البيانات داخلياً
    setTarget(quickSearchTarget);
    setScanOption(mappedOption);
    setActiveView('new'); // تبديل الشاشة داخلياً بدون تغيير السايدبار
    
    // تشغيل الفحص
    runScan(quickSearchTarget, mappedOption, null);
  };

  // دالة تحديث حالة البلاغ (تأكيد الحظر / تجاهل)
  const updateStatus = async (id, newStatus) => {
    try {
      const token = localStorage.getItem('access_token');
      await axios.patch(`http://127.0.0.1:8000/api/phishing/reports/${id}/`, 
        { analysis_status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchReports();
      alert('تم تحديث حالة التقرير بنجاح.');
      setActiveView('history');
    } catch (err) {
      alert('تعذر تحديث حالة البلاغ');
    }
  };

  const runReportAnalysis = async (tool, domain = '') => {
    if (!selectedReport?.id) return;
    const runKey = domain ? `${tool}:${domain}` : tool;
    setRunningReportTool(runKey);
    setReportToolError('');
    try {
      const response = await api.post(`phishing/reports/${selectedReport.id}/analyze/`, { tool, domain });
      const updatedReport = mapEmailReport(response.data.report);
      setSelectedReport(updatedReport);
      setEmailReports(current => current.map(item => item.id === updatedReport.id ? updatedReport : item));
      setActiveView('report');
    } catch (error) {
      const backendMessage = error.response?.data?.error || error.response?.data?.detail;
      setReportToolError(backendMessage || (error.response
        ? `رفض Django الطلب أو تعذر معالجته (HTTP ${error.response.status}). تحقق من صلاحية حساب المسؤول وسجل Django.`
        : 'تعذر الاتصال بخدمة Django. تحقق أن الباكند يعمل على المنفذ 8000.'));
    } finally {
      setRunningReportTool('');
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };


  // تعريف قائمة أزرار الشريط الجانبي للوحة التحكم (Admin)
  const adminNavItems = [
    { label: 'نظرة عامة', icon: LayoutGrid, isActive: activeView === 'overview', onClick: () => setActiveView('overview') },
    { label: 'الإحصائيات', icon: BarChart3, isActive: activeView === 'statistics', onClick: () => setActiveView('statistics') },
    { label: 'فحص جديد', icon: Search, isActive: activeView === 'new', onClick: () => setActiveView('new') },
    { label: 'سجل الفحوصات', icon: FileSearch, isActive: activeView === 'history' || activeView === 'report', onClick: () => setActiveView('history') },
    { label: 'إدارة الدورات', icon: BookPlus, isActive: false, onClick: () => navigate('/admin/courses') },
    { label: 'إدارة الحملات', icon: MailWarning, isActive: false, onClick: () => navigate('/admin/campaigns') },
    // هذا الزر الجديد يربط لوحة التحكم بصفحة التدريب!
    { label: 'بوابة التدريب والتوعية', icon: BookOpen, isActive: false, onClick: () => navigate('/training') }
  ];

  // معالجة البيانات للعرض في التقرير
  const parseReportData = (report) => {
    if (!report) return null;
    const rawText = report.output_data || "";
    const cleanText = rawText.replace(/\x1B\[[0-9;]*[mK]/g, '');
    const type = (report.scan_type || "").toLowerCase();
    let structuredResult = null;
    try { structuredResult = JSON.parse(cleanText); } catch { /* Legacy reports store plain text. */ }
    const structuredTool = structuredResult?.tool || '';
    const toolReport = structuredResult?.report || {};
    const isHolehe = type.includes('holehe') || structuredTool === 'holehe';
    const isDomainScan = structuredTool === 'domain';

    let holeheAccounts = [];
    if (isHolehe && Array.isArray(toolReport.accounts)) {
      holeheAccounts = toolReport.accounts;
    } else if (type.includes('holehe')) {
      holeheAccounts = cleanText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('[+]') && !line.includes('Email used'))
        .map(line => line.replace('[+]', '').trim());
    }

    const auth = { spf: 'غير معروف', dkim: 'غير معروف', dmarc: 'غير معروف' };
    const authRegex = /(spf|dkim|dmarc)[^\w]*(pass|fail|neutral|none|softfail)/ig;
    let match;
    while ((match = authRegex.exec(cleanText)) !== null) {
      const protocol = match[1].toLowerCase();
      const status = match[2].toLowerCase();
      if (status === 'pass') auth[protocol] = 'سليم';
      else if (status === 'fail' || status === 'softfail') auth[protocol] = 'فشل';
      else auth[protocol] = 'غير مفعل';
    }

    const warnings = [];
    cleanText.split('\n').forEach(line => {
      const l = line.toLowerCase();
      if ((l.includes('[!]') || l.includes('warning') || l.includes('malicious') || l.includes('phishing') || l.includes('failed')) && line.length < 150) {
        let cleanWarning = line.replace(/\[!\]|\*|warning:|error:/ig, '').trim();
        if (cleanWarning && !warnings.includes(cleanWarning)) warnings.push(cleanWarning);
      }
    });

    let threatStatus = { label: "آمن مبدئياً", isDanger: false, score: 15 };
    if (warnings.length > 0 || Object.values(auth).includes('فشل')) {
      threatStatus = { label: "خطورة مرتفعة", isDanger: true, score: 87 }; 
    }
    if (isHolehe || isDomainScan) {
      threatStatus = { label: 'نتيجة فحص فني', isDanger: false, score: '—' };
    }

    return { 
      isHolehe,
      isDomainScan,
      domainReport: isDomainScan ? toolReport : null,
      isAnalyzer: type.includes('analyzer') || type.includes('email'),
      holeheAccounts, auth, warnings, threatStatus
    };
  };

  // متغيرات الإحصائيات لشاشة نظرة عامة
  const totalReports = emailReports.length;
  const safeReports = emailReports.filter((r) => ['safe_simulation', 'false_positive'].includes(r.analysis_status)).length;
  const safePercentage = totalReports > 0 ? Math.round((safeReports / totalReports) * 100) : 0;
  const needsReviewCount = emailReports.filter((r) => ['queued_sandbox', 'pending'].includes(r.analysis_status)).length;
  const highRiskCount = emailReports.filter((r) => r.analysis_status === 'malicious').length;
  const parsedData = parseReportData(selectedReport);
  const analysisNotes = (() => {
    if (!selectedReport?.analyst_notes) return null;
    try { return JSON.parse(selectedReport.analyst_notes); }
    catch { return null; }
  })();
  const reportDomains = getReportDomains(selectedReport);

  return (
    <div className="min-h-screen bg-brand-bg flex font-cairo print:bg-white" dir="rtl">
      
      {/* ========================================== */}
      {/* الشريط الجانبي (Sidebar) الثابت والمركزي */}
      {/* ========================================== */}
      <Sidebar 
        subtitle="مركز حماية البريد"
        userName={userName}
        userRole="أنت • مسؤول"
        navItems={adminNavItems}
        onLogout={handleLogout}
      /> 

      {/* ========================================== */}
      {/* منطقة المحتوى الرئيسي (تتغير حسب activeView) */}
      {/* ========================================== */}
      <main className="flex-1 p-8 lg:p-12 overflow-y-auto print:p-0 print:overflow-visible">
        
        {/* شاشة التحميل العامة للفحص */}
        {isScanning && (
          <div className="h-full flex flex-col items-center justify-center animate-in fade-in duration-300 print:hidden">
            <Loader2 className="w-14 h-14 text-brand-primary animate-spin mb-6" />
            <h2 className="text-3xl font-bold text-brand-text mb-2">جاري الفحص والتحليل...</h2>
            <p className="text-brand-text/50">يرجى الانتظار بينما نقوم بجمع المؤشرات الأمنية.</p>
          </div>
        )}

        {/* ---------------- 1. نظرة عامة (Overview) ---------------- */}
        {!isScanning && activeView === 'overview' && (
          <div className="animate-in fade-in duration-300">
            <header className="flex justify-between items-center mb-8">
              <div>
                <div className="flex items-center gap-2 text-brand-primary text-sm font-semibold mb-1">
                  <span className="w-2 h-2 rounded-full bg-brand-primary"></span> جميع الأنظمة تعمل
                </div>
                <h2 className="text-3xl font-bold text-brand-text mb-1">أهلاً بك، {userName.split(' ')[0]}</h2>
                <p className="text-brand-text/60 text-sm">راقب الرسائل والدومينات المشبوهة من مكان واحد.</p>
              </div>
              <p className="text-sm text-brand-text/50 font-medium">
                {new Date().toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </header>

            {/* الفحص السريع */}
            <div className="bg-brand-surface rounded-[24px] p-8 shadow-sm mb-8 border border-gray-100">
              <h3 className="text-xl font-bold text-brand-text mb-1">فحص سريع</h3>
              <p className="text-sm text-brand-text/60 mb-2">أدخل بريدًا أو نطاقًا واختر نوعه لبدء الفحص بالأداة المناسبة.</p>
              <p className="text-xs text-brand-primary mb-6">{quickSearchType === 'email' ? 'البريد الإلكتروني يُفحص باستخدام Holehe.' : 'النطاق يُفحص باستخدام PhishHunterPro.'}</p>
              <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 relative w-full">
                  <input 
                    type="text" 
                    value={quickSearchTarget}
                    onChange={(e) => setQuickSearchTarget(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleQuickScan()}
                    placeholder="مثال: alerts@company.com أو suspicious-site.net" 
                    className="w-full bg-brand-bg border-none rounded-xl px-6 py-4 text-brand-text focus:ring-2 focus:ring-brand-primary outline-none transition-all" 
                    dir="ltr" 
                  />
                  <div className="absolute right-3 top-2.5 flex bg-white rounded-lg p-1 shadow-sm">
                    <button onClick={() => setQuickSearchType('email')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${quickSearchType === 'email' ? 'bg-brand-primary/10 text-brand-primary' : 'text-brand-text/50 hover:bg-gray-50'}`}>بريد إلكتروني</button>
                    <button onClick={() => setQuickSearchType('domain')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${quickSearchType === 'domain' ? 'bg-brand-primary/10 text-brand-primary' : 'text-brand-text/50 hover:bg-gray-50'}`}>دومين</button>
                  </div>
                </div>
                <button onClick={handleQuickScan} className="bg-brand-primary hover:bg-brand-primary/90 text-white px-8 py-4 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shadow-lg shadow-brand-primary/30">
                  ابدأ الفحص <Search className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <StatCard title="عمليات الفحص المسجلة" value={totalReports} subtitle="إجمالي البلاغات في النظام" icon={CheckCircle} theme="primary" />
              <StatCard title="عناوين آمنة" value={safeReports} subtitle={`${safePercentage}% من الإجمالي`} icon={ShieldCheck} theme="blue" />
              <StatCard title="تحتاج مراجعة" value={needsReviewCount} subtitle={`${highRiskCount} عالية الخطورة`} icon={MailWarning} theme="warning" />
            </div>

            <div className="bg-brand-surface rounded-[24px] p-8 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-brand-text">آخر التنبيهات</h3>
                  <p className="text-sm text-brand-text/50">عناوين تستحق انتباهك</p>
                </div>
                <button onClick={fetchReports} className="text-brand-primary text-sm font-semibold hover:underline cursor-pointer flex items-center gap-1">
                  تحديث <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="space-y-4">
                {emailReports.length === 0 ? (
                  <p className="text-center text-brand-text/50 py-8">لا توجد تنبيهات حالياً.</p>
                ) : (
                  emailReports.slice(0, 5).map((report) => (
                    <button type="button" key={report.id} onClick={() => { setSelectedReport(report); setReportToolError(''); setActiveView('toolSelect'); }} className="w-full text-right flex items-center justify-between p-4 rounded-2xl hover:bg-brand-bg transition-colors border border-transparent hover:border-gray-100 cursor-pointer">
                      <div className="flex items-center gap-4">
                        <div className={`w-2.5 h-2.5 rounded-full ${report.analysis_status === 'malicious' ? 'bg-brand-danger' : report.analysis_status === 'queued_sandbox' || report.analysis_status === 'pending' ? 'bg-brand-warning' : 'bg-brand-primary'}`}></div>
                        <div>
                          <p className="font-bold text-brand-text font-mono" dir="ltr">{report.sender_email || report.target}</p>
                          <p className="text-xs text-brand-text/50">{new Date(report.email_date || report.created_at).toLocaleTimeString('ar-SA')}</p>
                        </div>
                      </div>
                      <StatusBadge status={report.analysis_status} />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ---------------- 2. الإحصائيات (Statistics) ---------------- */}
        {!isScanning && activeView === 'statistics' && (
          <Statistics reports={emailReports} />
        )}

        {/* ---------------- 3. فحص جديد (New Scan) ---------------- */}
        {!isScanning && activeView === 'new' && (
          <div className="animate-in fade-in duration-300 print:hidden">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
              <div>
                <div className="flex items-center gap-2 text-brand-primary text-sm font-semibold mb-1">
                  <span className="w-2 h-2 rounded-full bg-brand-primary"></span> جميع الأنظمة تعمل
                </div>
                <h2 className="text-3xl font-bold text-brand-text mb-1">إجراء فحص أمني جديد</h2>
                <p className="text-brand-text/60 text-sm">أدخل الهدف المراد فحصه مع تحديد أداة التحقيق المناسبة.</p>
              </div>
            </header>
            
            <div className="bg-brand-surface rounded-[24px] p-8 md:p-10 shadow-sm border border-gray-100">
              <div className="max-w-4xl">
                <div className="flex flex-col gap-8">
                  <div>
                    <label className="block text-sm font-bold text-brand-text mb-3">الهدف (رابط، دومين، بريد):</label>
                    <input
                      type="text"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      placeholder="مثال: alerts@company.com أو example.com"
                      className="w-full bg-brand-bg border border-gray-200 rounded-xl px-6 py-4 text-brand-text focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-brand-text mb-3">نوع الفحص / الأداة:</label>
                    <select
                      value={scanOption}
                      onChange={(e) => setScanOption(e.target.value)}
                      className="w-full bg-brand-bg border border-gray-200 rounded-xl px-6 py-4 text-brand-text focus:ring-2 focus:ring-brand-primary outline-none transition-all cursor-pointer font-medium appearance-none"
                    >
                      <optgroup label="تحقيق الإيميل (Email Analyzer)">
                        <option value="workflow_full">▶ تشغيل المسار بالكامل (Full Workflow)</option>
                        <option value="wf_step1">1. التحقق من الإيميل (Email Validation)</option>
                        <option value="wf_step2">2. اكتشاف الحسابات (Holehe)</option>
                      </optgroup>
                      <optgroup label="فحص الروابط والنطاقات (Phish Hunter)">
                        <option value="1">1. فحص أساسي للنطاق (Domain)</option>
                      </optgroup>
                    </select>
                  </div>
                  <div className="pt-2">
                    <button onClick={() => runScan()} className="bg-brand-primary hover:bg-brand-primary/90 text-white px-10 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-brand-primary/30 w-full md:w-auto">
                      بدء التحقيق الأمني <Search className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {!isScanning && activeView === 'toolSelect' && selectedReport?.record_source === 'email' && (
          <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300 print:hidden">
            <header className="flex items-start justify-between gap-4 border-b border-gray-200 pb-5">
              <div>
                <button type="button" onClick={() => setActiveView('overview')} className="flex items-center gap-2 text-brand-primary font-bold hover:underline mb-4">
                  <ArrowRight className="w-5 h-5" /> الرجوع للتنبيهات
                </button>
                <h2 className="text-3xl font-bold text-brand-text">اختر أداة فحص البلاغ</h2>
                <p className="text-sm text-brand-text/60 mt-2">المرسل: <span dir="ltr">{selectedReport.sender_email}</span> · الموضوع: {selectedReport.email_subject || 'بدون موضوع'}</p>
              </div>
            </header>

            {reportToolError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{reportToolError}</div>}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <section className="bg-brand-surface rounded-2xl border border-gray-100 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <MailWarning className="w-6 h-6 text-brand-primary" />
                  <h3 className="text-lg font-bold text-brand-text">تحليل البريد الإلكتروني</h3>
                </div>
                <p className="text-sm leading-6 text-brand-text/60 mb-5">يفحص المرسل والرؤوس ومصادقة SPF/DKIM/DMARC والروابط والمرفقات المتاحة، ثم يعرض درجة الخطورة وأسبابها.</p>
                <button type="button" onClick={() => runReportAnalysis('email')} disabled={!!runningReportTool} className="w-full rounded-xl bg-brand-primary px-4 py-3 font-bold text-white disabled:opacity-60">
                  {runningReportTool === 'email' ? 'جاري تحليل الرسالة…' : 'حلّل الرسالة كاملة'}
                </button>
              </section>

              <section className="bg-brand-surface rounded-2xl border border-gray-100 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <Search className="w-6 h-6 text-brand-primary" />
                  <h3 className="text-lg font-bold text-brand-text">فحص نطاق في الرسالة</h3>
                </div>
                <p className="text-sm leading-6 text-brand-text/60 mb-4">اختر نطاقًا مستخرجًا من الرسالة لفحص DNS وWHOIS ورؤوس الموقع والتحويلات.</p>
                {reportDomains.length ? (
                  <div className="space-y-2" dir="ltr">
                    {reportDomains.map((domain) => (
                      <button key={domain} type="button" onClick={() => runReportAnalysis('domain', domain)} disabled={!!runningReportTool} className="w-full flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left font-mono text-sm hover:border-brand-primary hover:bg-brand-bg disabled:opacity-60">
                        <span className="break-all">{domain}</span>
                        <span className="shrink-0 font-sans font-bold text-brand-primary">{runningReportTool === `domain:${domain}` ? 'جاري الفحص…' : 'افحص'}</span>
                      </button>
                    ))}
                  </div>
                ) : <p className="rounded-xl bg-brand-bg p-4 text-sm text-brand-text/55">ما في نطاق عام مستخرج من هذا البلاغ؛ استخدم تحليل البريد.</p>}
              </section>

              <section className="bg-brand-surface rounded-2xl border border-gray-100 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <UserCheck className="w-6 h-6 text-brand-primary" />
                  <h3 className="text-lg font-bold text-brand-text">Holehe: الحسابات المرتبطة</h3>
                </div>
                <p className="text-sm leading-6 text-brand-text/60 mb-5">يفحص عنوان المرسل لمعرفة الخدمات التي قد يكون البريد مسجلًا فيها. النتائج استدلالية وليست تأكيدًا لهوية صاحب الحساب.</p>
                <button type="button" onClick={() => runReportAnalysis('holehe')} disabled={!!runningReportTool} className="w-full rounded-xl border border-brand-primary px-4 py-3 font-bold text-brand-primary disabled:opacity-60">
                  {runningReportTool === 'holehe' ? 'جاري فحص البريد…' : 'افحص عنوان المرسل بـ Holehe'}
                </button>
              </section>
            </div>
          </div>
        )}

        {/* ---------------- 4. سجل الفحوصات (History) ---------------- */}
        {!isScanning && activeView === 'history' && (
          <div className="animate-in fade-in duration-300 print:hidden">
            <header className="mb-10">
              <h2 className="text-3xl font-bold text-brand-text mb-2">سجل الفحوصات</h2>
              <p className="text-brand-text/60">استعرض تاريخ الفحوصات السابقة ونتائج التحليل.</p>
            </header>
            
            <div className="bg-brand-surface rounded-[24px] shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-brand-bg text-brand-text/60 text-xs uppercase font-semibold">
                    <tr>
                      <th className="p-6">الهدف (Target)</th>
                      <th className="p-6">نوع الفحص</th>
                      <th className="p-6">التاريخ والوقت</th>
                      <th className="p-6 text-center">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {reports.length === 0 ? (
                      <tr><td colSpan="4" className="p-12 text-center text-brand-text/50">لا توجد عمليات فحص سابقة.</td></tr>
                    ) : (
                      reports.map(report => (
                        <tr key={report.id} className="hover:bg-brand-bg/50 transition-colors">
                          <td className="p-6 text-brand-text font-bold" dir="ltr" style={{ textAlign: 'left' }}>{report.target || report.sender_email}</td>
                          <td className="p-6 text-brand-text/60 font-mono text-xs font-semibold" dir="ltr">{report.scan_type}</td>
                          <td className="p-6 text-brand-text/60">{new Date(report.created_at).toLocaleString('ar-SA')}</td>
                          <td className="p-6 text-center">
                            <button onClick={() => { setSelectedReport(report); setActiveView('report'); }} className="text-brand-primary hover:bg-brand-primary/10 border border-transparent hover:border-brand-primary/20 px-4 py-2 rounded-lg inline-flex items-center justify-center gap-2 font-bold transition-all cursor-pointer">
                              <FileText className="w-4 h-4" /> عرض النتيجة
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- 5. شاشة النتيجة التفصيلية والطباعة (Report) ---------------- */}
        {!isScanning && activeView === 'report' && parsedData && (
          <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-400 print:max-w-full print:w-full print:p-0">
            
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-gray-200 pb-4 print:border-b-2 print:border-black">
              <div>
                <button onClick={() => {
                  if (selectedReport.record_source === 'email') {
                    setActiveView('overview');
                  } else {
                    setActiveView('history');
                  }
                }} className="flex items-center gap-2 text-brand-primary font-bold hover:underline cursor-pointer mb-4 print:hidden">
                  <ArrowRight className="w-5 h-5" /> {selectedReport.record_source === 'email' ? 'العودة لآخر التنبيهات' : 'العودة للسجل'}
                </button>
                <h1 className="text-3xl font-extrabold text-brand-text mb-1 print:text-black">نتيجة الفحص الأمني (SOC Report)</h1>
                <p className="text-brand-text/50 text-sm font-medium print:text-black">
                  تاريخ الإصدار: {new Date(selectedReport.created_at).toLocaleString('ar-SA')} • معرّف الفحص #{selectedReport.id}
                </p>
              </div>
              
              <button 
                onClick={() => window.print()} 
                className="print:hidden bg-brand-text hover:bg-brand-text/90 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
              >
                <Printer className="w-5 h-5" /> طباعة التقرير
              </button>
            </header>

            <div className="bg-brand-text rounded-[24px] p-10 flex flex-col md:flex-row items-center justify-between shadow-xl relative overflow-hidden gap-6 print:bg-white print:border-2 print:border-gray-200 print:shadow-none print:text-black">
              <div className="z-10 flex-1">
                <span className={`inline-block px-5 py-2 rounded-full text-xs font-bold mb-5 print:border print:border-black ${parsedData.threatStatus.isDanger ? 'bg-brand-danger/20 text-brand-danger' : 'bg-brand-primary/20 text-brand-primary'}`}>
                  {parsedData.threatStatus.label}
                </span>
                <h2 className="text-2xl md:text-3xl font-bold text-white font-mono mb-3 print:text-black" dir="ltr">{selectedReport.target || selectedReport.sender_email}</h2>
                <p className="text-white/60 text-sm max-w-md leading-relaxed print:text-gray-700">
                  {parsedData.isHolehe ? 'يعرض هذا الفحص الخدمات التي ظهر ارتباط البريد بها، ولا يصدر حكمًا على سلامة الرسالة.' : parsedData.isDomainScan ? 'هذه نتائج تقنية عن النطاق؛ راجع عناوين DNS والتحويلات وبيانات الموقع أدناه.' : parsedData.threatStatus.isDanger ? 'تم رصد مؤشرات خطورة تقنية خلال الفحص. يرجى مراجعة المؤشرات بالأسفل واتخاذ الإجراء المناسب.' : 'لم تُكتشف مؤشرات خطورة واضحة في هذا الهدف حتى الآن.'}
                </p>
              </div>
              
              <div className="text-center z-10 bg-white/5 p-6 rounded-2xl border border-white/10 w-full md:w-auto print:bg-white print:border-gray-300">
                <p className={`text-6xl font-extrabold mb-2 ${parsedData.threatStatus.isDanger ? 'text-brand-danger' : 'text-brand-primary'}`}>{parsedData.threatStatus.score}</p>
                <p className="text-white/50 text-xs font-bold print:text-gray-500">{parsedData.isHolehe || parsedData.isDomainScan ? 'لا يصدر هذا الفحص درجة خطورة تلقائية' : 'مؤشرات خطورة مؤكدة من ١٠٠'}</p>
              </div>
            </div>

            {selectedReport.record_source === 'email' && (
              <section className="bg-brand-surface rounded-[24px] p-8 shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-brand-text mb-4">تفاصيل البريد المُبلّغ عنه</h3>
                <p className="text-sm text-brand-text/70 mb-3">الموضوع: <span className="font-bold">{selectedReport.email_subject || 'بدون موضوع'}</span></p>
                <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-brand-text/80 font-sans max-h-72 overflow-auto">{selectedReport.email_body || 'لا يوجد محتوى نصي محفوظ.'}</pre>
                {analysisNotes && (
                  <div className="mt-6 space-y-5 border-t border-gray-100 pt-5">
                    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
                      <span className="font-bold">ملخص التحليل: </span>{analysisNotes.result || 'لا يوجد ملخص متاح.'}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <section className="rounded-xl bg-brand-bg p-4">
                        <h4 className="font-bold text-sm mb-3">مصادقة البريد</h4>
                        <div className="space-y-2 text-sm" dir="ltr">
                          {['spf', 'dkim', 'dmarc'].map((key) => (
                            <p key={key} className="flex justify-between gap-3">
                              <span className="font-mono uppercase">{key}</span>
                              <span className="font-semibold">{analysisNotes.authentication?.[key] || 'not_found'}</span>
                            </p>
                          ))}
                        </div>
                      </section>

                      <section className="rounded-xl bg-brand-bg p-4">
                        <h4 className="font-bold text-sm mb-3">الروابط الموجودة</h4>
                        {analysisNotes.links?.length ? (
                          <ul className="space-y-2 text-sm" dir="ltr">
                            {analysisNotes.links.map((link, index) => (
                              <li key={`${link.host}-${index}`} className="break-all">
                                <span className="font-semibold">{link.host}</span><span className="text-brand-text/55">{link.path}</span>
                              </li>
                            ))}
                          </ul>
                        ) : <p className="text-sm text-brand-text/55">ما تم العثور على روابط.</p>}
                      </section>
                    </div>

                    <section className="rounded-xl bg-brand-bg p-4">
                      <h4 className="font-bold text-sm mb-3">نتائج VirusTotal للنطاقات وعناوين IP</h4>
                      {analysisNotes.scanned_indicators?.length ? (
                        <ul className="space-y-2 text-sm" dir="ltr">
                          {analysisNotes.scanned_indicators.map((item, index) => (
                            <li key={`${item.value}-${index}`} className="flex flex-wrap justify-between gap-2 border-b border-gray-200 pb-2 last:border-0">
                              <span className="font-mono break-all">{item.value}</span>
                              <span>خبيث: {item.malicious_count} · مشبوه: {item.suspicious_count} · سليم: {item.harmless_count}</span>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-sm text-brand-text/55">ما تم فحص مؤشرات عامة.</p>}
                    </section>

                    {analysisNotes.tool_results?.slice().reverse().map((run, runIndex) => {
                      const result = run.report || {};
                      if (run.tool === 'email') {
                        const auth = result.sender?.auth || {};
                        return (
                          <section key={`${run.tool}-${run.ran_at}-${runIndex}`} className="rounded-2xl border border-gray-200 p-5 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <h4 className="font-bold text-brand-text">نتيجة محلل البريد</h4>
                              <span className="text-xs text-brand-text/50">{run.ran_at ? new Date(run.ran_at).toLocaleString('ar-SA') : ''}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="rounded-xl bg-brand-bg p-4"><p className="text-xs text-brand-text/55">تقييم المحلل</p><p className="mt-1 font-extrabold">{result.verdict || 'غير متوفر'}</p></div>
                              <div className="rounded-xl bg-brand-bg p-4"><p className="text-xs text-brand-text/55">درجة الخطورة</p><p className="mt-1 text-2xl font-extrabold">{result.score ?? '—'}<span className="text-sm font-semibold"> / 100</span></p></div>
                              <div className="rounded-xl bg-brand-bg p-4"><p className="text-xs text-brand-text/55">مصادقة البريد</p><p className="mt-1 text-sm font-bold">SPF {auth.spf || '—'} · DKIM {auth.dkim || '—'} · DMARC {auth.dmarc || '—'}</p></div>
                            </div>
                            {result.findings?.length ? (
                              <div>
                                <h5 className="font-bold text-sm mb-2">الملاحظات والأسباب</h5>
                                <ul className="space-y-2">
                                  {result.findings.map((finding, index) => <li key={index} className="rounded-lg bg-brand-bg p-3 text-sm"><span className="font-bold">{finding.severity} · {finding.title}</span>{finding.detail && <p className="mt-1 text-brand-text/65">{finding.detail}</p>}</li>)}
                                </ul>
                              </div>
                            ) : <p className="text-sm text-brand-text/60">لم يعثر المحلل على مؤشرات قوية؛ هذا لا يثبت وحده أن الرسالة آمنة.</p>}
                            {result.links?.length > 0 && <div><h5 className="font-bold text-sm mb-2">الروابط المكتشفة</h5><ul className="space-y-2" dir="ltr">{result.links.map((link, index) => <li key={index} className="rounded-lg bg-brand-bg p-3 text-sm break-all"><span className={link.suspicious ? 'font-bold text-red-700' : 'font-medium'}>{link.suspicious ? 'مشبوه · ' : ''}{link.url}</span>{link.flags?.length > 0 && <p className="mt-1 text-brand-text/60">{link.flags.join(' · ')}</p>}</li>)}</ul></div>}
                            {result.attachments?.length > 0 && <div><h5 className="font-bold text-sm mb-2">المرفقات</h5><ul className="space-y-2">{result.attachments.map((file, index) => <li key={index} className="rounded-lg bg-brand-bg p-3 text-sm"><span className="font-bold">{file.filename}</span> · {file.content_type} · {file.size} bytes{file.flags?.length > 0 && <p className="mt-1 text-red-700">{file.flags.join(' · ')}</p>}</li>)}</ul></div>}
                          </section>
                        );
                      }

                      if (run.tool === 'holehe') {
                        return (
                          <section key={`${run.tool}-${run.ran_at}-${runIndex}`} className="rounded-2xl border border-gray-200 p-5 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-bold text-brand-text">نتيجة Holehe · <span className="font-mono" dir="ltr">{result.email}</span></h4><span className="text-xs text-brand-text/50">{run.ran_at ? new Date(run.ran_at).toLocaleString('ar-SA') : ''}</span></div>
                            {result.accounts?.length ? <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2" dir="ltr">{result.accounts.map((account, index) => <li key={`${account}-${index}`} className="rounded-lg bg-brand-bg p-3 font-mono text-sm break-all">{account}</li>)}</ul> : <p className="rounded-lg bg-brand-bg p-4 text-sm text-brand-text/60">لم تُظهر نتيجة مؤكدة لخدمات مرتبطة بهذا البريد.</p>}
                          </section>
                        );
                      }

                      return (
                        <section key={`${run.tool}-${run.ran_at}-${runIndex}`} className="rounded-2xl border border-gray-200 p-5 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-bold text-brand-text">فحص النطاق: <span className="font-mono" dir="ltr">{result.domain}</span></h4><span className="text-xs text-brand-text/50">{run.ran_at ? new Date(run.ran_at).toLocaleString('ar-SA') : ''}</span></div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="rounded-xl bg-brand-bg p-4"><p className="text-xs text-brand-text/55 mb-2">عناوين DNS</p><p className="font-mono text-sm" dir="ltr">{result.resolved_ips?.join(', ') || 'ما تم العثور على عنوان'}</p></div>
                            <div className="rounded-xl bg-brand-bg p-4"><p className="text-xs text-brand-text/55 mb-2">التحويلات</p>{result.redirects?.length ? result.redirects.map((line, index) => <p key={index} className="font-mono text-xs break-all" dir="ltr">{line}</p>) : <p className="text-sm">ما ظهر تحويل.</p>}</div>
                          </div>
                          {result.http_headers?.length > 0 && <div><h5 className="font-bold text-sm mb-2">رؤوس الموقع</h5><div className="grid grid-cols-1 md:grid-cols-2 gap-2">{result.http_headers.slice(0, 12).map((header, index) => <p key={index} className="rounded-lg bg-brand-bg p-3 text-xs break-all"><span className="font-bold">{header.name}: </span>{header.value}</p>)}</div></div>}
                          {result.robots && <details className="rounded-xl bg-brand-bg p-4"><summary className="cursor-pointer font-bold text-sm">محتوى robots.txt</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs max-h-48 overflow-auto">{result.robots}</pre></details>}
                          {result.whois && <details className="rounded-xl bg-brand-bg p-4"><summary className="cursor-pointer font-bold text-sm">بيانات WHOIS</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs max-h-48 overflow-auto">{result.whois}</pre></details>}
                        </section>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* القسم المخصص لحسابات Holehe (بدون الترمنال) */}
            {parsedData.isHolehe && (
              <div className="bg-brand-surface rounded-[24px] p-8 shadow-sm border border-gray-100 mt-8 print:bg-white print:border-2 print:border-gray-200 print:shadow-none">
                <div className="flex items-center gap-3 mb-6 border-b border-gray-50 pb-4 print:border-gray-200">
                  <UserCheck className="w-6 h-6 text-brand-primary print:text-black" />
                  <div>
                    <h3 className="text-xl font-bold text-brand-text print:text-black">الحسابات المكتشفة (OSINT)</h3>
                    <p className="text-xs text-brand-text/50 print:text-gray-500">المنصات والمواقع التي سجلت استخداماً مؤكداً لهذا البريد الإلكتروني</p>
                  </div>
                </div>

                {parsedData.holeheAccounts.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {parsedData.holeheAccounts.map((site, index) => (
                      <div key={index} className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-brand-bg hover:border-brand-primary/30 transition-all print:border-gray-300 print:bg-white">
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm border border-gray-50 flex-shrink-0">
                          <img 
                            src={`https://logo.clearbit.com/${site}`} 
                            onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} 
                            alt={site} 
                            className="w-6 h-6 object-contain" 
                          />
                          <div className="w-full h-full items-center justify-center text-brand-primary font-bold text-sm hidden">
                            {site.charAt(0).toUpperCase()}
                          </div>
                        </div>
                        <span className="font-bold text-sm text-brand-text font-mono truncate" dir="ltr">{site}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-brand-bg rounded-2xl border border-gray-100 print:bg-white print:border-gray-300">
                    <p className="text-brand-text/50 font-bold">لم يتم العثور على أي حسابات مرتبطة بهذا البريد.</p>
                  </div>
                )}
              </div>
            )}

            {parsedData.isDomainScan && parsedData.domainReport && (
              <section className="bg-brand-surface rounded-[24px] p-8 shadow-sm border border-gray-100 space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-brand-text">نتائج فحص النطاق</h3>
                  <p className="mt-1 text-sm text-brand-text/55" dir="ltr">{parsedData.domainReport.domain}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-brand-bg p-5">
                    <h4 className="font-bold text-sm mb-3">عناوين DNS</h4>
                    {parsedData.domainReport.resolved_ips?.length ? <ul className="space-y-1 font-mono text-sm" dir="ltr">{parsedData.domainReport.resolved_ips.map((ip, index) => <li key={`${ip}-${index}`}>{ip}</li>)}</ul> : <p className="text-sm text-brand-text/55">لم يُرجع الفحص عنوان IP.</p>}
                  </div>
                  <div className="rounded-xl bg-brand-bg p-5">
                    <h4 className="font-bold text-sm mb-3">التحويلات</h4>
                    {parsedData.domainReport.redirects?.length ? <ul className="space-y-2 font-mono text-xs break-all" dir="ltr">{parsedData.domainReport.redirects.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ul> : <p className="text-sm text-brand-text/55">لم يظهر تحويل.</p>}
                  </div>
                </div>
                {parsedData.domainReport.http_headers?.length > 0 && <div>
                  <h4 className="font-bold text-sm mb-3">رؤوس الموقع</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{parsedData.domainReport.http_headers.slice(0, 12).map((header, index) => <p key={`${header.name}-${index}`} className="rounded-lg bg-brand-bg p-3 text-xs break-all"><span className="font-bold">{header.name}: </span>{header.value}</p>)}</div>
                </div>}
                {parsedData.domainReport.whois && <details className="rounded-xl bg-brand-bg p-4"><summary className="cursor-pointer font-bold text-sm">بيانات تسجيل النطاق (WHOIS)</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs max-h-48 overflow-auto" dir="ltr">{parsedData.domainReport.whois}</pre></details>}
                {parsedData.domainReport.robots && <details className="rounded-xl bg-brand-bg p-4"><summary className="cursor-pointer font-bold text-sm">تعليمات الموقع العامة</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs max-h-48 overflow-auto" dir="ltr">{parsedData.domainReport.robots}</pre></details>}
              </section>
            )}

            {/* مؤشرات الفحص الأخرى (Phish Hunter أو Email Analyzer) */}
            {!parsedData.isHolehe && !parsedData.isDomainScan && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                <div className="bg-brand-surface rounded-[24px] p-8 shadow-sm border border-gray-100 h-full print:border-2 print:border-gray-200">
                  <h3 className="text-xl font-bold text-brand-text mb-1 print:text-black">مؤشرات الفحص</h3>
                  <p className="text-sm text-brand-text/50 mb-8 print:text-gray-500">الأسباب التي أثرت على تقييم الخطورة</p>
                  
                  <div className="space-y-6">
                    {parsedData.warnings.length > 0 ? parsedData.warnings.slice(0,4).map((warn, i) => (
                      <div key={i} className="flex justify-between items-center border-b border-gray-50 pb-4 last:border-0 print:border-gray-200">
                        <span className="px-4 py-1.5 bg-brand-danger/10 text-brand-danger rounded-full text-xs font-bold print:border print:border-brand-danger">مرتفع</span>
                        <div className="text-left flex flex-col items-end">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-bold text-brand-text text-sm print:text-black">تنبيه أمني</p>
                            <span className="w-2.5 h-2.5 rounded-full bg-brand-danger"></span>
                          </div>
                          <p className="text-xs text-brand-text/50 max-w-[220px] truncate print:text-gray-700" dir="ltr">{warn}</p>
                        </div>
                      </div>
                    )) : (
                      <div className="flex justify-between items-center border-b border-gray-50 pb-4 print:border-gray-200">
                         <span className="px-4 py-1.5 bg-brand-primary/10 text-brand-primary rounded-full text-xs font-bold print:border print:border-brand-primary">منخفض</span>
                         <div className="text-left flex flex-col items-end">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-bold text-brand-text text-sm print:text-black">حالة الفحص</p>
                            <span className="w-2.5 h-2.5 rounded-full bg-brand-primary"></span>
                          </div>
                          <p className="text-xs text-brand-text/50 print:text-gray-700">سليم تقنياً</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-brand-surface rounded-[24px] p-8 shadow-sm border border-gray-100 print:border-2 print:border-gray-200">
                    <h3 className="text-lg font-bold text-brand-text mb-5 print:text-black">تفاصيل تقنية</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-gray-50 pb-3 print:border-gray-200">
                        <span className="font-mono text-sm text-brand-text font-bold bg-brand-bg px-2 py-1 rounded print:bg-transparent print:text-black" dir="ltr">{selectedReport.scan_type}</span>
                        <span className="text-xs text-brand-text/50 font-medium print:text-gray-600">أداة الفحص</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className={`text-sm font-bold ${selectedReport.status === 'SUCCESS' ? 'text-brand-primary' : 'text-brand-danger'}`}>
                          {selectedReport.status === 'SUCCESS' ? 'مكتمل بنجاح' : 'فشل الفحص'}
                        </span>
                        <span className="text-xs text-brand-text/50 font-medium print:text-gray-600">حالة النظام</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* أزرار تحديث حالة التقرير (مربوطة بدالة updateStatus) */}
            {selectedReport.record_source === 'email' && <div className="bg-brand-bg rounded-[24px] p-8 border border-brand-primary/10 mt-6 print:hidden">
              <h3 className="text-lg font-bold text-brand-text mb-3">تحديث حالة التقرير</h3>
              <div className="flex gap-3">
                <button 
                  onClick={() => updateStatus(selectedReport.id, 'malicious')}
                  className="flex-1 bg-brand-primary hover:bg-brand-primary/90 text-white font-bold py-3.5 rounded-xl transition-all shadow-md shadow-brand-primary/20 cursor-pointer"
                >
                  تأكيد الحظر
                </button>
                <button 
                  onClick={() => updateStatus(selectedReport.id, 'false_positive')}
                  className="flex-1 bg-white hover:bg-gray-50 text-brand-text font-bold py-3.5 rounded-xl transition-all border border-gray-200 cursor-pointer"
                >
                  تجاهل (آمن)
                </button>
              </div>
            </div>}

          </div>
        )}
      </main>
    </div>
  );
}
