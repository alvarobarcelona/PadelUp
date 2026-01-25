# Implementation Plan - Chat Cleanup Strategy

## Goal Description

The goal is to handle the scenario where **both** users in a chat have deleted the conversation.
Currently, the app performs a "soft delete" (setting `deleted_by_sender` or `deleted_by_receiver` to true).
The proposed solution is to implement a **Hard Delete** (permanent removal) of messages that have been marked as deleted by _both_ parties. This cleans up the database and respects user privacy.

## User Review Required

> [!IMPORTANT]
> **Database Policy Check**: This plan assumes your Supabase Database RLS (Row Level Security) policies allow the `DELETE` operation for authenticated users on the `messages` table (typically for rows they are involved in).
> If `DELETE` is disabled by policy, this change will soft-fail (throw a permission error).
> **Alternative**: If RLS blocks specific deletes, we may need to create a Postgres Function (RPC) to handle the cleanup, but trying the client-side delete first is the standard approach.

## Proposed Changes

### Logic Flow

When `deleteConversation` is called:

1.  **Existing Step**: Mark messages sent by current user as `deleted_by_sender = true`.
2.  **Existing Step**: Mark messages received by current user as `deleted_by_receiver = true`.
3.  **New Step**: Execute a `DELETE` query for messages where _both_ flags are `true`.

### Component: Chat

#### [MODIFY] [ChatDrawer.tsx](file:///c:/Users/user/OneDrive/Desktop/Projects/PadelUp/src/components/Chat/ChatDrawer.tsx)

- In `deleteConversation` function:
  - Add a `delete()` call after the existing updates.
  - Query condition: `deleted_by_sender` IS true AND `deleted_by_receiver` IS true AND (sender is user OR receiver is user).

## Verification Plan

### Manual Verification

1.  **Setup**:
    - User A and User B exchange messages.
2.  **Step 1 (User A deletes)**:
    - User A deletes conversation.
    - Verify messages disappear for User A.
    - Verify messages still exist in DB (soft deleted for A).
3.  **Step 2 (User B deletes)**:
    - User B deletes conversation.
    - **Expectation**: Messages should be permanently removed from the `messages` table.
4.  **Verification**:
    - Since we don't have direct DB access console easily, we can check if they disappear for User B (which they will due to soft delete logic anyway).
    - To verify _hard_ delete, we could try to query them via code (e.g., temporary console log) ignoring the filters, or trust the `delete()` response count.
    - We won't have a simple way to verify row count without a "Select \*" admin tool, but we can verify no errors are thrown.
