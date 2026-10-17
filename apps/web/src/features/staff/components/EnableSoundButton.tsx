/**
 * features/staff/components/EnableSoundButton.tsx — Toggle/enable alert chimes.
 * DOC3 §3.6.
 */

import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

interface EnableSoundButtonProps {
  isSoundEnabled: boolean;
  onEnableSound: () => void;
}

export const EnableSoundButton: React.FC<EnableSoundButtonProps> = ({
  isSoundEnabled,
  onEnableSound,
}) => {
  if (isSoundEnabled) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
        <Volume2 className="w-3.5 h-3.5" />
        <span>Sound Enabled</span>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={onEnableSound}
      leftIcon={<VolumeX className="w-3.5 h-3.5 text-amber-400" />}
      className="text-xs font-medium border-slate-700 hover:border-slate-600 bg-slate-900"
    >
      Enable sound
    </Button>
  );
};
