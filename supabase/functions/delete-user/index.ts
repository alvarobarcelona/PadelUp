import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Create a Supabase client with the Auth context of the user calling the function
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // 2. Get the user from the token
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      throw new Error("Unauthorized");
    }

    // 3. Verify the user is an admin
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile || !profile.is_admin) {
      throw new Error("Forbidden: Only admins can delete users.");
    }

    // 4. Create a Supabase client with SERVICE_ROLE key to perform the deletion
    // This key bypasses RLS and allows Auth management
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 5. Get the target user ID from the request body
    const { user_id } = await req.json();

    if (!user_id) {
      throw new Error("Missing user_id in request body");
    }

    // 6. Delete profile explicitly (since cascade might be missing)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", user_id);

    if (profileError) {
      console.error("Error deleting profile:", profileError);
    }

    // 7. Delete the user from Auth
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
      user_id
    );

    if (deleteError) {
      throw deleteError;
    }

    return new Response(
      JSON.stringify({ message: "User deleted successfully" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
