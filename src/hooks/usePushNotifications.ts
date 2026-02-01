import { useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

//Debe tener 87 caracteres
// Clave pública VAPID (Debe tener 87 caracteres exactos)
const VAPID_PUBLIC_KEY =
  "BNMLaWzK4NeOqM65aT3dcQQgpfZPRjooBmrImpAc9rDiJjMJs8SPj_S1gEbL7oJUzsDud0qfdKd3ijijw9gDzA4";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const usePushNotifications = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subscribeToPush = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!VAPID_PUBLIC_KEY) {
        throw new Error(
          "Falta configurar la VAPID Public Key en usePushNotifications.ts",
        );
      }

      if (!("serviceWorker" in navigator)) {
        throw new Error("Service Worker not supported");
      }

      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        // Try to register if not found (though it should be by default)
        registration = await navigator.serviceWorker.register("/sw.js");
      }

      if (!registration) {
        throw new Error("Could not get Service Worker registration");
      }

      // Wait for it to be active
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notification permission denied");
      }

      // LIMPIEZA AGRESIVA: Quitamos cualquier cosa que no sea letra, número, guión o guión bajo
      const cleanKey = VAPID_PUBLIC_KEY.replace(/[^A-Za-z0-9\-_]/g, "");

      // VAPID keys must be exactly 87 characters (uncompressed P-256 point in base64url)
      if (cleanKey.length !== 87) {
        throw new Error(
          `Invalid Key Length: ${cleanKey.length} chars (Should be 87). Check code string.`,
        );
      }

      const convertedVapidKey = urlBase64ToUint8Array(cleanKey);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });

      // Save to Supabase
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not logged in");

      // Deduplication: Check if this device (User Agent) already has a subscription
      const { data: existingSub } = await supabase
        .from("push_subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("user_agent", navigator.userAgent)
        .maybeSingle();

      if (existingSub) {
        // Update existing subscription for this device
        const { error: updateError } = await supabase
          .from("push_subscriptions")
          .update({
            subscription: subscription.toJSON(),
            // Update created_at to keep it "fresh" if desired, or just leave it
            // created_at: new Date().toISOString()
          })
          .eq("id", existingSub.id);

        if (updateError) throw updateError;
      } else {
        // Create new subscription
        const { error: insertError } = await supabase
          .from("push_subscriptions")
          .insert({
            user_id: user.id,
            subscription: subscription.toJSON(),
            user_agent: navigator.userAgent,
          });

        if (insertError) throw insertError;
      }

      console.log("Push notification subscribed successfully!");
    } catch (err: any) {
      console.error("Error subscribing to push:", err);
      setError(err.message || "Error subscribing");
      alert("Push Error: " + (err.message || JSON.stringify(err)));
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribeFromPush = useCallback(async () => {
    setLoading(true);
    try {
      if (!("serviceWorker" in navigator)) return;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();

        // Remove from Supabase
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          // We match by the subscription object structure in JSON
          // Ideally we would delete by endpoint, but let's try strict match or just endpoint
          // For now, let's just ignore the DB error if it fails to find exact match
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("user_id", user.id)
            .contains("subscription", { endpoint: subscription.endpoint });
        }
      }
    } catch (err: any) {
      console.error("Error unsubscribing", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { subscribeToPush, unsubscribeFromPush, loading, error };
};
