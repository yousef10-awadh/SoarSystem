import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, User, AlertCircle, Loader2 } from 'lucide-react';
import api from '../api/axios';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('auth/login/', { username, password });
      
      // حفظ التوكن وبيانات المستخدم
      localStorage.setItem('access_token', response.data.access);
      localStorage.setItem('refresh_token', response.data.refresh);
      localStorage.setItem('username', username);
      localStorage.setItem('first_name', response.data.first_name || '');
      localStorage.setItem('role', response.data.role || 'employee');
      
      // حفظ صلاحية المستخدم (تأكد أن جانجو يرسل is_staff في الاستجابة)
      const isStaff = response.data.is_staff === true || ['admin', 'analyst', 'trainer'].includes(response.data.role);
      localStorage.setItem('is_staff', isStaff);

      // التوجيه الذكي: الإدارة للداشبورد، والموظف العادي لبوابة التدريب
      if (isStaff) {
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/training', { replace: true });
      }
    } catch (err) {
      setError('فشل تسجيل الدخول: تأكد من بيانات حساب Active Directory أو حساب النظام.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center font-cairo p-4" dir="rtl">
      <div className="max-w-md w-full bg-brand-surface border border-gray-100 rounded-[24px] shadow-xl p-8 md:p-10 animate-in fade-in zoom-in duration-300">
        
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <ShieldCheck className="w-8 h-8 text-brand-primary" />
          </div>
          <h1 className="text-2xl font-extrabold text-brand-text mb-1">مِرصاد</h1>
          <p className="text-sm font-bold text-brand-text/50">Security Awareness & Phishing System</p>
          <p className="text-xs text-brand-text/40 mt-1">بوابة الدخول الموحد (LAB.local AD & Admin)</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 animate-in fade-in">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-bold">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-brand-text mb-2">اسم المستخدم (Username)</label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                <User className="w-5 h-5 text-brand-text/40" />
              </div>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin أو user@LAB.local"
                className="w-full bg-brand-bg border border-gray-200 rounded-xl py-3.5 pr-12 pl-4 text-brand-text font-medium focus:ring-2 focus:ring-brand-primary outline-none transition-all placeholder:text-gray-400"
                dir="ltr"
                style={{ textAlign: 'left' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-brand-text mb-2">كلمة المرور (Password)</label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                <Lock className="w-5 h-5 text-brand-text/40" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-brand-bg border border-gray-200 rounded-xl py-3.5 pr-12 pl-4 text-brand-text font-bold focus:ring-2 focus:ring-brand-primary outline-none transition-all placeholder:text-gray-400 tracking-widest"
                dir="ltr"
                style={{ textAlign: 'left' }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-brand-primary/30 flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> جاري التحقق...
              </>
            ) : (
              'تسجيل الدخول'
            )}
          </button>
        </form>
        
        <p className="text-center text-xs font-bold text-brand-text/40 mt-8">
          جميع الحقوق محفوظة &copy; {new Date().getFullYear()} • مركز حماية البريد (مِرصاد)
        </p>
      </div>
    </div>
  );
}
