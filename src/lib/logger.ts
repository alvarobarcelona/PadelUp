import { supabase } from "./supabase";

export const ACTIVITY_ACTIONS = [
  "USER_REGISTER",
  "USER_LOGIN",
  "USER_RESET_PASSWORD",
  "PROFILE_UPDATE",
  "MATCH_CREATE",
  "MATCH_CONFIRM",
  "MATCH_REJECT",
  "ADMIN_APPROVE_USER",
  "ADMIN_REJECT_USER",
  "ADMIN_DELETE_MATCH",
  "ADMIN_EDIT_USER",
  "ADMIN_DELETE_USER",
  "ADMIN_MATCH_CREATE",
  "ADMIN_EDIT_MATCH",
  "ADMIN_CLEANUP_MESSAGES",
  "ADMIN_DELETE_TOURNAMENT",
  "ADMIN_EDIT_TOURNAMENT",
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

// Set to false to pause logging during development/testing
const LOGGING_ENABLED = true; // PAUSED

export const logActivity = async (
  action: ActivityAction,
  targetId: string | null,
  details: any = {},
) => {
  if (!LOGGING_ENABLED) return;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      // Some actions might happen without a logged-in user (e.g., initial login/register success? actually register produces a user)
      // If strictly no user, we might log as system or anonymous if allowed, but for now we require user.
      // Special handling for Login/Register where user object might be available differently or we rely on session
      // For simplicity, we try to get user.
      console.warn(
        "Attempted to log activity without authenticated user context",
        action,
      );
      return;
    }

    const { error } = await supabase.from("activity_logs").insert({
      actor_id: user.id,
      action,
      target_id: targetId,
      details,
    });

    if (error) {
      console.error("Failed to log activity:", error);
    }
  } catch (err) {
    console.error("Exception logging activity:", err);
  }
};
