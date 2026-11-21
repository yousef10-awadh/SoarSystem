import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TrainingPortal from './pages/TrainingPortal';
import CourseManagement from './pages/CourseManagement';
import CampaignManagement from './pages/CampaignManagement';

// حماية المسارات العامة (يجب أن يكون مسجلاً للدخول فقط)
function PrivateRoute({ children }) {
  const token = localStorage.getItem('access_token');
  return token ? children : <Navigate to="/login" />;
}

// حماية المسارات الإدارية (يجب أن يكون مسجلاً + يمتلك صلاحية)
function AdminRoute({ children }) {
  const token = localStorage.getItem('access_token');
  const role = localStorage.getItem('role');
  if (!token) return <Navigate to="/login" replace />;
  return localStorage.getItem('is_staff') === 'true' || ['admin', 'analyst', 'trainer'].includes(role)
    ? children
    : <Navigate to="/training" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* مسارات الإدارة (محمية بـ AdminRoute) */}
        <Route path="/dashboard" element={<AdminRoute><Dashboard /></AdminRoute>} />
        <Route path="/security-scan" element={<AdminRoute><Dashboard /></AdminRoute>} />
        <Route path="/admin/courses" element={<AdminRoute><CourseManagement /></AdminRoute>} />
        <Route path="/admin/campaigns" element={<AdminRoute><CampaignManagement /></AdminRoute>} />
        
        <Route path="/training" element={<PrivateRoute><TrainingPortal /></PrivateRoute>} />

        {/* مسار الخطأ الافتراضي: يوجه حسب الصلاحية */}
        <Route path="*" element={<Navigate to={localStorage.getItem('access_token') ? (localStorage.getItem('is_staff') === 'true' || ['admin', 'analyst', 'trainer'].includes(localStorage.getItem('role')) ? '/dashboard' : '/training') : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
