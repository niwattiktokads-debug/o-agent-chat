# Omnichannel SQLite Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist Omni memory to a local SQLite file so Facebook sync results survive server restarts.

**Architecture:** Use Node's built-in `node:sqlite` runtime to avoid adding external dependencies. Keep the existing Omni service API stable, add a SQLite-backed store that initializes `schema.sql`, seeds default records, and upserts synced Facebook customers, threads, and messages.

**Tech Stack:** Node.js `node:sqlite`, existing SQL schema, Express, Node test runner.

---

## Tasks

1. Add `server/src/omni/db/sqliteStore.js`.
2. Update `createOmniService` to accept a store while preserving in-memory default behavior.
3. Wire `OMNI_DB_PATH` in server startup and mount routes with a SQLite-backed service.
4. Add tests for persistence across service instances.
5. Verify tests, build, and live sync.
