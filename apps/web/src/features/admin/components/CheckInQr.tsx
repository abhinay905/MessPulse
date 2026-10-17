/**
 * features/admin/components/CheckInQr.tsx — On-screen QR code for student check-in testing.
 * DOC3 §3.7, DOC4 Step 14.
 */

import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Copy, Check, ExternalLink, RefreshCw } from 'lucide-react';
import type { CheckinTokenResponse } from '@messpulse/shared';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';

export interface CheckInQrProps {
  mealId?: string | null | undefined;
  qrData?: CheckinTokenResponse | null | undefined;
  tokenData?: CheckinTokenResponse | null | undefined;
  isLoading?: boolean | undefined;
  error?: string | null | undefined;
  onRefresh?: (() => Promise<void> | void) | undefined;
  onRegenerate?: (() => Promise<void> | void) | undefined;
}

export const CheckInQr: React.FC<CheckInQrProps> = ({
  mealId,
  qrData,
  tokenData,
  isLoading = false,
  error = null,
  onRefresh,
  onRegenerate,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const data = tokenData ?? qrData ?? null;
  const triggerRefresh = () => {
    if (onRegenerate) void onRegenerate();
    else if (onRefresh) void onRefresh();
  };

  const handleCopy = async () => {
    if (!data?.url) return;
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  if (!mealId && !data) {
    return (
      <Card className="p-5 text-center space-y-2" data-testid="checkin-qr">
        <QrCode className="w-8 h-8 text-slate-500 mx-auto" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          Check-In QR Code
        </h3>
        <p className="text-xs text-slate-400">
          No meal is currently active. Start a shift or the demo simulator to generate a check-in QR code.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-4" data-testid="checkin-qr">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <QrCode className="w-4 h-4 text-brand-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Check-In Hall Entrance QR
          </h2>
        </div>
        <button
          type="button"
          onClick={triggerRefresh}
          disabled={isLoading}
          title="Refresh QR token"
          aria-label="Refresh QR token"
          className="text-slate-400 hover:text-white p-1 rounded transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg text-xs text-red-300">
          {error}
        </div>
      )}

      <p className="text-xs text-slate-400">
        Display on the entrance tablet or print for the turnstile. Scanning immediately routes to the student check-in card.
      </p>

      {/* QR Code Container */}
      <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-inner mx-auto max-w-xs">
        {data?.url ? (
          <QRCodeSVG
            value={data.url}
            size={180}
            level="M"
            includeMargin
            aria-label="Student check-in QR code"
          />
        ) : (
          <div className="w-44 h-44 bg-slate-200 rounded-lg animate-pulse flex items-center justify-center text-slate-400 text-xs font-mono">
            Generating QR…
          </div>
        )}
      </div>

      {data?.url && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={data.url}
              className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-slate-300 font-mono select-all focus:outline-none"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={handleCopy}
              className="shrink-0 text-xs flex items-center gap-1"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <a
              href={data.url}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white transition-colors"
              title="Open student check-in link"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </Card>
  );
};
export default CheckInQr;
