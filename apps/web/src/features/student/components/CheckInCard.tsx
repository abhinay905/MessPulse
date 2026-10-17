import React, { useState } from 'react';
import { QrCode, CheckCircle2, Clock, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useActiveSession } from '../hooks/useActiveSession';
import { getCurrentLocation } from '../../../lib/geolocation';
import { formatErrorMessage } from '../../../lib/errors';

export type CheckInCardState = 'idle' | 'locating' | 'submitting' | 'active' | 'error';

interface CheckInCardProps {
  initialToken?: string;
  onCheckInSuccess?: () => void;
}

export const CheckInCard: React.FC<CheckInCardProps> = ({
  initialToken,
  onCheckInSuccess,
}) => {
  const { session, remainingSec, checkIn, endSession, isLoading: isSessionLoading } = useActiveSession();

  const [state, setState] = useState<CheckInCardState>(session ? 'active' : 'idle');
  const [tokenInput, setTokenInput] = useState<string>(initialToken || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEnding, setIsEnding] = useState<boolean>(false);
  const hasAutoSubmittedRef = React.useRef(false);

  // Sync state if session changes
  React.useEffect(() => {
    if (session) {
      setState('active');
    } else if (state === 'active') {
      setState('idle');
    }
  }, [session, state]);

  // If initialToken is provided and not in session, auto-trigger check-in once
  React.useEffect(() => {
    if (initialToken && !session && !isSessionLoading && state === 'idle' && !hasAutoSubmittedRef.current) {
      hasAutoSubmittedRef.current = true;
      performCheckIn(initialToken);
    }
  }, [initialToken, session, isSessionLoading, state]);

  const performCheckIn = async (token: string) => {
    if (!token.trim()) return;

    setErrorMessage(null);
    setState('locating');

    // 1. Acquire geolocation with 5s timeout (returns undefined on denial)
    let geo;
    try {
      geo = await getCurrentLocation(5000);
    } catch {
      geo = undefined;
    }

    // 2. Submit check-in
    setState('submitting');
    try {
      await checkIn(token, geo);
      setState('active');
      onCheckInSuccess?.();
    } catch (err) {
      setState('error');
      setErrorMessage(formatErrorMessage(err));
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performCheckIn(tokenInput);
  };

  const handleEndEarly = async () => {
    setIsEnding(true);
    try {
      await endSession();
      setState('idle');
      setTokenInput('');
    } finally {
      setIsEnding(false);
    }
  };

  // Format countdown mm:ss
  const formatCountdown = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isSessionLoading) {
    return (
      <Card className="p-4 flex items-center justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-brand-500" />
        <span className="text-xs">Checking session status...</span>
      </Card>
    );
  }

  // ACTIVE STATE
  if (state === 'active' && session) {
    const geofenceBadgeVariant =
      session.geofence === 'inside'
        ? 'low'
        : session.geofence === 'outside'
        ? 'high'
        : 'neutral';

    return (
      <Card elevated className="p-5 border-brand-500/30 bg-brand-950/20 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-white">
              Active Meal Session
            </h2>
          </div>
          <Badge variant={geofenceBadgeVariant} className="text-[10px] uppercase">
            {session.geofence === 'inside'
              ? 'In Mess Hall'
              : session.geofence === 'outside'
              ? 'Outside Geofence'
              : 'Location Unverified'}
          </Badge>
        </div>

        <div className="flex items-center justify-between py-2 px-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-brand-400" />
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                Estimated Time Left
              </span>
              <span className="text-2xl font-black font-mono text-white tracking-tight">
                {formatCountdown(remainingSec)}
              </span>
            </div>
          </div>
          <CheckCircle2 className="w-8 h-8 text-emerald-400 opacity-80" />
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed">
          Your seat is registered. Tap when you finish dining to help keep wait estimates accurate for others.
        </p>

        <Button
          type="button"
          variant="secondary"
          size="md"
          isLoading={isEnding}
          onClick={handleEndEarly}
          leftIcon={<Check className="w-4 h-4 text-emerald-400" />}
          className="w-full font-semibold border-slate-700 hover:border-slate-600"
        >
          I&apos;m Done Eating
        </Button>
      </Card>
    );
  }

  // LOCATING / SUBMITTING STATE
  if (state === 'locating' || state === 'submitting') {
    return (
      <Card className="p-5 text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-brand-500" />
        <h2 className="text-sm font-bold text-white">
          {state === 'locating' ? 'Verifying location…' : 'Starting dining session…'}
        </h2>
        <p className="text-xs text-slate-400 max-w-xs mx-auto">
          {state === 'locating'
            ? 'Checking mess hall geofence (takes up to 5s, optional)…'
            : 'Registering your check-in with the mess server…'}
        </p>
      </Card>
    );
  }

  // ERROR STATE
  if (state === 'error') {
    return (
      <Card className="p-5 border-rose-500/30 bg-rose-950/20 space-y-3">
        <div className="flex items-center gap-2 text-rose-400">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <h2 className="text-sm font-bold">Check-In Failed</h2>
        </div>
        <p className="text-xs text-rose-200 leading-relaxed">
          {errorMessage || 'Unable to check in. Please ensure you scanned the current meal QR code.'}
        </p>
        <div className="pt-1 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setState('idle');
              setErrorMessage(null);
            }}
            className="flex-1 text-xs"
          >
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  // IDLE STATE
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-950/80 border border-brand-500/30 text-brand-400 flex items-center justify-center shrink-0">
            <QrCode className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Meal Check-In
            </h2>
            <p className="text-[11px] text-slate-400">
              Scan the physical QR at the mess counter with your camera.
            </p>
          </div>
        </div>
      </div>

      {/* Token input fallback / demo testing */}
      <form onSubmit={handleManualSubmit} className="pt-1 flex gap-2">
        <input
          type="text"
          placeholder="Paste meal token (e.g. from QR)"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!tokenInput.trim()}
          className="shrink-0 text-xs"
        >
          Check In
        </Button>
      </form>
    </Card>
  );
};
