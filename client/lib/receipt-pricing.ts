import { CaseFilters } from "./filter-utils";

export interface FilterLineItem {
  label: string;
  costCents: number;
}

export interface ReceiptPriceBreakdown {
  hours: number;
  baseCostCents: number;
  filterItems: FilterLineItem[];
  filterCostCents: number;
  totalCostCents: number;
}

const BASE_COST_PER_HOUR_CENTS = 100_000; // $1,000 per hour
const PER_FILTER_CENTS = 10_000; // $100

function hasArrayItems(arr?: string[]): boolean {
  return Array.isArray(arr) && arr.length > 0;
}

function eligibilityIsSet(value?: string): boolean {
  return !!value && value !== "Any";
}

export function calculateReceiptPrice(
  filters: CaseFilters | null | undefined,
  hoursRequested?: number | null
): ReceiptPriceBreakdown {
  const hours = hoursRequested && hoursRequested > 0 ? hoursRequested : 1;
  const baseCostCents = BASE_COST_PER_HOUR_CENTS * hours;
  const filterItems: FilterLineItem[] = [];

  if (!filters) {
    return {
      hours,
      baseCostCents,
      filterItems,
      filterCostCents: 0,
      totalCostCents: baseCostCents,
    };
  }

  if (hasArrayItems(filters.gender)) {
    filterItems.push({ label: "Gender", costCents: PER_FILTER_CENTS });
  }

  if (hasArrayItems(filters.race)) {
    filterItems.push({ label: "Race", costCents: PER_FILTER_CENTS });
  }

  if (filters.age || (filters.ageRanges && filters.ageRanges.length > 0)) {
    filterItems.push({ label: "Age", costCents: PER_FILTER_CENTS });
  }

  if (
    hasArrayItems(filters.location?.state) ||
    hasArrayItems(filters.location?.county)
  ) {
    filterItems.push({ label: "Location", costCents: PER_FILTER_CENTS });
  }

  if (hasArrayItems(filters.political_affiliation)) {
    filterItems.push({
      label: "Political Affiliation",
      costCents: PER_FILTER_CENTS,
    });
  }

  // Eligibility sub-filters (each counts separately)
  const eligibility = filters.eligibility;
  if (eligibility) {
    if (eligibilityIsSet(eligibility.served_on_jury)) {
      filterItems.push({
        label: "Served on Jury",
        costCents: PER_FILTER_CENTS,
      });
    }
    if (eligibilityIsSet(eligibility.has_children)) {
      filterItems.push({ label: "Has Children", costCents: PER_FILTER_CENTS });
    }
    if (eligibilityIsSet(eligibility.served_armed_forces)) {
      filterItems.push({
        label: "Armed Forces",
        costCents: PER_FILTER_CENTS,
      });
    }
    if (eligibilityIsSet(eligibility.currently_employed)) {
      filterItems.push({ label: "Employment", costCents: PER_FILTER_CENTS });
    }
    if (eligibilityIsSet(eligibility.convicted_felon)) {
      filterItems.push({
        label: "Convicted Felon",
        costCents: PER_FILTER_CENTS,
      });
    }
    if (eligibilityIsSet(eligibility.us_citizen)) {
      filterItems.push({ label: "US Citizen", costCents: PER_FILTER_CENTS });
    }
  }

  // Socioeconomic sub-filters
  const socio = filters.socioeconomic;
  if (socio) {
    if (hasArrayItems(socio.education_level)) {
      filterItems.push({
        label: "Education Level",
        costCents: PER_FILTER_CENTS,
      });
    }
    if (hasArrayItems(socio.marital_status)) {
      filterItems.push({
        label: "Marital Status",
        costCents: PER_FILTER_CENTS,
      });
    }
    if (hasArrayItems(socio.family_income)) {
      filterItems.push({
        label: "Family Income",
        costCents: PER_FILTER_CENTS,
      });
    }
    if (hasArrayItems(socio.availability)) {
      filterItems.push({
        label: "Availability",
        costCents: PER_FILTER_CENTS,
      });
    }
  }

  const filterCostCents = filterItems.reduce((s, i) => s + i.costCents, 0);

  return {
    hours,
    baseCostCents,
    filterItems,
    filterCostCents,
    totalCostCents: baseCostCents + filterCostCents,
  };
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
