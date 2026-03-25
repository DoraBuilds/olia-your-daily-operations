import {
  locations,
  mockFolders,
  mockChecklistItems,
  mockActions,
  mockLogs,
  multipleChoiceSets,
  RESPONSE_TYPES,
  actionStatusStyle,
  actionStatusLabel,
} from "@/pages/checklists/data";

describe("locations", () => {
  it("is an array", () => {
    expect(Array.isArray(locations)).toBe(true);
  });

  it("has at least one entry", () => {
    expect(locations.length).toBeGreaterThan(0);
  });

  it("includes 'All locations'", () => {
    expect(locations).toContain("All locations");
  });

  it("includes 'Main Branch'", () => {
    expect(locations).toContain("Main Branch");
  });
});

describe("mockFolders", () => {
  it("is an array", () => {
    expect(Array.isArray(mockFolders)).toBe(true);
  });

  it("has items", () => {
    expect(mockFolders.length).toBeGreaterThan(0);
  });

  it("each item has required fields", () => {
    mockFolders.forEach((f) => {
      expect(f).toHaveProperty("id");
      expect(f).toHaveProperty("name");
      expect(f).toHaveProperty("type");
      expect(f.type).toBe("folder");
    });
  });

  it("first folder is Daily Operations", () => {
    expect(mockFolders[0].name).toBe("Daily Operations");
  });
});

describe("mockChecklistItems", () => {
  it("is an array", () => {
    expect(Array.isArray(mockChecklistItems)).toBe(true);
  });

  it("has items", () => {
    expect(mockChecklistItems.length).toBeGreaterThan(0);
  });

  it("each item has required fields", () => {
    mockChecklistItems.forEach((c) => {
      expect(c).toHaveProperty("id");
      expect(c).toHaveProperty("title");
      expect(c).toHaveProperty("type");
      expect(c.type).toBe("checklist");
      expect(c).toHaveProperty("questionsCount");
    });
  });

  it("includes Opening Checklist", () => {
    const found = mockChecklistItems.find((c) => c.title === "Opening Checklist");
    expect(found).toBeDefined();
  });
});

describe("mockActions", () => {
  it("is an array", () => {
    expect(Array.isArray(mockActions)).toBe(true);
  });

  it("has items", () => {
    expect(mockActions.length).toBeGreaterThan(0);
  });

  it("each action has required fields", () => {
    mockActions.forEach((a) => {
      expect(a).toHaveProperty("id");
      expect(a).toHaveProperty("title");
      expect(a).toHaveProperty("status");
    });
  });

  it("statuses are valid values", () => {
    const validStatuses = ["open", "in-progress", "resolved"];
    mockActions.forEach((a) => {
      expect(validStatuses).toContain(a.status);
    });
  });
});

describe("mockLogs", () => {
  it("is an array", () => {
    expect(Array.isArray(mockLogs)).toBe(true);
  });

  it("has items", () => {
    expect(mockLogs.length).toBeGreaterThan(0);
  });

  it("each log has required fields", () => {
    mockLogs.forEach((l) => {
      expect(l).toHaveProperty("id");
      expect(l).toHaveProperty("checklist");
      expect(l).toHaveProperty("completedBy");
      expect(l).toHaveProperty("score");
    });
  });

  it("scores are numbers between 0 and 100", () => {
    mockLogs.forEach((l) => {
      expect(l.score).toBeGreaterThanOrEqual(0);
      expect(l.score).toBeLessThanOrEqual(100);
    });
  });
});

describe("multipleChoiceSets", () => {
  it("is an array", () => {
    expect(Array.isArray(multipleChoiceSets)).toBe(true);
  });

  it("has items", () => {
    expect(multipleChoiceSets.length).toBeGreaterThan(0);
  });

  it("each set has id, name, choices, and colors", () => {
    multipleChoiceSets.forEach((mc) => {
      expect(mc).toHaveProperty("id");
      expect(mc).toHaveProperty("name");
      expect(Array.isArray(mc.choices)).toBe(true);
      expect(Array.isArray(mc.colors)).toBe(true);
    });
  });

  it("includes Good/Fair/Poor set", () => {
    const found = multipleChoiceSets.find((mc) => mc.name === "Good / Fair / Poor");
    expect(found).toBeDefined();
  });
});

describe("RESPONSE_TYPES", () => {
  it("is an array", () => {
    expect(Array.isArray(RESPONSE_TYPES)).toBe(true);
  });

  it("has 5 response types (datetime, signature, person removed from builder)", () => {
    // datetime, signature, person are no longer exposed in the builder UI.
    // checkbox, text, number, media, instruction remain.
    expect(RESPONSE_TYPES).toHaveLength(5);
  });

  it("includes checkbox type", () => {
    const found = RESPONSE_TYPES.find((r) => r.key === "checkbox");
    expect(found).toBeDefined();
    expect(found?.label).toBe("Checkbox");
  });

  it("includes text type", () => {
    const found = RESPONSE_TYPES.find((r) => r.key === "text");
    expect(found).toBeDefined();
  });

  it("each type has key, label, and icon", () => {
    RESPONSE_TYPES.forEach((r) => {
      expect(r).toHaveProperty("key");
      expect(r).toHaveProperty("label");
      expect(r).toHaveProperty("icon");
    });
  });
});

describe("actionStatusStyle", () => {
  it("has style for 'open'", () => {
    expect(actionStatusStyle["open"]).toBeDefined();
    expect(typeof actionStatusStyle["open"]).toBe("string");
  });

  it("has style for 'in-progress'", () => {
    expect(actionStatusStyle["in-progress"]).toBeDefined();
  });

  it("has style for 'resolved'", () => {
    expect(actionStatusStyle["resolved"]).toBeDefined();
  });
});

describe("actionStatusLabel", () => {
  it("has label for 'open'", () => {
    expect(actionStatusLabel["open"]).toBe("Open");
  });

  it("has label for 'in-progress'", () => {
    expect(actionStatusLabel["in-progress"]).toBe("In progress");
  });

  it("has label for 'resolved'", () => {
    expect(actionStatusLabel["resolved"]).toBe("Resolved");
  });
});
