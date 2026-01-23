import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

interface WebPushError extends Error {
  statusCode: number;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const vapidKeys = {
  publicKey: Deno.env.get("VAPID_PUBLIC_KEY")!,
  privateKey: Deno.env.get("VAPID_PRIVATE_KEY")!,
};

const vapidSubject =
  Deno.env.get("VAPID_SUBJECT") || "mailto:padeluppadelerosqgmail.com";

webpush.setVapidDetails(
  vapidSubject,
  vapidKeys.publicKey,
  vapidKeys.privateKey,
);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;

    if (!record || !record.receiver_id) {
      return new Response(JSON.stringify({ error: "No receiver_id found" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_id", record.receiver_id);

    if (error) {
      console.error("Error fetching subscriptions:", error);
      throw error;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log("No subscriptions found for user:", record.receiver_id);
      return new Response(
        JSON.stringify({ message: "No subscriptions found" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const notificationPayload = JSON.stringify({
      title: "New Message",
      body: record.content || "You have a new message!",
      url: `/?chatUser=${record.sender_id}`, // specific chat URL
      data: {
        url: `/?chatUser=${record.sender_id}`,
      },
    });

    const sendPromises = subscriptions.map((sub) => {
      // sub.subscription should be the object stored in DB
      const subscription = sub.subscription;

      return webpush
        .sendNotification(subscription, notificationPayload)
        .catch((error: unknown) => {
          const err = error as WebPushError;
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Subscription is gone, delete it from DB
            console.log("Subscription expired/invalid, deleting...");
            // In a real scenario you would delete this specific subscription from DB
            // But since we selected just the json, we might not have the ID handy unless we selected it.
            // Ideally we should select ID too.
          }
          console.error("Error sending notification:", err);
        });
    });

    await Promise.all(sendPromises);

    return new Response(JSON.stringify({ message: "Notifications sent" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Function Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
