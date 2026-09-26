# ADR-0003: Techno Link integration is a manual Excel handoff in v1

**Status:** Accepted
**Date:** 2026-09-26
**Deciders:** Siddeg

## Context
The company uses Techno Link for accounting (expenses, receipts, sales, purchases, suppliers,
inventory, VAT). It has no HR or payroll. It is unknown whether Techno Link has an API.

## Decision
Idara Pro does not build accounting features. It produces an Excel export of approved payroll
runs and paid custody; the accountant enters it into Techno Link manually and records the
Techno Link reference back in Idara Pro where relevant (custody).

The export lives in the `exports` module behind an interface (`AccountingExportPort`) with one
v1 adapter (`ExcelExportAdapter`). Column layout lives in a single mapper file.

## Consequences
- Easier: no dependency on an unknown API; fast to ship.
- Harder: manual double entry for payroll totals and custody.
- Revisit when: Techno Link API availability is confirmed (v2) → add `TechnoLinkApiAdapter`
  implementing the same port; nothing else changes.
