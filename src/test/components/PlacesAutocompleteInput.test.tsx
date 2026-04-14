import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlacesAutocompleteInput, StaticMapPreview } from "@/components/PlacesAutocompleteInput";

vi.mock("@/lib/runtime-config", () => ({
  runtimeConfig: {
    googleMapsApiKey: "test-maps-key",
  },
  getRuntimeConfig: () => ({
    googleMapsApiKey: "test-maps-key",
    publicSiteUrl: "http://localhost:8080",
    supabaseUrl: "http://localhost:54321",
    supabaseAnonKey: "test",
    stripe: { priceIds: { starter: { monthly: "", annual: "" }, growth: { monthly: "", annual: "" } }, customerPortalUrl: null },
  }),
  buildRuntimeConfig: () => ({
    googleMapsApiKey: "test-maps-key",
    publicSiteUrl: "http://localhost:8080",
    supabaseUrl: "http://localhost:54321",
    supabaseAnonKey: "test",
    stripe: { priceIds: { starter: { monthly: "", annual: "" }, growth: { monthly: "", annual: "" } }, customerPortalUrl: null },
  }),
}));

describe("PlacesAutocompleteInput", () => {
  beforeEach(() => {
    const autocompleteService = {
      getPlacePredictions: vi.fn((request, callback) => {
        callback(
          [{
            place_id: "place-1",
            description: "14 Rue de la Paix, Lyon, France",
            structured_formatting: {
              main_text: "14 Rue de la Paix",
              secondary_text: "Lyon, France",
            },
          }],
          "OK",
        );
      }),
    };

    const placesService = {
      getDetails: vi.fn((request, callback) => {
        callback({
          place_id: request.placeId,
          formatted_address: "14 Rue de la Paix, 69002 Lyon, France",
          opening_hours: {
            weekday_text: [
              "Monday: 9:00 AM – 6:00 PM",
              "Tuesday: 9:00 AM – 6:00 PM",
              "Wednesday: 9:00 AM – 6:00 PM",
              "Thursday: 9:00 AM – 6:00 PM",
              "Friday: 9:00 AM – 6:00 PM",
              "Saturday: Closed",
              "Sunday: Closed",
            ],
          },
          geometry: {
            location: {
              lat: () => 45.7608,
              lng: () => 4.8597,
            },
          },
        }, "OK");
      }),
    };

    Object.defineProperty(window, "google", {
      configurable: true,
      value: {
        maps: {
          places: {
            AutocompleteService: vi.fn(() => autocompleteService),
            PlacesService: vi.fn(() => placesService),
            PlacesServiceStatus: { OK: "OK" },
          },
        },
      },
    });
  });

  afterEach(() => {
    document.getElementById("olia-gmaps")?.remove();
    // @ts-expect-error cleanup test shim
    delete window.google;
  });

  it("shows suggestions and returns the selected official place details", async () => {
    const onChange = vi.fn();
    const onPlaceSelect = vi.fn();

    render(
      <PlacesAutocompleteInput
        value=""
        onChange={onChange}
        onPlaceSelect={onPlaceSelect}
        className="w-full"
        placeholder="Search address"
      />,
    );

    const script = document.getElementById("olia-gmaps");
    if (script) {
      await act(async () => {
        fireEvent.load(script as HTMLScriptElement);
      });
    }

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Search address"), {
        target: { value: "14 Rue" },
      });
      await new Promise(resolve => setTimeout(resolve, 350));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /14 rue de la paix/i })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /14 rue de la paix/i }));
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("14 Rue de la Paix, Lyon, France");
    });

    expect(onPlaceSelect).toHaveBeenCalledWith({
      address: "14 Rue de la Paix, 69002 Lyon, France",
      lat: 45.7608,
      lng: 4.8597,
      placeId: "place-1",
      openingHoursText: [
        "Monday: 9:00 AM – 6:00 PM",
        "Tuesday: 9:00 AM – 6:00 PM",
        "Wednesday: 9:00 AM – 6:00 PM",
        "Thursday: 9:00 AM – 6:00 PM",
        "Friday: 9:00 AM – 6:00 PM",
        "Saturday: Closed",
        "Sunday: Closed",
      ],
    });
  });
});

describe("StaticMapPreview", () => {
  it("renders a map preview image for the selected coordinates", () => {
    render(<StaticMapPreview lat={45.7608} lng={4.8597} />);

    const preview = screen.getByAltText("Location map preview");
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveAttribute("src", expect.stringContaining("center=45.7608,4.8597"));
  });
});
