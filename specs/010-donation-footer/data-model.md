# Data Model: Donation Footer in Announcements

**N/A — no data model for this feature.**

This feature introduces no database entities, no new API payloads, and no persisted client state. The footer text and donation dialog trigger are static UI; the embedded YooMoney widget's `billNumber` is a fixed, hardcoded URL parameter supplied in the feature request, not a value derived from any entity in this system. Dialog open/closed is local, transient component state (not modeled data).
