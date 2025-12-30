# Future Feature: Peer Verification System (Match Confirmation)

**Status**: Proposed / On Hold
**Goal**: Prevent incorrect scores by requiring opponent confirmation before updating ELO.

## How it works

1.  **Match Creation (Pending State)**

    - When a user logs a match result, the system records it but **does NOT update ELO** immediately.
    - The match is saved with a status flag: `confirmed: false`.

2.  **Notification**

    - The opponents (and teammate) receive a notification in their Home/Dashboard.
    - Example: _"Juan logged a win (6-4, 6-4) against you. Confirm?"_

3.  **Action**
    - **Confirm**: Any opponent clicks "Confirm". The system triggers the ELO update logic and marks the match as `confirmed: true`.
    - **Reject**: Opponent denies the result. The match is flagged for review or deleted, and the creator is notified.

## Technical Implementation Details

### Database Schema

- Add `confirmed` (boolean, default false) to `matches` table.
- (Optional) Add `rejected_by` (uuid) or `rejection_reason` (text).

### UI Changes

- **NewMatch.tsx**: Remove immediate ELO calculation. Just insert match row.
- **Home.tsx**: Add a "Pending Actions" section to fetch matches where:
  - User is a player in the match.
  - `confirmed` is false.
  - User was NOT the creator (optional logic to prevent self-approval).

### Logic

- Move ELO calculation from `NewMatch.tsx` to a new `confirmMatch(matchId)` function (likely in a Supabase Edge Function or just client-side secured by RLS).

## Benefits

- Eliminates "typo" errors updating ELO significantly.
- Prevents abuse/cheating.
- Increases community trust.
