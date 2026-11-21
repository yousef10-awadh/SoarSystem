import React from 'react';
import { ShieldCheck, LogOut } from 'lucide-react';

export default function Sidebar({ subtitle, userName, userRole, navItems, onLogout }) {
  return (
    <aside className="w-64 bg-brand-text text-white flex flex-col hidden md:flex min-h-screen border-l border-brand-primary/10 shadow-xl z-10 print:hidden shrink-0">
      
      {/* رأس الشريط الجانبي (الشعار) */}
      <div className="p-6 border-b border-white/10 flex items-center gap-3">
        <div className="bg-brand-primary p-2 rounded-xl">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-xl tracking-wide">مِرصاد</h1>
          <p className="text-[10px] text-white/50">{subtitle}</p>
        </div>
      </div>
      
      {/* روابط التنقل الديناميكية */}
      <nav className="p-4 space-y-2 flex-1">
        {navItems.map((item, index) => (
          <button
            key={index}
            onClick={item.onClick}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all cursor-pointer ${
              item.isActive 
                ? 'bg-white/5 text-brand-primary font-semibold border-r-4 border-brand-primary' 
                : 'text-white/70 hover:bg-white/5'
            }`}
          >
            <item.icon className="w-5 h-5" /> {item.label}
          </button>
        ))}
      </nav>
      
      {/* تذييل الشريط الجانبي (المستخدم وتسجيل الخروج) */}
      <div className="p-6 border-t border-white/10">
        <p className="text-xs text-white/50 mb-3">مساحة العمل</p>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-primary/20 flex items-center justify-center text-brand-primary font-bold">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="text-sm">
            <p className="font-semibold">{userName}</p>
            <p className="text-xs text-white/50">{userRole}</p>
          </div>
        </div>
        <button onClick={onLogout} className="mt-6 w-full flex items-center justify-center gap-2 text-red-400 hover:bg-red-400/10 px-4 py-2 rounded-lg text-sm transition-all cursor-pointer">
          <LogOut className="w-4 h-4" /> تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}