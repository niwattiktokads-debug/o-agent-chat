# Omnichannel DB Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the durable database schema contract for Omnichannel memory: pages, customers, threads, messages, orders, payment requests, AI decisions, and audit logs.

**Architecture:** Keep runtime storage unchanged for this phase. Add SQL schema files and schema metadata helpers that are SQLite-first but Postgres-compatible in table shape. Expose a read-only schema endpoint so future migration work can inspect the contract from the app.

**Tech Stack:** SQL files, Node.js file loading, Express read-only route, Node test runner.

---

## Tasks

1. Add `server/src/omni/db/schema.sql` with core tables and indexes.
2. Add `server/src/omni/db/schema.js` to load schema text and table metadata.
3. Add tests proving required tables and safety columns exist.
4. Expose `GET /api/omni/schema`.
5. Run server tests, client tests, and build.
