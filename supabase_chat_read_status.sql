-- Add is_read column to messages table
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;

-- Update migration to ensure policies exist for updating status
-- We need a policy that allows the RECEIVER to update the message (to mark as read)

CREATE POLICY "Receivers can update entries to mark as read"
ON public.messages
FOR UPDATE
USING (auth.uid() = receiver_id)
WITH CHECK (auth.uid() = receiver_id);

-- Explicitly allow updating is_read for the receiver
-- (The previous policy might be broad enough, but good to be explicit if using column security, though here row security is key)
