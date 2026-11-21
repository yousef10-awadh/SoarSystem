import React from 'react';

export function StatCard({ title, value, subtitle, icon: Icon, theme = 'primary' }) {
  // تحديد ألوان البطاقة بناءً على نوعها (أساسي، معلومات، أو تحذير)
  const themes = {
    primary: { bg: 'bg-brand-primary/10', text: 'text-brand-primary' },
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-500' },
    warning: { bg: 'bg-brand-warning/10', text: 'text-brand-warning' },
  };
  
  const currentTheme = themes[theme] || themes.primary;

  return (
    <div className="bg-brand-surface rounded-[20px] p-6 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center relative overflow-hidden font-cairo">
      {/* الخط العلوي البرتقالي لبطاقة التحذير فقط */}
      {theme === 'warning' && (
        <div className="absolute top-0 left-0 w-full h-1 bg-brand-warning"></div>
      )}
      
      {/* الأيقونة */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${currentTheme.bg} ${currentTheme.text}`}>
        <Icon className="w-5 h-5" />
      </div>
      
      {/* النصوص والأرقام */}
      <p className="text-brand-text/60 text-sm font-semibold mb-1">{title}</p>
      <p className="text-3xl font-bold text-brand-text">{value}</p>
      <p className={`text-xs mt-1 ${currentTheme.text}`}>{subtitle}</p>
    </div>
  );
}