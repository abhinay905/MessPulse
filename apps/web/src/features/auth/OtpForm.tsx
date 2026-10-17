import React, { useState, useEffect } from 'react';
import { Mail, KeyRound, ArrowRight, ArrowLeft } from 'lucide-react';
import { useAuth } from './useAuth';
import { Button } from '../../components/ui/Button';
import { formatErrorMessage } from '../../lib/errors';

interface OtpFormProps {
  onSuccess: () => void;
}

export const OtpForm: React.FC<OtpFormProps> = ({ onSuccess }) => {
  const { requestOtp, verifyOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setError(null);
    setIsLoading(true);

    try {
      await requestOtp(email);
      setStep('code');
      setCountdown(60);
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setError(null);
    setIsLoading(true);

    try {
      await verifyOtp(email, code);
      onSuccess();
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-xl bg-rose-950/70 border border-rose-500/30 text-rose-300 text-xs leading-relaxed"
        >
          {error}
        </div>
      )}

      {step === 'email' ? (
        <form onSubmit={handleRequestOtp} className="space-y-4">
          <div>
            <label htmlFor="student-email" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Student Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                id="student-email"
                type="email"
                required
                placeholder="rollno@college.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              We&apos;ll send a one-time 6-digit access code to your email.
            </p>
          </div>

          <Button
            type="submit"
            size="lg"
            isLoading={isLoading}
            rightIcon={<ArrowRight className="w-4 h-4" />}
            className="w-full mt-2"
          >
            Send Access Code
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="otp-code" className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                6-Digit Access Code
              </label>
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setError(null);
                  setCode('');
                }}
                className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 font-medium"
              >
                <ArrowLeft className="w-3 h-3" /> Change email
              </button>
            </div>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                id="otp-code"
                type="text"
                pattern="[0-9]*"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                autoFocus
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-base font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span>Code sent to {email}</span>
              {countdown > 0 ? (
                <span className="text-slate-500 font-mono">Resend in {countdown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={isLoading}
                  className="text-brand-400 hover:text-brand-300 font-medium"
                >
                  Resend code
                </button>
              )}
            </div>
          </div>

          <Button
            type="submit"
            size="lg"
            isLoading={isLoading}
            disabled={code.length !== 6}
            className="w-full mt-2"
          >
            Verify &amp; Continue
          </Button>
        </form>
      )}
    </div>
  );
};
