import { supabase } from "./supabase";

export interface Friendship {
  id: number;
  user_id_1: string;
  user_id_2: string;
  status: "pending" | "accepted";
  created_at: string;
}

// Send a friend request
export const sendFriendRequest = async (
  currentUserId: string,
  targetUserId: string
) => {
  const { error } = await supabase.from("friendships").insert({
    user_id_1: currentUserId,
    user_id_2: targetUserId,
    status: "pending",
  });
  return { error };
};

// Accept a friend request
export const acceptFriendRequest = async (friendshipId: number) => {
  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", friendshipId);
  return { error };
};

// Reject/Cancel a friend request
export const removeFriendship = async (friendshipId: number) => {
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);
  return { error };
};

// Get all friends for a user
export const getFriends = async (userId: string) => {
  // We need to fetch rows where user is either id_1 or id_2 AND status is accepted
  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .eq("status", "accepted")
    .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`);

  if (error) return { data: null, error };

  // Extract the *other* user ID from each friendship
  const friendIds = data.map((f) =>
    f.user_id_1 === userId ? f.user_id_2 : f.user_id_1
  );
  return { data: friendIds, error: null };
};

// Get pending INCOMING requests (where I am user_id_2)
export const getIncomingRequests = async (userId: string) => {
  const { data, error } = await supabase
    .from("friendships")
    .select(
      `
      id,
      created_at,
      user_id_1,
      sender:user_id_1 (username, avatar_url, elo)
    `
    )
    .eq("user_id_2", userId)
    .eq("status", "pending");

  return { data, error };
};

// Get pending OUTGOING requests (where I am user_id_1)
export const getOutgoingRequests = async (userId: string) => {
  const { data, error } = await supabase
    .from("friendships")
    .select("user_id_2")
    .eq("user_id_1", userId)
    .eq("status", "pending");

  return { data, error };
};
