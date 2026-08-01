import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import './index.css'
import App from './App.jsx'

// ---------------------------------------------------------------------------
// React Query client — global cache & default behaviour for all queries
// ---------------------------------------------------------------------------
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,     // Data stays fresh for 2 minutes
      gcTime: 1000 * 60 * 5,        // Unused cache is garbage-collected after 5 minutes
      retry: 1,                      // Retry failed queries once before showing error
      refetchOnWindowFocus: true,    // Refresh data when user tabs back
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
)
