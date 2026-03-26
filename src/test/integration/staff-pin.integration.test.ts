import { describe, expect, it } from "vitest";
import { supabase } from "@/lib/supabase";

const LOCATION_ID = "22222222-2222-4222-8222-222222222222";

describe("local Supabase integration", () => {
  it("validates the kiosk staff PIN through the real RPC", async () => {
    const { data, error } = await supabase.rpc("validate_staff_pin", {
      p_pin: "1234",
      p_location_id: LOCATION_ID,
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      first_name: "Ada",
      last_name: "Lovelace",
      role: "Chef",
    });
  });

  it("rejects an incorrect PIN", async () => {
    const { data, error } = await supabase.rpc("validate_staff_pin", {
      p_pin: "9999",
      p_location_id: LOCATION_ID,
    });

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
