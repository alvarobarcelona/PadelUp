-- Add deleted_by_sender and deleted_by_receiver columns to messages table
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS deleted_by_sender boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_by_receiver boolean DEFAULT false;

-- Policy to allow Senders to update "deleted_by_sender"
CREATE POLICY "Senders can mark messages as deleted"
ON public.messages
FOR UPDATE
USING (auth.uid() = sender_id)
WITH CHECK (auth.uid() = sender_id);

-- Policy to allow Receivers to update "deleted_by_receiver"
CREATE POLICY "Receivers can mark messages as deleted"
ON public.messages
FOR UPDATE
USING (auth.uid() = receiver_id)
WITH CHECK (auth.uid() = receiver_id);

-- Note: The existing "Users can view their own messages" select policy 
-- typically checks (auth.uid() = sender_id or auth.uid() = receiver_id).
-- We DO NOT need to change the RLS *Select* policy to enforce visibility 
-- because we will filter this in the Frontend/Query for performance and UX flexibility.
-- (i.e. we still want to be able to 'fetch' them if we ever wanted to implement an 'undo' or 'archive' view properly, 
-- but primarily, standard RLS for 'visibility' usually means 'permission to see', 
-- whereas 'deleted' is a presentation state. However, strict privacy might demand RLS update.
-- For now, frontend filtering is standard for 'soft delete' features like this).
