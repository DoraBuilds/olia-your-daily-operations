import {
  DEFAULT_INFOHUB_ACCESS,
  type InfohubAccessControl,
  type InfohubSection,
} from "@/lib/infohub-access";

export interface InfohubLibraryFolder {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number | null;
  access: InfohubAccessControl;
}

export interface InfohubLibraryDoc {
  id: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  lastUpdated: string;
  folderId: string;
  access: InfohubAccessControl;
}

export interface InfohubTrainingFolder {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number | null;
  access: InfohubAccessControl;
}

export interface InfohubTrainingDoc {
  id: string;
  title: string;
  duration: string;
  completed: boolean;
  folderId: string;
  steps: string[];
  access: InfohubAccessControl;
}

export interface LinkableInfohubResource {
  id: string;
  title: string;
  section: InfohubSection;
  subtitle: string;
  body: string;
  access: InfohubAccessControl;
}

export const initialLibraryFolders: InfohubLibraryFolder[] = [
  { id: "f1", name: "Cleaning & Maintenance", parentId: null, sortOrder: null, access: DEFAULT_INFOHUB_ACCESS },
  { id: "f2", name: "Food Safety", parentId: null, sortOrder: null, access: DEFAULT_INFOHUB_ACCESS },
  { id: "f3", name: "Opening & Closing", parentId: null, sortOrder: null, access: DEFAULT_INFOHUB_ACCESS },
  { id: "f4", name: "Service Standards", parentId: null, sortOrder: null, access: DEFAULT_INFOHUB_ACCESS },
  { id: "f5", name: "Allergen Protocols", parentId: "f2", sortOrder: null, access: DEFAULT_INFOHUB_ACCESS },
];

export const initialLibraryDocs: InfohubLibraryDoc[] = [
  {
    id: "s1", title: "How to serve a customer", folderId: "f4",
    summary: "Step-by-step guidance for delivering a consistent, professional customer experience.",
    content: `Welcome every customer within 30 seconds of arrival with eye contact and a calm greeting.\n\nOffer to take their coat or direct them to their table promptly. Present the menu and allow time before taking the order.\n\nWhen taking the order, repeat it back clearly. Note any allergies and mark the ticket accordingly. Communicate allergy information directly to the kitchen.\n\nDuring service, check in once — not repeatedly. Refill water without being asked.\n\nAt the end, present the bill promptly when requested. Thank the customer by name if possible.`,
    tags: ["Service", "Front of house", "Standards"], lastUpdated: "14 Feb 2026",
    access: DEFAULT_INFOHUB_ACCESS,
  },
  {
    id: "s2", title: "Allergen handling procedure", folderId: "f2",
    summary: "Mandatory procedure for handling and communicating allergen information.",
    content: `All allergen queries must be treated as serious and escalated to a supervisor if uncertain.\n\nThe 14 major allergens must be known by all front-of-house staff. A laminated allergen menu must be available at all times.\n\nWhen a customer declares an allergy, mark their ticket clearly and notify the kitchen verbally. Use a clean preparation area and separate utensils.\n\nDo not guess. If in doubt, do not serve the dish.`,
    tags: ["Allergens", "Food Safety", "Legal"], lastUpdated: "10 Jan 2026",
    access: DEFAULT_INFOHUB_ACCESS,
  },
  {
    id: "s3", title: "Opening & closing procedure", folderId: "f3",
    summary: "Daily routine for opening and securing the premises safely.",
    content: `Opening: Arrive 30 minutes before service. Deactivate alarm. Check all areas are clean and set. Verify fridge temperatures and log them. Brief the team on the day's specials, bookings, and any known issues.\n\nClosing: Complete all closing checklists before staff leave. Ensure all food is stored correctly. Check all equipment is off. Lock all doors and activate the alarm. Confirm closure is logged.`,
    tags: ["Opening", "Closing", "Operations"], lastUpdated: "02 Feb 2026",
    access: DEFAULT_INFOHUB_ACCESS,
  },
  {
    id: "s4", title: "Cleaning schedule — weekly", folderId: "f1",
    summary: "Weekly deep-cleaning tasks for kitchen and front-of-house areas.",
    content: `Monday: Deep clean the fryer. Remove and soak all components. Scrub the interior with food-safe degreaser.\n\nWednesday: Clean extractor hoods and filters. Log completion.\n\nFriday: Sanitize all refrigeration unit interiors. Check seals. Log temperatures.\n\nSaturday: Mop all floors including storage. Clean behind equipment.\n\nAll cleaning must be logged in the Cleaning Schedule checklist.`,
    tags: ["Cleaning", "Kitchen", "Weekly"], lastUpdated: "07 Feb 2026",
    access: DEFAULT_INFOHUB_ACCESS,
  },
];

export const initialTrainingFolders: InfohubTrainingFolder[] = [
  { id: "tf1", name: "Onboarding", parentId: null, sortOrder: null, access: DEFAULT_INFOHUB_ACCESS },
  { id: "tf2", name: "Troubleshooting", parentId: null, sortOrder: null, access: DEFAULT_INFOHUB_ACCESS },
];

export const initialTrainingDocs: InfohubTrainingDoc[] = [
  {
    id: "tr1", title: "How to make a latte", folderId: "tf1", duration: "8 min", completed: false,
    steps: [
      "Grind 18–20g of espresso. Ensure a fine, consistent grind.",
      "Tamp firmly and evenly. Apply approximately 30lbs of pressure.",
      "Pull a 25–30 second shot into a pre-warmed cup.",
      "Steam 180ml of full-fat milk to 65°C. The pitcher should be warm to the touch.",
      "Swirl the milk to create a glossy, uniform texture.",
      "Pour the milk in a slow, steady motion. Tilt the cup slightly and aim for the centre of the shot.",
      "Finish with a simple latte art pattern. Present to the customer promptly.",
    ],
    access: DEFAULT_INFOHUB_ACCESS,
  },
  {
    id: "tr2", title: "Taking a table order", folderId: "tf1", duration: "5 min", completed: true,
    steps: [
      "Approach the table within 2 minutes of the guests being seated.",
      "Greet the table calmly. Introduce today's specials if applicable.",
      "Note any dietary requirements or allergies before taking the order.",
      "Repeat the order back to the table clearly.",
      "Input the order accurately into the POS system.",
      "Communicate any allergen or special requirements to the kitchen verbally.",
    ],
    access: DEFAULT_INFOHUB_ACCESS,
  },
  {
    id: "tr3", title: "Cash handling procedure", folderId: "tf1", duration: "6 min", completed: false,
    steps: [
      "Count the float at the start of each shift. Record the amount.",
      "Always announce the denomination of notes received.",
      "Count change back to the customer.",
      "Do not leave the till drawer open.",
      "Report any discrepancy immediately to your manager.",
    ],
    access: DEFAULT_INFOHUB_ACCESS,
  },
  {
    id: "tr4", title: "Coffee machine not heating", folderId: "tf2", duration: "3 min", completed: false,
    steps: [
      "Check that the machine is powered on and the power cable is secure.",
      "Verify the boiler switch is in the ON position.",
      "Allow 15 minutes for the boiler to reach temperature.",
      "If the issue persists, check for error codes on the display panel.",
      "Do not attempt to open the boiler. Contact your maintenance supplier.",
      "Log the fault in the Maintenance section of Olia.",
    ],
    access: DEFAULT_INFOHUB_ACCESS,
  },
  {
    id: "tr5", title: "Card terminal not connecting", folderId: "tf2", duration: "4 min", completed: false,
    steps: [
      "Check Wi-Fi or cellular signal on the terminal.",
      "Restart the terminal using the power button.",
      "If on Wi-Fi, verify the router is functioning normally.",
      "Switch to a mobile data connection if available.",
      "Contact your payment provider if the issue persists.",
      "In the interim, inform customers that card payments are temporarily unavailable.",
    ],
    access: DEFAULT_INFOHUB_ACCESS,
  },
  {
    id: "tr6", title: "Handling a customer complaint", folderId: "tf2", duration: "5 min", completed: false,
    steps: [
      "Listen to the complaint fully without interrupting.",
      "Acknowledge the issue calmly. Do not be defensive.",
      "Apologise sincerely for the experience.",
      "Offer a resolution — replacement, refund, or discount — within your authority.",
      "If escalation is needed, involve a manager immediately.",
      "Log the complaint in the incident register after resolution.",
    ],
    access: DEFAULT_INFOHUB_ACCESS,
  },
];

export const linkableInfohubResources: LinkableInfohubResource[] = [
  ...initialLibraryDocs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    section: "library" as const,
    subtitle: doc.summary,
    body: doc.content,
    access: doc.access,
  })),
  ...initialTrainingDocs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    section: "training" as const,
    subtitle: `${doc.duration} module`,
    body: doc.steps.join("\n\n"),
    access: doc.access,
  })),
];

export function getLinkableInfohubResource(resourceId?: string | null) {
  if (!resourceId) return null;
  return linkableInfohubResources.find((resource) => resource.id === resourceId) ?? null;
}
