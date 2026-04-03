export const metalLabels = {
  gold: "Gold",
  silver: "Silver",
  platinum: "Platinum",
  palladium: "Palladium",
  mixed: "Mixed metals"
};

export const metalOptions = [
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "platinum", label: "Platinum" },
  { value: "palladium", label: "Palladium" }
];

export const purityOptionsByMetal = {
  gold: [
    { value: "14K", label: "14K gold", purity: 0.585, karat: "14K" },
    { value: "10K", label: "10K gold", purity: 0.417, karat: "10K" },
    { value: "18K", label: "18K gold", purity: 0.75, karat: "18K" },
    { value: "22K", label: "22K gold", purity: 0.916, karat: "22K" },
    { value: "24K", label: "24K gold", purity: 0.999, karat: "24K" }
  ],
  silver: [
    { value: "999", label: "999 fine silver", purity: 0.999 },
    { value: "925", label: "Sterling silver (.925)", purity: 0.925 },
    { value: "900", label: "Coin silver (.900)", purity: 0.9 }
  ],
  platinum: [
    { value: "999", label: "999 platinum", purity: 0.999 },
    { value: "950", label: "950 platinum", purity: 0.95 },
    { value: "900", label: "900 platinum", purity: 0.9 }
  ],
  palladium: [
    { value: "9995", label: "9995 palladium", purity: 0.9995 },
    { value: "950", label: "950 palladium", purity: 0.95 },
    { value: "500", label: "500 palladium", purity: 0.5 }
  ]
};

export function normalizeMetalType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return metalLabels[normalized] ? normalized : "gold";
}

export function getMetalLabel(metalType) {
  return metalLabels[normalizeMetalType(metalType)] || metalLabels.gold;
}

export function getPurityOptions(metalType) {
  return purityOptionsByMetal[normalizeMetalType(metalType)] ?? purityOptionsByMetal.gold;
}

export function getDefaultPuritySelection(metalType) {
  return getPurityOptions(metalType)[0];
}

export function getPuritySelection(metalType, rawValue) {
  const options = getPurityOptions(metalType);
  return options.find((option) => option.value === rawValue) ?? options[0];
}

export function getClaimDescriptor(record = {}) {
  const itemizedItems = Array.isArray(record.itemized_items) ? record.itemized_items.filter(Boolean) : [];
  if (itemizedItems.length > 1 || record.submission_type === "itemized") {
    return `${itemizedItems.length || record.item_count || "Multi-item"} item mixed lot`;
  }

  const metalType = normalizeMetalType(record.metal_type);
  if (metalType === "gold") {
    return record.claimed_karat ? `${record.claimed_karat} gold` : "Gold item";
  }

  if (record.claimed_purity_label) {
    return String(record.claimed_purity_label);
  }

  const purity = Number(record.claimed_purity);
  if (Number.isFinite(purity) && purity > 0) {
    return `${Math.round(purity * 1000)} ${getMetalLabel(metalType).toLowerCase()}`;
  }

  return getMetalLabel(metalType);
}

export function getClaimWeight(record = {}) {
  if (Number.isFinite(Number(record.claimed_weight_grams))) {
    return Number(record.claimed_weight_grams);
  }

  const itemizedItems = Array.isArray(record.itemized_items) ? record.itemized_items.filter(Boolean) : [];
  return itemizedItems.reduce((sum, item) => sum + Number(item?.weightGrams || item?.weight_grams || 0), 0);
}

export function formatClaimSummary(record = {}) {
  const descriptor = getClaimDescriptor(record);
  const weight = getClaimWeight(record);

  if (!Number.isFinite(weight) || weight <= 0) {
    return descriptor;
  }

  return `${descriptor} · ${weight.toFixed(1)}g`;
}
