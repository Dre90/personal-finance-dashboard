export const DEFAULT_CATEGORIES = [
  // Inntekt
  { name: "Lønn", kind: "income" as const, groupName: "Inntekt", sortOrder: 10 },
  { name: "Bonus", kind: "income" as const, groupName: "Inntekt", sortOrder: 20 },
  { name: "Andre inntekter", kind: "income" as const, groupName: "Inntekt", sortOrder: 30 },

  // Faste utgifter
  { name: "Boliglån/Husleie", kind: "expense" as const, groupName: "Faste utgifter", sortOrder: 100 },
  { name: "Strøm", kind: "expense" as const, groupName: "Faste utgifter", sortOrder: 110 },
  { name: "Internett", kind: "expense" as const, groupName: "Faste utgifter", sortOrder: 120 },
  { name: "Mobil", kind: "expense" as const, groupName: "Faste utgifter", sortOrder: 130 },
  { name: "Forsikring", kind: "expense" as const, groupName: "Faste utgifter", sortOrder: 140 },
  { name: "Barnehage/SFO", kind: "expense" as const, groupName: "Faste utgifter", sortOrder: 150 },
  { name: "TV/Streaming", kind: "expense" as const, groupName: "Faste utgifter", sortOrder: 160 },

  // Variable utgifter
  { name: "Mat", kind: "expense" as const, groupName: "Variable utgifter", sortOrder: 200 },
  { name: "Transport/Drivstoff", kind: "expense" as const, groupName: "Variable utgifter", sortOrder: 210 },
  { name: "Klær", kind: "expense" as const, groupName: "Variable utgifter", sortOrder: 220 },
  { name: "Personlig pleie", kind: "expense" as const, groupName: "Variable utgifter", sortOrder: 230 },
  { name: "Restaurant/Take-away", kind: "expense" as const, groupName: "Variable utgifter", sortOrder: 240 },
  { name: "Underholdning", kind: "expense" as const, groupName: "Variable utgifter", sortOrder: 250 },
  { name: "Helse", kind: "expense" as const, groupName: "Variable utgifter", sortOrder: 260 },
  { name: "Gaver", kind: "expense" as const, groupName: "Variable utgifter", sortOrder: 270 },
  { name: "Hobby", kind: "expense" as const, groupName: "Variable utgifter", sortOrder: 280 },

  // Sparing
  { name: "Buffer", kind: "expense" as const, groupName: "Sparing", sortOrder: 300 },
  { name: "Pensjon", kind: "expense" as const, groupName: "Sparing", sortOrder: 310 },
  { name: "Investering (ASK)", kind: "expense" as const, groupName: "Sparing", sortOrder: 320 },
  { name: "Sinking funds", kind: "expense" as const, groupName: "Sparing", sortOrder: 330 },
];

export const DEFAULT_SINKING_FUNDS = [
  { name: "Ferie", target: 30000, monthlyContribution: 2500, color: "#10b981" },
  { name: "Bil (service/dekk)", target: 15000, monthlyContribution: 1000, color: "#f59e0b" },
  { name: "Jul/Gaver", target: 10000, monthlyContribution: 800, color: "#ec4899" },
  { name: "Nytt utstyr", target: 20000, monthlyContribution: 1500, color: "#6366f1" },
];
