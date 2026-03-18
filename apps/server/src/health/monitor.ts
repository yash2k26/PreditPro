import type { VenueHealth } from "../venues/types.ts";

/**
 * Push-based health store. Workers forward health updates here;
 * the monitor just holds the latest snapshot per venue key.
 */
export class HealthMonitor {
  private healthMap = new Map<string, VenueHealth>();

  update(venueId: string, health: VenueHealth): void {
    this.healthMap.set(venueId, health);
  }

  getHealthMap(): Record<string, VenueHealth> {
    const result: Record<string, VenueHealth> = {};
    for (const [id, health] of this.healthMap) {
      result[id] = health;
    }
    return result;
  }
}
