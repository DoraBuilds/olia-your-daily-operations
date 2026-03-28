import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
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
  const router = createMemoryRouter(
    [{ path: "*", element: ui }],
    {
      initialEntries,
      future: routerFutureFlags,
    }
  );
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider
        router={router}
        future={{ v7_startTransition: true }}
      />
    </QueryClientProvider>
  );
}
