import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UtensilsCrossed, Sparkles } from 'lucide-react';
import { useAuth } from './useAuth';
import { OtpForm } from './OtpForm';
import { StaffPinForm } from './StaffPinForm';
import { Card } from '../../components/ui/Card';

export const LoginPage: React.FC = () => {
  const [tab, setTab] = useState<'student' | 'staff'>('student');
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const handleSuccess = () => {
    const fromLoc = (location.state as { from?: { pathname?: string; search?: string } })?.from;
    if (fromLoc?.pathname) {
      navigate(`${fromLoc.pathname}${fromLoc.search || ''}`, { replace: true });
      return;
    }

    if (user?.role === 'admin') {
      navigate('/admin');
    } else if (user?.role === 'staff') {
      navigate('/staff');
    } else {
      navigate('/student');
    }
  };

  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/40 via-slate-950 to-slate-950">
      <div className="w-full max-w-sm space-y-6">
        {/* Branding Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-400 shadow-xl shadow-brand-500/20 text-white mb-1">
            <UtensilsCrossed className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-1.5">
            MessPulse <Sparkles className="w-4 h-4 text-brand-400" />
          </h1>
          <p className="text-xs text-slate-400 max-w-[280px] mx-auto">
            Live hostel mess crowd, queue waits, and optimal meal windows.
          </p>
        </div>

        {/* Login Card */}
        <Card elevated className="p-6">
          {/* Tab Selector */}
          <div className="flex rounded-xl bg-slate-900/80 p-1 border border-slate-800 mb-6">
            <button
              type="button"
              onClick={() => setTab('student')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 ${
                tab === 'student'
                  ? 'bg-brand-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Student OTP
            </button>
            <button
              type="button"
              onClick={() => setTab('staff')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 ${
                tab === 'staff'
                  ? 'bg-brand-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Staff / Admin
            </button>
          </div>

          {tab === 'student' ? (
            <OtpForm onSuccess={handleSuccess} />
          ) : (
            <StaffPinForm onSuccess={handleSuccess} />
          )}
        </Card>

        {/* Footer info */}
        <footer className="text-center text-xs text-slate-500 space-y-1">
          <p>Privacy by Architecture: No faces or raw video ever leave the camera.</p>
        </footer>
      </div>
    </main>
  );
};
