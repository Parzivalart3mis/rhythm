import { timeToMinutes, intervalsOverlap } from "@/lib/time";
import {
  expandBlock,
  type ExpandInput,
  type Occurrence,
} from "./expand-occurrences";

export interface ConflictHit {
  blockId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
}

/** A timed occurrence has both start and end times. Flexible tasks never conflict. */
function isTimed(o: Occurrence): o is Occurrence & { startTime: string; endTime: string } {
  return o.startTime !== null && o.endTime !== null;
}

/**
 * Find existing occurrences that overlap a proposed [startTime, endTime) on a
 * specific date. Used by the pre-flight check-conflicts endpoint.
 */
export function findConflictsForInterval(
  existing: Occurrence[],
  date: string,
  startTime: string,
  endTime: string,
  excludeBlockId?: string
): ConflictHit[] {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  const hits: ConflictHit[] = [];
  for (const o of existing) {
    if (o.date !== date) continue;
    if (excludeBlockId && o.blockId === excludeBlockId) continue;
    if (!isTimed(o)) continue;
    if (intervalsOverlap(s, e, timeToMinutes(o.startTime), timeToMinutes(o.endTime))) {
      hits.push({
        blockId: o.blockId,
        title: o.title,
        date: o.date,
        startTime: o.startTime,
        endTime: o.endTime,
      });
    }
  }
  return hits;
}

/**
 * Expand a candidate block and all existing blocks across a rolling window, then
 * report any same-date time overlaps. Used at block create/edit time. The
 * candidate's own id (if editing) is excluded from the existing set upstream.
 */
export function findConflictsForBlock(
  candidate: ExpandInput,
  existing: ExpandInput[],
  rangeStart: string,
  rangeEnd: string
): ConflictHit[] {
  const candidateOccs = expandBlock(candidate, rangeStart, rangeEnd).filter(isTimed);
  if (candidateOccs.length === 0) return [];

  const existingOccs: Occurrence[] = [];
  for (const b of existing) {
    existingOccs.push(...expandBlock(b, rangeStart, rangeEnd));
  }

  // Group existing timed occurrences by date for cheaper lookups.
  const byDate = new Map<string, Occurrence[]>();
  for (const o of existingOccs) {
    if (!isTimed(o)) continue;
    const arr = byDate.get(o.date);
    if (arr) arr.push(o);
    else byDate.set(o.date, [o]);
  }

  const seen = new Set<string>();
  const hits: ConflictHit[] = [];
  for (const c of candidateOccs) {
    const sameDay = byDate.get(c.date);
    if (!sameDay) continue;
    const cs = timeToMinutes(c.startTime);
    const ce = timeToMinutes(c.endTime);
    for (const o of sameDay) {
      if (o.blockId === candidate.block.id) continue;
      if (
        intervalsOverlap(cs, ce, timeToMinutes(o.startTime!), timeToMinutes(o.endTime!))
      ) {
        // De-dupe by conflicting block (a recurring pair may clash many times).
        if (seen.has(o.blockId)) continue;
        seen.add(o.blockId);
        hits.push({
          blockId: o.blockId,
          title: o.title,
          date: o.date,
          startTime: o.startTime!,
          endTime: o.endTime!,
        });
      }
    }
  }
  return hits;
}
