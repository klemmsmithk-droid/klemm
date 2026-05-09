---
name: False positive
about: Klemm blocked or queued something that was actually safe
title: "[False positive] "
labels: false-positive
---

## Decision id


## What did Klemm block or queue?


## Why was it safe?


## Correction command used

```bash
klemm corrections mark-false-positive <decision-id> --preference "..."
```

## Trust report

Paste redacted output from:

```bash
klemm trust report <decision-id> --audit
```
