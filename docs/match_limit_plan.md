# Free Tier Match Limit

## Goal

Restrict free tier users to a maximum of 10 matches OR 1 month of usage, whichever comes first.

## User Review Required

> [!IMPORTANT]
> The limit will be based on **matches played** (participation), not just matches created. This ensures users cannot bypass the limit by having others add them to matches.

## Proposed Changes

### [Layout Component]

#### [MODIFY] [Layout.tsx](file:///c:/Users/user/OneDrive/Desktop/Projects/PadelUp/src/components/Layout.tsx)

- Fetch match count for the current user if the subscription time is not yet expired.
- Check if `matchCount >= 10`.
- Redirect to `/subscription` if either the time is expired OR the match limit is reached.

## Verification Plan

1.  **Manual Verification**:
    - Temporarily lower the limit to 1 or 0 in the code to trigger the block immediately for testing.
    - Verify that a user with < 10 matches and valid time can access the app.
    - Verify that a user with >= 10 matches is redirected to `/subscription`.
