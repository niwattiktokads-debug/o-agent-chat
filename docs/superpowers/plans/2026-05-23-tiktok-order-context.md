# TikTok Order Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add read-only TikTok Shop order context to Omni so Order Desk can show synced TikTok orders from durable memory.

**Architecture:** Wrap the existing `nosuda-tiktok-finance` Python helper with an injectable Node client. Normalize TikTok orders into Omni `customers` and `orders`, sync them through the existing SQLite-backed service, and add a UI panel to load/sync orders by status.

**Tech Stack:** Python helper via `child_process.execFile`, Express, React, existing SQLite-backed Omni store.

---

## Tasks

1. Add `server/src/omni/tiktokOrderClient.js`.
2. Add service sync for normalized TikTok orders.
3. Mount read-only `/api/omni/tiktok/orders` and `/api/omni/tiktok/sync`.
4. Add `TikTokOrderSync` UI and show recent TikTok orders in `OrderDesk`.
5. Verify helper, tests, build, and live sync.
