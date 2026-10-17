/**
 * features/student/CheckInPage.tsx — URL target when student opens QR code with native phone camera.
 * DOC3 §3.4, DOC4 Step 12.
 *
 * Route: /student/checkin?t=<token>
 */

import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { UtensilsCrossed, ArrowLeft } from 'lucide-react';
import { CheckInCard } from './components/CheckInCard';

export const CheckInPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('t') || searchParams.get('token') || '';

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-slate-950 text-slate-100">
      <div className="w-full max-w-sm space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/student')}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 font-medium transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Live View
          </button>
          <div className="flex items-center gap-1.5 text-xs font-bold text-brand-400">
            <UtensilsCrossed className="w-4 h-4" /> MessPulse Check-In
          </div>
        </div>

        {/* Check In Action Card */}
        <CheckInCard
          initialToken={token}
          onCheckInSuccess={() => {
            // Give user a moment to see the active card, or stay on page
          }}
        />
      </div>
    </div>
  );
};
