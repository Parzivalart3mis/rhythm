export interface Category {
  id: string;
  userId: string;
  name: string;
  colorHex: string;
  isDefault: boolean;
  createdAt: string;
}

export type BlockType = "fixed_time" | "flexible_task";

export interface OccurrenceView {
  blockId: string;
  categoryId: string;
  title: string;
  notes: string | null;
  blockType: BlockType;
  date: string; // YYYY-MM-DD
  startTime: string | null; // HH:MM
  endTime: string | null;
  reminderLeadMinutes: number;
  isRecurring: boolean;
  isException: boolean;
  categoryName: string;
  categoryColor: string;
}

export interface RawBlock {
  id: string;
  userId: string;
  categoryId: string;
  title: string;
  notes: string | null;
  blockType: BlockType;
  startTime: string | null;
  endTime: string | null;
  taskDate: string | null;
  isRecurring: boolean;
  rruleString: string | null;
  seriesStartDate: string | null;
  reminderLeadMinutes: number;
}

export interface ConflictingBlock {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
}
