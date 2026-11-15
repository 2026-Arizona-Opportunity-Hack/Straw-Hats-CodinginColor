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

export async function loadStaffClassProgress(client: SupabaseClient, classId: string, signal?: AbortSignal): Promise<StaffModuleProgress[]> {
  const request = client.rpc('staff_class_progress', { p_class_id: classId });
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error || !Array.isArray(data?.modules) || data.modules.some((row: StaffModuleProgress | null) => row?.class_id !== classId)) {
    throw new Error(`Could not load class progress. Check staff access and that migration 3017 is applied. ${error?.message ?? 'Invalid class snapshot.'}`);
  }
  return data.modules;
}
