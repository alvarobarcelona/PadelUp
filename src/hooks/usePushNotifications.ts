import { useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

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
        throw new Error("VAPID Public Key not found in env");
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

      const convertedVapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });

      // Save to Supabase
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not logged in");

      const { error: dbError } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: user.id,
            subscription: subscription.toJSON(), // Important: toJSON()
            user_agent: navigator.userAgent,
          },
          { onConflict: "user_id, subscription" },
        );

      if (dbError) throw dbError;

      console.log("Push notification subscribed successfully!");
    } catch (err: any) {
      console.error("Error subscribing to push:", err);
      setError(err.message || "Error subscribing");
    } finally {
      setLoading(false);
    }
  }, []);

  return { subscribeToPush, loading, error };
};
