/**
 * features/optouts/hooks/useOptOut.ts — Hook for student meal opt-out status and actions.
 * DOC3 §3.13, DOC4 Step 17.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../../../lib/http';
import type { OptOutResponse } from '@messpulse/shared';

export function useOptOut(mealId: string | null) {
  const queryClient = useQueryClient();

  const queryKey = ['optouts', 'me', mealId];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<OptOutResponse> => {
      if (!mealId) {
        return { optedOut: false, cutoffAt: 0 };
      }
      return fetchApi<OptOutResponse>('/api/v1/optouts/me', {
        params: { mealId },
      });
    },
    enabled: Boolean(mealId),
    staleTime: 30000,
  });

  const toggleMutation = useMutation({
    mutationFn: async (currentlyOptedOut: boolean) => {
      if (!mealId) return;
      if (currentlyOptedOut) {
        // Cancel opt-out
        await fetchApi('/api/v1/optouts', {
          method: 'DELETE',
          body: JSON.stringify({ mealId }),
        });
      } else {
        // Mark opt-out
        await fetchApi<OptOutResponse>('/api/v1/optouts', {
          method: 'POST',
          body: JSON.stringify({ mealId }),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    optedOut: query.data?.optedOut ?? false,
    cutoffAt: query.data?.cutoffAt ?? 0,
    isLoading: query.isLoading,
    isUpdating: toggleMutation.isPending,
    error: toggleMutation.error || query.error,
    toggleOptOut: () => toggleMutation.mutate(query.data?.optedOut ?? false),
  };
}
