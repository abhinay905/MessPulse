import React, { useState } from 'react';
import { UserCheck, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from './useAuth';
import { Button } from '../../components/ui/Button';
import { formatErrorMessage } from '../../lib/errors';

interface StaffPinFormProps {
  onSuccess: () => void;
}

export const StaffPinForm: React.FC<StaffPinFormProps> = ({ onSuccess }) => {
  const { loginStaff } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !pin.trim()) return;

    setError(null);
    setIsLoading(true);

    try {
      await loginStaff(identifier, pin);
      onSuccess();
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/30 text-rose-300 text-xs leading-relaxed"
        >
          {error}
        </div>
      )}

      <div>
        <label htmlFor="staff-identifier" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
          Staff / Admin ID
        </label>
        <div className="relative">
          <UserCheck className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            id="staff-identifier"
            type="text"
            required
            placeholder="e.g. staff-1 or admin"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
          />
        </div>
      </div>

      <div>
        <label htmlFor="staff-pin" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
          PIN / Password
        </label>
        <div className="relative">
          <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            id="staff-pin"
            type="password"
            required
            placeholder="Enter security PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
          />
        </div>
      </div>

      <Button
        type="submit"
        size="lg"
        isLoading={isLoading}
        rightIcon={<ArrowRight className="w-4 h-4" />}
        className="w-full mt-2"
      >
        Staff Sign In
      </Button>
    </form>
  );
};
