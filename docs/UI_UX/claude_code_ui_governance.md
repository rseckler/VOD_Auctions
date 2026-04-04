# Claude Code UI Governance — Daily Operating Prompt + PR Definition of Done

## 1) Daily Operating Prompt for Claude Code

Use this prompt for every UI-related task, feature, rework, refactor, or bugfix.

```text
You are working on an existing production platform with established UI/UX governance.

Your task is not only to implement UI changes, but to preserve and strengthen the platform’s long-term consistency.

Mandatory target state for all work:
- a clear design-system core
- a mandatory set of shared components
- an engineering workflow that stops deviations early
- a UX quality bar that runs with every new feature
- a high-quality, consistent, mature platform aesthetic
- enough flexibility for complex business logic, without visual or interaction chaos

Core rules:
1. Treat the Style Guide as the source of truth for UI rules.
2. Reuse shared components wherever they exist.
3. Do not introduce one-off styling when tokens, utilities, or system patterns already exist.
4. Do not create local solutions that weaken platform consistency.
5. Prefer the smallest correct, system-aligned implementation.
6. Preserve accessibility, responsive behavior, and product logic.
7. Centralize repeated fixes when safe.
8. If a requested change conflicts with the design system, explicitly flag it and propose the compliant path.
9. Do not redesign unrelated areas.
10. Every UI task must leave the platform at least as consistent as before.

Working sequence for every task:
1. Understand the task and affected area.
2. Check existing shared components, layout patterns, states, and responsive behavior.
3. Identify which design-system rules apply.
4. Implement the smallest correct solution using shared primitives and tokens.
5. Validate consistency, accessibility, and responsive behavior.
6. Document any necessary exception.

Definition of success:
- solves the task
- aligns with the design system
- uses shared components where appropriate
- avoids new UI drift
- preserves or improves accessibility
- feels consistent with the rest of the platform
- supports complexity without visual or interaction chaos

Required output for each task:
1. Scope
- what changed

2. System alignment
- which shared components, tokens, or platform patterns were used

3. Consistency review
- how the work stays aligned with the design system
- whether any repeated issue was centralized

4. Accessibility / responsive review
- what was checked

5. Exceptions
- any deviation from the design system
- why it was necessary
- whether follow-up is needed

Red flags — stop and reassess if the implementation:
- introduces raw controls instead of shared components
- adds hardcoded design values
- creates a new pattern without checking existing ones
- makes one screen prettier but less consistent with the platform
- weakens accessibility
- introduces visual noise
- increases interaction inconsistency
- relies on local hacks to solve systemic issues

Default instruction:
Do not merely make the UI work.
Make it consistent, system-compliant, accessible, reusable, and worthy of the platform as a whole.
```

---

## 2) PR Definition of Done Checklist

Use this checklist for every UI-related PR.

### A. Design-System Compliance
- [ ] Shared components are used wherever appropriate.
- [ ] No raw button/input/dialog/form control was introduced where a shared component already exists.
- [ ] No new hardcoded hex values, arbitrary spacing values, or one-off visual tokens were introduced.
- [ ] Typography, spacing, radius, shadows, and layout rules follow the design system.
- [ ] Headings and content hierarchy are consistent with platform standards.
- [ ] New UI patterns were avoided unless truly necessary.
- [ ] Any new reusable pattern was added in a way that strengthens the system.

### B. UX Consistency
- [ ] The feature behaves consistently with similar flows across the platform.
- [ ] Labels, states, feedback, and control behavior feel coherent with adjacent areas.
- [ ] No jarring local interaction model was introduced.
- [ ] Complex business logic is presented with structure and hierarchy, not clutter or chaos.
- [ ] The resulting UI feels like part of the same product family.

### C. Responsive Quality
- [ ] Mobile behavior was intentionally reviewed.
- [ ] Desktop behavior was intentionally reviewed.
- [ ] Touch targets are appropriate where relevant.
- [ ] Sticky or dense UI does not obscure critical content.
- [ ] Layout, spacing, and alignment remain stable across breakpoints.

### D. Accessibility
- [ ] Keyboard navigation works.
- [ ] Focus states remain visible and meaningful.
- [ ] Semantic structure is correct.
- [ ] Heading hierarchy is coherent.
- [ ] ARIA usage is meaningful and not decorative misuse.
- [ ] Dynamic updates are announced where needed.
- [ ] Dialogs, drawers, and overlays are accessible.
- [ ] Decorative images/elements are treated correctly.

### E. State Quality
- [ ] Loading states exist where needed.
- [ ] Empty states exist where needed.
- [ ] Error states exist where needed.
- [ ] Retry or recovery paths exist where needed.
- [ ] Success/confirmation feedback is appropriate.

### F. Engineering Quality
- [ ] No unrelated UI cleanup was mixed into this PR.
- [ ] Repeated fixes were centralized when safe.
- [ ] No unnecessary duplication of UI logic was introduced.
- [ ] Imports, build, and runtime behavior were checked.
- [ ] No obvious regression risk was introduced in adjacent flows.

### G. Platform Aesthetic
- [ ] The UI feels mature, trustworthy, and product-grade.
- [ ] The result improves clarity rather than adding noise.
- [ ] The screen/module feels intentional, not improvised.
- [ ] Storefront or admin context is respected without breaking overall platform consistency.

### H. Exceptions / Follow-up
- [ ] Any deviation from the design system is explicitly documented.
- [ ] Any deferred improvement is explicitly documented.
- [ ] Any item needing product/design input is explicitly called out.

---

## 3) Required PR Summary Format

Use this exact summary in every UI PR.

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

---

## 4) Team Rule

Every UI change is design-system work.

Do not optimize for local speed at the expense of long-term consistency.
Prefer solutions that preserve a clear design-system core, a mandatory shared component model, early deviation control, a running UX quality bar, a mature platform aesthetic, and structured support for complex workflows without visual or interaction chaos.
