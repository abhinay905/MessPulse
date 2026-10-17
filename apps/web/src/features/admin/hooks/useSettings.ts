/**
 * features/admin/hooks/useSettings.ts — Hook for managing mess settings.
 * DOC3 §3.7.
 */

import { useState, useEffect, useCallback } from 'react';
import type { SettingsDTO, SettingsPatch } from '@messpulse/shared';
import { fetchApi } from '../../../lib/http';
import { ApiError } from '../../../lib/errors';

export interface UseSettingsResult {
  settings: SettingsDTO | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
  isConflict: boolean;
  updateSettings: (patch: SettingsPatch) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export function useSettings(messId: string = 'mess-main-hall'): UseSettingsResult {
  const [settings, setSettings] = useState<SettingsDTO | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isConflict, setIsConflict] = useState<boolean>(false);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setIsConflict(false);
    setFieldErrors({});

    try {
      const data = await fetchApi<SettingsDTO>(`/api/v1/admin/mess/${messId}/settings`);
      setSettings(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load settings');
      }
    } finally {
      setIsLoading(false);
    }
  }, [messId]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const updateSettings = async (patch: SettingsPatch): Promise<boolean> => {
    setIsSaving(true);
    setError(null);
    setFieldErrors({});
    setIsConflict(false);

    try {
      const updated = await fetchApi<SettingsDTO>(`/api/v1/admin/mess/${messId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...patch,
          expectedUpdatedAt: settings?.updatedAt,
        }),
      });

      setSettings(updated);
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.httpStatus === 409) {
          setIsConflict(true);
          setError('Settings were modified by another administrator. Please reload.');
        } else if (err.httpStatus === 422 && err.details) {
          const map: Record<string, string> = {};
          for (const d of err.details) {
            map[d.field] = d.issue;
          }
          setFieldErrors(map);
          setError(err.message || 'Validation error');
        } else {
          setError(err.message);
        }
      } else {
        setError(err instanceof Error ? err.message : 'Failed to update settings');
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    settings,
    isLoading,
    isSaving,
    error,
    fieldErrors,
    isConflict,
    updateSettings,
    refetch: fetchSettings,
  };
}
