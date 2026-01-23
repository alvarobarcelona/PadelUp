import { Resend } from "resend";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL");

const resend = new Resend(RESEND_API_KEY);

Deno.serve(async (req) => {
  // Check for secrets
  if (!RESEND_API_KEY) {
    console.error("Missing RESEND_API_KEY");
    return new Response("Missing RESEND_API_KEY", { status: 500 });
  }
  if (!ADMIN_EMAIL) {
    console.error("Missing ADMIN_EMAIL");
    return new Response("Missing ADMIN_EMAIL", { status: 500 });
  }

  // Handle CORS
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let payload;
    try {
      const bodyText = await req.text();
      if (!bodyText) {
        throw new Error("Empty body");
      }
      payload = JSON.parse(bodyText);
    } catch (e) {
      console.error("Error parsing JSON:", e);
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Webhook received:", payload);

    // Determines the record based on the event type (INSERT, UPDATE, DELETE)
    const record = payload.record;

    // We expect this hook to be triggered by INSERT on public.profiles
    // Adjust fields based on your actual schema (username, email if available in public profile or joined)
    // Note: public.profiles might not have email if it's in auth.users, but we usually have username/id.
    const username = record?.username || "Unknown User";
    const userId = record?.id || "Unknown ID";

    const { data, error } = await resend.emails.send({
      from: "PadelUp <onboarding@resend.dev>", // Update this to your verified domain if matched
      to: [ADMIN_EMAIL],
      subject: `🎾 New Player Joined: ${username}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background-color: #0f172a; color: #e2e8f0; padding: 20px; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4ade80; margin: 0; font-size: 32px;">PadelUp 🎾</h1>
            <p style="color: #94a3b8; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">New Player Incoming</p>
          </div>
          
          <div style="background-color: #1e293b; padding: 24px; border-radius: 8px; border: 1px solid #334155;">
            <p style="font-size: 18px; margin-top: 0; color: #f8fafc;">
              <strong>${username}</strong> just joined the squad!
            </p>
            <p style="color: #cbd5e1; line-height: 1.6;">
              A new player has completed registration and is waiting for your approval to enter the ranking.
            </p>
            
            <div style="margin: 20px 0; background-color: #0f172a; padding: 15px; border-radius: 6px; font-family: monospace; color: #94a3b8;">
              <p style="margin: 5px 0;"><strong>ID:</strong> ${userId}</p>
              <p style="margin: 5px 0;"><strong>Email:</strong> ${
                record.email || "N/A"
              }</p>
              <p style="margin: 5px 0;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            </div>

            <div style="text-align: center; margin-top: 30px;">
              <a href="https://padel-up-nine.vercel.app/admin" style="background-color: #4ade80; color: #064e3b; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block; transition: background 0.3s;">
                Review in PadelUp
              </a>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #64748b;">
            <p>© ${new Date().getFullYear()} PadelUp. Game on.</p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("Resend Error:", error);
      return new Response(JSON.stringify({ error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ message: "Email sent successfully", data }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Function Error:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
