import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function createDefaultQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 30, // 30 minutes
        retry: (failureCount, error) => {
          // Do not retry 401 or 404
          if (error && typeof error === "object" && "statusCode" in error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 401 || status === 404) return false;
          }
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export const queryClient = createDefaultQueryClient();

interface QueryProviderProps {
  children: React.ReactNode;
  client?: QueryClient;
}

export default function QueryProvider({ children, client }: QueryProviderProps) {
  const [activeClient] = useState(() => client ?? createDefaultQueryClient());

  return <QueryClientProvider client={activeClient}>{children}</QueryClientProvider>;
}
