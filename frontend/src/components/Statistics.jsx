import React, { useState, useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend, ComposedChart, Line
} from 'recharts';
import { ShieldCheck, MailWarning, Terminal, AlertTriangle, TrendingUp, Activity } from 'lucide-react';

export default function Statistics({ reports = [] }) {
  const [timeRange, setTimeRange] = useState('1W'); // 1W, 1M, 1Y

  // ==========================================
  // 1. الخوارزميات الديناميكية لحساب الإحصائيات
  // ==========================================
  
  // حساب الملخصات العلوية
  const totalReports = reports.length;
  const maliciousCount = reports.filter(r => r.analysis_status === 'malicious').length;
  const sandboxCount = reports.filter(r => r.analysis_status === 'queued_sandbox').length;
  const safeCount = reports.filter(r => ['safe_simulation', 'false_positive'].includes(r.analysis_status)).length;
  const safeRate = totalReports > 0 ? ((safeCount / totalReports) * 100).toFixed(1) : 0;
  const reviewedCount = reports.filter(r => !['pending', 'queued_sandbox'].includes(r.analysis_status)).length;
  const reviewRate = totalReports ? Math.round(reviewedCount / totalReports * 100) : 0;

  // أ. معالجة بيانات المخطط المساحي (الترند الزمني)
  const areaData = useMemo(() => {
    const now = new Date();
    const data = [];
    
    if (timeRange === '1W') {
      const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      // بناء قالب الـ 7 أيام الماضية
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        data.push({ date: days[d.getDay()], total: 0, malicious: 0 });
      }
      // تعبئة البيانات الفعلية
      reports.forEach(report => {
        const rd = new Date(report.email_date || report.created_at);
        const diffDays = Math.floor(Math.abs(now - rd) / (1000 * 60 * 60 * 24)); 
        if (diffDays <= 7) {
          const dayName = days[rd.getDay()];
          const dayObj = data.find(d => d.date === dayName);
          if (dayObj) {
            dayObj.total += 1;
            if (report.analysis_status === 'malicious') dayObj.malicious += 1;
          }
        }
      });
    } else if (timeRange === '1M') {
      data.push({ date: 'الأسبوع 1', total: 0, malicious: 0 }, { date: 'الأسبوع 2', total: 0, malicious: 0 }, { date: 'الأسبوع 3', total: 0, malicious: 0 }, { date: 'الأسبوع 4', total: 0, malicious: 0 });
      reports.forEach(report => {
        const rd = new Date(report.email_date || report.created_at);
        const diffDays = Math.floor(Math.abs(now - rd) / (1000 * 60 * 60 * 24)); 
        if (diffDays <= 30) {
          const weekIdx = 3 - Math.floor((diffDays - 1) / 7.5);
          if (data[weekIdx]) {
            data[weekIdx].total += 1;
            if (report.analysis_status === 'malicious') data[weekIdx].malicious += 1;
          }
        }
      });
    } else if (timeRange === '1Y') {
      const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
      months.forEach(m => data.push({ date: m, total: 0, malicious: 0 }));
      reports.forEach(report => {
        const rd = new Date(report.email_date || report.created_at);
        if (rd.getFullYear() === now.getFullYear()) {
          const monthName = months[rd.getMonth()];
          const monthObj = data.find(d => d.date === monthName);
          if(monthObj) {
            monthObj.total += 1;
            if (report.analysis_status === 'malicious') monthObj.malicious += 1;
          }
        }
      });
    }
    return data;
  }, [reports, timeRange]);

  // ب. بيانات المخطط الدائري (توزيع التهديدات الفعلي)
  const threatAllocation = useMemo(() => {
    const alloc = [
      { name: 'تهديد مؤكد', value: maliciousCount, color: '#D85E56' },
      { name: 'قيد التحليل (Sandbox)', value: sandboxCount, color: '#D88E27' },
      { name: 'قيد الانتظار', value: reports.filter(r => r.analysis_status === 'pending').length, color: '#94A3B8' },
      { name: 'آمن', value: safeCount, color: '#18A982' },
    ].filter(item => item.value > 0); // إخفاء الحالات الصفرية
    
    // في حال عدم وجود بيانات
    if (alloc.length === 0) return [{ name: 'لا توجد بيانات', value: 1, color: '#F3F4F6' }];
    return alloc;
  }, [maliciousCount, sandboxCount, safeCount, reports]);

  // ج. استخراج أكثر النطاقات استهدافاً (Top Markets)
  const topDomains = useMemo(() => {
    const domainsMap = {};
    reports.forEach(r => {
      const email = r.sender_email;
      if (email && email.includes('@')) {
        const domain = email.split('@')[1];
        if (!domainsMap[domain]) domainsMap[domain] = { domain, count: 0, malicious: 0 };
        domainsMap[domain].count += 1;
        if (r.analysis_status === 'malicious') domainsMap[domain].malicious += 1;
      }
    });
    
    return Object.values(domainsMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3) // أعلى 3 نطاقات
      .map(d => ({
        ...d,
        trend: d.malicious > 0 ? `+${d.malicious} خبيث` : 'آمن',
        isDanger: d.malicious > 0
      }));
  }, [reports]);

  // د. مقارنة أداء الفحوصات (الأسبوع الحالي مقابل الأسبوع الماضي)
  const performanceData = useMemo(() => {
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const data = days.map(day => ({ day, currentWeek: 0, lastWeek: 0 }));
    const now = new Date();
    
    reports.forEach(report => {
      const rd = new Date(report.email_date || report.created_at);
      const diffDays = Math.floor(Math.abs(now - rd) / (1000 * 60 * 60 * 24)); 
      const dayName = days[rd.getDay()];
      const dayObj = data.find(d => d.day === dayName);
      
      if (diffDays <= 7) dayObj.currentWeek += 1;
      else if (diffDays > 7 && diffDays <= 14) dayObj.lastWeek += 1;
    });
    
    // تدوير المصفوفة ليكون اليوم الحالي هو آخر عمود
    const todayIdx = now.getDay();
    return [...data.slice(todayIdx + 1), ...data.slice(0, todayIdx + 1)];
  }, [reports]);


  // ==========================================
  // 2. تصميم الواجهة والمخططات
  // ==========================================

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-brand-text text-white p-4 rounded-xl shadow-lg border border-gray-700 font-cairo" dir="rtl">
          <p className="font-bold mb-2 border-b border-gray-600 pb-2">{label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center gap-2 mb-1 text-sm">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></span>
              <span className="text-gray-300">{entry.name}:</span>
              <span className="font-bold">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="animate-in slide-in-from-bottom-4 fade-in duration-400 font-cairo space-y-6" dir="rtl">
      
      <header className="mb-6">
        <h2 className="text-3xl font-bold text-brand-text mb-2">إحصائيات المنظومة الأمنية</h2>
        <p className="text-brand-text/60">تحليل حقيقي وشامل لبيانات البلاغات والتهديدات المسجلة.</p>
      </header>

      {/* 1. البطاقات العلوية الديناميكية */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { title: 'إجمالي الفحوصات', value: totalReports, icon: ShieldCheck, color: 'text-brand-primary' },
          { title: 'تهديدات محظورة', value: maliciousCount, icon: AlertTriangle, color: 'text-brand-danger' },
          { title: 'معدل الأمان', value: `${safeRate}%`, icon: ShieldCheck, color: 'text-brand-primary' },
          { title: 'فحوصات Sandbox', value: sandboxCount, icon: Terminal, color: 'text-brand-warning' },
        ].map((stat, i) => (
          <div key={i} className="bg-brand-surface border border-gray-100 p-6 rounded-[20px] shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-xs font-bold text-brand-text/50 uppercase tracking-wider mb-1">{stat.title}</p>
                <p className="text-2xl font-bold text-brand-text font-mono" dir="ltr">{stat.value}</p>
              </div>
              <div className={`p-2 rounded-lg bg-gray-50 ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 2. المخطط المساحي (الترند الزمني الحقيقي) */}
        <div className="lg:col-span-2 bg-brand-surface border border-gray-100 p-6 rounded-[24px] shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-brand-text text-sm">حركة البلاغات عبر الزمن</h3>
            <div className="flex bg-brand-bg rounded-lg p-1">
              {['1W', '1M', '1Y'].map((range) => (
                <button 
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-4 py-1 text-xs font-bold rounded-md transition-all ${timeRange === range ? 'bg-brand-surface text-brand-text shadow-sm' : 'text-brand-text/50'}`}
                >
                  {range === '1W' ? 'أسبوع' : range === '1M' ? 'شهر' : 'سنة'}
                </button>
              ))}
            </div>
          </div>
          
          <div className="h-[300px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={areaData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#18A982" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#18A982" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorMalicious" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D85E56" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#D85E56" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dy={10} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dx={-10} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="total" name="إجمالي الفحوصات" stroke="#18A982" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                <Area type="monotone" dataKey="malicious" name="تهديدات" stroke="#D85E56" strokeWidth={2} fillOpacity={1} fill="url(#colorMalicious)" />
                <Line type="monotone" dataKey="total" name="اتجاه البلاغات" stroke="#0F766E" strokeWidth={2} dot={false} strokeDasharray="5 5" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. المخطط الدائري (توزيع التهديدات الحقيقي) */}
        <div className="bg-brand-surface border border-gray-100 p-6 rounded-[24px] shadow-sm flex flex-col">
          <h3 className="font-bold text-brand-text text-sm mb-2">توزيع الحالات الأمنية</h3>
          <div className="flex-1 min-h-[250px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={threatAllocation} cx="50%" cy="50%" innerRadius={70} outerRadius={90} paddingAngle={5} dataKey="value" stroke="none">
                  {threatAllocation.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} cornerRadius={5} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs text-brand-text/50 font-bold">الإجمالي</span>
              <span className="text-2xl font-extrabold text-brand-text">{totalReports}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-y-3 gap-x-2 mt-4">
            {threatAllocation.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                <span className="text-brand-text/70 font-semibold truncate" title={item.name}>{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-emerald-900 to-teal-700 text-white p-6 rounded-[24px] shadow-sm relative overflow-hidden">
            <div className="absolute -left-5 -bottom-10 opacity-10"><Activity size={170} /></div>
            <div className="relative flex items-start justify-between">
              <div><p className="text-sm text-white/70 font-bold">نسبة معالجة البلاغات</p><p className="text-4xl font-extrabold mt-3">{reviewRate}%</p><p className="text-xs text-white/65 mt-2">{reviewedCount} من {totalReports} بلاغات تمت مراجعتها</p></div>
              <div className="p-3 bg-white/10 rounded-2xl"><TrendingUp className="w-6 h-6" /></div>
            </div>
            <div className="mt-5 h-2 rounded-full bg-white/15 overflow-hidden"><div className="h-full rounded-full bg-emerald-300" style={{ width: `${reviewRate}%` }} /></div>
          </div>
          <div className="bg-brand-surface border border-gray-100 p-6 rounded-[24px] shadow-sm">
            <h3 className="font-bold text-brand-text text-sm mb-4">ملخص الحالات</h3>
            <div className="space-y-3">{threatAllocation.filter(item => item.name !== 'لا توجد بيانات').map(item => {
              const percent = totalReports ? Math.round(item.value / totalReports * 100) : 0;
              return <div key={item.name}><div className="flex justify-between text-xs font-bold mb-1"><span className="text-brand-text/70">{item.name}</span><span className="text-brand-text">{item.value} · {percent}%</span></div><div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: item.color }} /></div></div>;
            })}</div>
          </div>
        </div>

        {/* 4. أكثر النطاقات استهدافاً (من بيانات الإيميلات الحقيقية) */}
        <div className="bg-brand-surface border border-gray-100 p-6 rounded-[24px] shadow-sm">
          <h3 className="font-bold text-brand-text text-sm mb-6">أكثر النطاقات المرسلة</h3>
          <div className="space-y-5">
            {topDomains.length > 0 ? topDomains.map((item, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${item.isDanger ? 'bg-brand-danger' : 'bg-brand-primary'}`}>
                    {item.domain.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-brand-text font-mono" dir="ltr">{item.domain}</p>
                    <p className="text-xs text-brand-text/50">إجمالي: {item.count} بلاغات</p>
                  </div>
                </div>
                <div className="text-left">
                  <p className={`text-xs font-bold ${item.isDanger ? 'text-brand-danger' : 'text-brand-primary'}`} dir="ltr">{item.trend}</p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-brand-text/50 text-center py-4">لا توجد بيانات للنطاقات بعد.</p>
            )}
          </div>
        </div>

        {/* 5. مقارنة الأسبوع الحالي بالماضي (بيانات حقيقية) */}
        <div className="lg:col-span-2 bg-brand-surface border border-gray-100 p-6 rounded-[24px] shadow-sm">
          <h3 className="font-bold text-brand-text text-sm mb-6">مقارنة النشاط (هذا الأسبوع مقابل الأسبوع الماضي)</h3>
          <div className="h-[250px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dy={10} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dx={-10} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f3f4f6' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="currentWeek" name="هذا الأسبوع" fill="#18A982" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lastWeek" name="الأسبوع الماضي" fill="#D88E27" radius={[4, 4, 0, 0]} opacity={0.6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
