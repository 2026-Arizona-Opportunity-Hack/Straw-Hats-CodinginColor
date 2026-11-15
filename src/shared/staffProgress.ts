import type { SupabaseClient } from '@supabase/supabase-js';

/** Authorized _course_state rows from migration 3008. Scores are 0..1. */
export interface StaffModuleProgress {
  student_id: string;
  class_id: string | null;
  course_id: string;
  module_id: string;
  state: 'locked' | 'available' | 'completed';
  tested_out: boolean;
  required_count: number;
  done_count: number;
  pretest_score: number | null;
  posttest_best: number | null;
}

export async function loadStaffProgress(client: SupabaseClient): Promise<StaffModuleProgress[]> {
  const { data, error } = await client.rpc('staff_progress_snapshot');
  if (error || !Array.isArray(data?.modules)) {
    throw new Error(`Could not load canonical progress. Apply migration 3008_staff_progress_snapshot.sql and check staff access. ${error?.message ?? 'Invalid snapshot.'}`);
  }
  return data.modules;
}
