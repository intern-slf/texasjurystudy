export const EDUCATION_LEVELS: string[] = [
  "Less than High School",
  "High School or GED",
  "Associate's or Technical Degree",
  "Some College",
  "Bachelor Degree",
  "Graduate Degree",
];

export function applyEducationAutoSelect(option: string, current: string[]): string[] {
  const idx = EDUCATION_LEVELS.indexOf(option);
  if (idx === -1) return current;
  const isSelected = current.includes(option);
  if (isSelected) {
    const toRemove = new Set(EDUCATION_LEVELS.slice(idx));
    return current.filter((v) => !toRemove.has(v));
  } else {
    const toAdd = EDUCATION_LEVELS.slice(idx);
    return Array.from(new Set([...current, ...toAdd]));
  }
}
