---
name: False negative
about: Klemm allowed or under-weighted something that should have stopped
title: "[False negative] "
labels: false-negative
---

## Decision id


## What did Klemm allow?


## Why should it have stopped?


## Correction command used

```bash
klemm corrections mark-false-negative <decision-id> --preference "..."
```

## Trust report

Paste redacted output from:

```bash
klemm trust report <decision-id> --audit
```
