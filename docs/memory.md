# Memory And User Profile

Klemm uses memory to understand standing intent, not to blindly trust raw text.

## Authority Levels

- trusted facts: approved or pinned memories
- pending facts: extracted but not reviewed
- ignored evidence: rejected or stale evidence
- quarantined evidence: prompt-injection-like or unsafe imported text
- raw imports: source material that cannot act as authority by itself
- explicit directions: user-provided instructions that can become authority after review/pinning

Raw imports never become authority automatically.

## Commands

```bash
klemm memory personalize --source directions --review-required
klemm memory workbench
klemm user profile --card --evidence
klemm directions add "Queue pushes and deploys while I am AFK."
klemm directions list
klemm directions review
```

## Standing Intent Patterns

Klemm's default Kyle-aware profile preserves these reviewed patterns when evidence exists:

- "what's next?" means propose the next concrete implementation slice.
- "proceed" means continue the already-discussed safe local plan.
- "do all that" means complete all listed safe local steps.
- "no corners cut" means focused tests, full tests, verification, and debrief.
- "dogfood Klemm" means use Klemm while building Klemm.
- terminal-native is a durable product preference.
- push/deploy/OAuth/credentials/external sends/financial/legal/reputation/destructive actions should queue unless explicitly approved.

The profile card shows which facts are trusted, which remain pending, and which evidence was ignored or quarantined.

