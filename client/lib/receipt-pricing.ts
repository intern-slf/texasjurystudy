import { CaseFilters, AgeRange } from "./filter-utils";
import {
  DEFAULT_DELIVERY_MODE,
  normalizeDeliveryMode,
  type DeliveryMode,
} from "./case/deliveryMode";

const DEFAULT_AGE_MIN = 18;
const DEFAULT_AGE_MAX = 99;

function isNarrowingAgeRange(r: AgeRange | undefined | null): boolean {
  if (!r) return false;
  return r.min > DEFAULT_AGE_MIN || r.max < DEFAULT_AGE_MAX;
}

export interface FilterLineItem {
  label: string;
  costCents: number;
}

export interface ReceiptPriceBreakdown {
  /** Which rate produced `baseCostCents`. Surfaced so the receipt can name it. */
  deliveryMode: DeliveryMode;
  hours: number;
  /** The per-hour rate this breakdown was built from. */
  baseRatePerHourCents: number;
  baseCostCents: number;
  filterItems: FilterLineItem[];
  filterCostCents: number;
  totalCostCents: number;
}

const ONLINE_BASE_COST_PER_HOUR_CENTS = 85_000; // $850 per hour, over Zoom
/**
 * In-person focus groups are a different product: a booked room, staff on site,
 * and participants paid 3.3× more to travel. Priced per hour like the online
 * rate so `hours_requested` still drives the quote.
 */
const OFFLINE_BASE_COST_PER_HOUR_CENTS = 1_000_000; // $10,000 per hour, in person

/** Backwards-compatible alias — the online rate is still the default rate. */
export const BASE_COST_PER_HOUR_CENTS = ONLINE_BASE_COST_PER_HOUR_CENTS;

const PER_FILTER_CENTS = 10_000; // $100

/**
 * What one hour of focus group costs the requestee, before filters. Filters are
 * charged on top at the same $100 each in both modes — narrowing the panel is
 * the same work either way.
 */
export function baseRatePerHourCents(deliveryMode?: DeliveryMode | string | null): number {
  return normalizeDeliveryMode(deliveryMode) === "offline"
    ? OFFLINE_BASE_COST_PER_HOUR_CENTS
    : ONLINE_BASE_COST_PER_HOUR_CENTS;
}

function hasArrayItems(arr?: string[]): boolean {
  return Array.isArray(arr) && arr.length > 0;
}

function eligibilityIsSet(value?: string): boolean {
  return !!value && value !== "Any";
}

export function calculateReceiptPrice(
  filters: CaseFilters | null | undefined,
  hoursRequested?: number | null,
  /** Omitted means online — the historical behaviour and the column default. */
  deliveryMode?: DeliveryMode | string | null
): ReceiptPriceBreakdown {
  const mode = deliveryMode ? normalizeDeliveryMode(deliveryMode) : DEFAULT_DELIVERY_MODE;
  const ratePerHour = baseRatePerHourCents(mode);
  const hours = hoursRequested && hoursRequested > 0 ? hoursRequested : 1;
  const baseCostCents = ratePerHour * hours;
  const filterItems: FilterLineItem[] = [];

  if (!filters) {
    return {
      deliveryMode: mode,
      hours,
      baseRatePerHourCents: ratePerHour,
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

  const ageIsNarrowed =
    isNarrowingAgeRange(filters.age) ||
    (filters.ageRanges?.some(isNarrowingAgeRange) ?? false);
  if (ageIsNarrowed) {
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
    deliveryMode: mode,
    hours,
    baseRatePerHourCents: ratePerHour,
    baseCostCents,
    filterItems,
    filterCostCents,
    totalCostCents: baseCostCents + filterCostCents,
  };
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
