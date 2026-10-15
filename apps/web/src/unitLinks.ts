import type { To } from "react-router-dom";

export const SELECTED_UNIT_PARAM = "unidade";

function withSelectedUnit(search: string, unitId: string): string {
  const params = new URLSearchParams(search);
  params.set(SELECTED_UNIT_PARAM, unitId);
  return `?${params.toString()}`;
}

export function unitDetailLink(unitId: string, search: string): To {
  return { pathname: `/units/${encodeURIComponent(unitId)}`, search };
}

export function unitMapLink(unitId: string, search: string): To {
  return { pathname: "/", search: withSelectedUnit(search, unitId) };
}

export function unitListLink(unitId: string, search: string): To {
  return { pathname: "/units", search, hash: `unit-${unitId}` };
}
