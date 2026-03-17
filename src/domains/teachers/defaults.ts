import type {
  ReviewMode,
  ReviewPreference,
  TeacherSelection,
  TeacherSoulId,
} from './types';

export const DEFAULT_TEACHER_SOUL_ID: TeacherSoulId = 'default';
export const DEFAULT_REVIEW_MODE: ReviewMode = 'text';

export function normalizeTeacherSelection(
  teacher?: Partial<TeacherSelection> | null
): TeacherSelection {
  return {
    soulId: teacher?.soulId ?? DEFAULT_TEACHER_SOUL_ID,
    voiceId: teacher?.voiceId,
  };
}

export function normalizeReviewPreference(
  review?: Partial<ReviewPreference> | null
): ReviewPreference {
  return {
    mode: review?.mode ?? DEFAULT_REVIEW_MODE,
    autoPlayAudio: review?.autoPlayAudio ?? false,
  };
}
