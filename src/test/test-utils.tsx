import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { routerFutureFlags } from "@/lib/router-future-flags";

export function renderWithProviders(ui: ReactNode, { initialEntries = ["/"] } = {}) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries} future={routerFutureFlags}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
}
