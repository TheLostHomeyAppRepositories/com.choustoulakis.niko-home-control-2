import { NikoBoolean, NikoUnreported } from '../niko/NikoTypes';

// Spaced out, so updates arriving before Niko confirms a request don't send duplicates.
const REQUEST_INTERVAL_MS = 10_000;

export function toWatt(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const watt = Number(value);
  return Number.isFinite(watt) ? watt : undefined;
}

/**
 * Niko only reports power while ReportInstantUsage is True. It resets it after 30 s and reports that
 * as a status update, so calling this from every update keeps live power running.
 */
export class LivePowerRequester {
  private lastRequest = 0;

  constructor(private readonly request: () => void) {}

  onUpdate(reportInstantUsage: NikoBoolean | NikoUnreported | undefined): void {
    if (reportInstantUsage === 'True') return;
    if (Date.now() - this.lastRequest < REQUEST_INTERVAL_MS) return;
    this.lastRequest = Date.now();
    this.request();
  }
}
