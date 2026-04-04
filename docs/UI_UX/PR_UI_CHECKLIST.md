# PR_UI_CHECKLIST.md

## UI PR Checklist

- [ ] Shared components used where applicable
- [ ] No raw button/input/dialog added where system components exist
- [ ] No hardcoded hex values or one-off design values introduced
- [ ] Layout, spacing, typography, and headings follow the design system
- [ ] UX stays consistent with adjacent platform areas
- [ ] Mobile reviewed
- [ ] Desktop reviewed
- [ ] Accessibility checked: keyboard, focus, semantics, aria, dialogs
- [ ] Loading / empty / error / success states handled where relevant
- [ ] No unrelated UI changes mixed into the PR
- [ ] Repeated fixes centralized when safe
- [ ] No obvious regression risk introduced
- [ ] Any deviation from the design system documented
- [ ] Any deferred item or follow-up documented

## Required PR Summary

```text
## UI/UX Review Summary

### Scope
- [what changed]

### Design-System Alignment
- [shared components, tokens, patterns used]

### Consistency Review
- [how this stays aligned with platform standards]
- [whether anything was centralized]

### Accessibility / Responsive Review
- [what was checked]

### Exceptions / Follow-up
- [any deviation, tradeoff, or item needing later review]
```
