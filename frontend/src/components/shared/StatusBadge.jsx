import React from 'react';

export function StatusBadge({ status }) {
  // مطابقة الحالات البرمجية مع التصميم (أحمر، برتقالي، أخضر)
  const getStatusStyle = (status) => {
    if (status === 'malicious') {
      return { bg: 'bg-brand-danger/10', text: 'text-brand-danger', label: 'مرتفع' };
    }
    if (status === 'queued_sandbox' || status === 'pending') {
      return { bg: 'bg-brand-warning/10', text: 'text-brand-warning', label: 'متوسط' };
    }
    return { bg: 'bg-brand-primary/10', text: 'text-brand-primary', label: 'منخفض' };
  };

  const theme = getStatusStyle(status);

  return (
    <span className={`px-4 py-1.5 rounded-full text-xs font-bold font-cairo ${theme.bg} ${theme.text}`}>
      {theme.label}
    </span>
  );
}