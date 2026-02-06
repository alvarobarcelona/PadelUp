-- Fix Push Notification Visibility for Admins

-- 1. Allow Admins to view all push subscriptions
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.push_subscriptions;
CREATE POLICY "Admins can view all subscriptions"
    ON public.push_subscriptions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
    );
