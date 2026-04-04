# CLAUDE.md — UI Governance + Strict Execution Playbook

This file defines the mandatory operating model for all future UI work in this codebase.

Use it for:
- new UI features
- UI bugfixes
- refactors
- redesigns
- audit follow-up work
- verification passes
- implementation review passes

---

## 1) Core Mandate

You are working in an existing production platform with established UI/UX governance.

Your job is not just to build features.
Your job is to preserve, strengthen, verify, and extend a coherent platform design system.

Every UI change must reinforce this target state:

- a clear design-system core
- a mandatory set of shared components
- an engineering workflow that stops deviations early
- a UX quality bar that runs with every new feature
- a high-quality, consistent, mature platform aesthetic
- enough flexibility for complex business logic, without visual or interaction chaos

These are mandatory implementation requirements.

---

## 2) Source of Truth Hierarchy

Reference documents may exist in the repository:

- `UI_UX_STYLE_GUIDE.md`
- `UI_UX_GAP_ANALYSIS.md`
- `UI_UX_OPTIMIZATION_PLAN.md`
- `UI_UX_IMPLEMENTATION_REPORT.md`

Priority order:

1. `UI_UX_STYLE_GUIDE.md` = source of truth for UI/UX rules
2. `UI_UX_GAP_ANALYSIS.md` = source of truth for issue definitions
3. `UI_UX_OPTIMIZATION_PLAN.md` = source of truth for priority/order
4. `UI_UX_IMPLEMENTATION_REPORT.md` = prior claims only, must be verified

If the report conflicts with the Style Guide or Gap Analysis, the report loses.
If code conflicts with the Style Guide, the Style Guide wins.

---

## 3) Default Operating Mode

You are in **EXECUTION MODE**, not brainstorming mode.

Rules:
- Do not assume the existing implementation report is correct.
- Do not assume a GAP is fixed unless code confirms it.
- Do not assume “deferred” is justified unless the reason is strong.
- Do not make broad redesigns.
- Do not invent new product patterns unless the documents force it.
- Do not mix unrelated changes into one batch.
- Do not hide uncertainty.
- Do not overclaim completion.
- Work in small, reviewable batches.

---

## 4) Platform Standards

### 4.1 Design-System Core
The platform must have a stable, recognizable design-system foundation.

All UI must align to shared rules for:
- color
- typography
- spacing
- radius
- shadows
- layout width
- interaction states
- accessibility
- responsiveness
- feedback patterns

Do not introduce ad hoc visual solutions when existing system patterns already cover the need.

### 4.2 Shared Components Are Mandatory
Where shared components exist, they must be used.

Examples:
- Button
- Input
- Textarea
- Select
- Checkbox / Radio / Switch
- Dialog / Modal
- Sheet / Drawer
- Card
- Table primitives
- Form field wrappers
- Heading / Section primitives
- Container / Page layout primitives
- Empty / Loading / Error states
- Toast / Inline feedback patterns

Do not build raw custom replacements for shared components unless:
- the existing component truly cannot support the use case
- the new component is justified as a reusable system addition
- the new pattern strengthens the design system

### 4.3 Consistency Over Local Optimization
Do not optimize a single screen in a way that harms platform consistency.

A slightly less clever but more system-consistent solution is better than a custom local pattern.

### 4.4 Flexibility Without Chaos
The platform may contain:
- complex business workflows
- dense data
- domain-heavy interfaces

Complexity is acceptable.
Chaos is not.

Support complexity using:
- information hierarchy
- progressive disclosure
- consistent navigation
- repeatable interaction patterns
- clear grouping
- strong defaults
- stable visual language

Do not express complexity through:
- random spacing
- mixed interaction models
- inconsistent controls
- unexplained visual emphasis
- over-styled exceptions
- fragmented form patterns

### 4.5 Mature Platform Aesthetic
The UI should feel:
- consistent
- robust
- sophisticated
- clear
- powerful
- restrained
- credible
- product-grade

It must not feel:
- improvised
- noisy
- chaotic
- decorative without purpose
- template-like
- disconnected between areas

---

## 5) Engineering Enforcement Rules

These rules exist to stop drift early.

### 5.1 No Hard-Coded Design Values Where Tokens Exist
Do not introduce:
- hardcoded hex colors
- arbitrary spacing values
- custom border radii
- one-off font sizes
- inconsistent shadows
- isolated z-index hacks

when tokens, utilities, or design-system variables already exist.

### 5.2 No Raw Controls Where Shared Controls Exist
Do not create raw buttons, inputs, dialogs, or form controls when shared components already exist.

### 5.3 No New Page-Specific Patterns Without Justification
If you need a new pattern:
- first check whether an existing pattern can solve it
- only create a new one if needed
- make it reusable
- align it with the design system
- document why it is necessary

### 5.4 No Merging of Unrelated UI Changes
Keep UI changes scoped.
Do not mix bugfixes, redesigns, audits, refactors, and polish into one uncontrolled change set.

### 5.5 Centralize Repeated Fixes
If the same problem appears in multiple places:
- solve it in the shared component or layout primitive when safe
- do not patch the same defect screen by screen unless centralization is too risky

### 5.6 Early Deviation Stop
If a requested implementation would violate the design system:
- stop
- explain the conflict
- propose the compliant implementation path

Do not knowingly ship inconsistent UI without flagging it.

---

## 6) Mandatory Workflow For Every UI Task

For every UI-related task, follow this sequence.

### STEP 1 — Understand The Job
Determine:
- what the change is
- whether it affects storefront, admin, or shared systems
- which existing components and patterns are relevant
- which design-system rules apply
- whether this is local, systemic, or architectural

### STEP 2 — Check System Fit
Before coding, verify:
- does a shared component already exist?
- does a layout/container pattern already exist?
- is there an established heading/content hierarchy?
- is there already a standard error/loading/empty state?
- is there already a responsive pattern for this type of view?

If yes, reuse it.
If not, introduce the smallest reusable system extension.

### STEP 3 — Implement The Smallest Correct Solution
Make the smallest change that:
- solves the problem
- preserves consistency
- avoids duplication
- does not introduce drift
- keeps regression risk low

### STEP 4 — Run UX/UI Quality Check
Before considering the work complete, verify:
- visual consistency
- interaction consistency
- mobile behavior
- accessibility
- content hierarchy
- error handling
- state handling
- spacing alignment
- component correctness

### STEP 5 — Document Any Exception
If you had to deviate from the design system:
- state where
- state why
- state whether it should become a shared pattern later

---

## 7) Strict Second-Pass / Audit / Verification Mode

When the task is an audit follow-up, implementation review, or validation pass, use the stricter sequence below.

### Primary Objective
Produce a trustworthy second-pass result that:
- corrects false positives
- fixes incomplete work
- closes the highest-value remaining gaps
- preserves business logic
- minimizes regression risk
- updates the implementation report with evidence-based statuses

### Mandatory Execution Sequence

#### STEP 0 — Ingest Documents
- Read the Style Guide
- Read the Gap Analysis
- Read the Optimization Plan
- Read the existing Implementation Report
- Build an internal map of all GAP IDs, severity, claimed status, and expected target behavior

#### STEP 1 — Rebuild Status From Scratch
For every GAP ID:
- identify the original issue
- identify the target rule in the Style Guide
- inspect the relevant code
- compare current implementation to expected behavior
- classify each GAP as exactly one of:
  - FIXED
  - PARTIALLY FIXED
  - NOT FIXED
  - DEFERRED
  - ALREADY PRESENT
  - NEEDS PRODUCT DECISION

Do not inherit prior statuses without proof.

#### STEP 2 — Find Status Errors
Create a list of all items where the previous report was inaccurate:
- overclaimed fixes
- partial fixes marked as complete
- items marked “already present” but not actually compliant
- items marked deferred with weak reasoning
- fixes that introduced Style Guide conflicts

#### STEP 3 — Prioritize What To Do Next
Create a strict execution queue in this order:
A. incorrect “fixed” items that are not actually fixed  
B. fixes that conflict with the Style Guide  
C. incomplete accessibility fixes  
D. remaining critical storefront items  
E. remaining high-value storefront items  
F. systemic/shared-component fixes with low regression risk  
G. meaningful medium issues  
H. admin consistency/accessibility issues  
I. low-priority polish

#### STEP 4 — Implement In Small Batches
For each batch:
- choose a tight set of related GAP IDs
- state whether you are correcting, validating, or implementing
- identify affected files
- make the smallest correct change
- avoid unrelated cleanup
- prefer central fixes only when clearly justified

#### STEP 5 — QA After Each Batch
After each batch:
- check for runtime/build/type issues as applicable
- check imports
- check accessibility impact
- check for regression risk
- check for consistency with shared components/tokens
- record findings

#### STEP 6 — Update Report Honestly
Update or rewrite the implementation report so that it reflects reality, not optimism.

---

## 8) Critical Re-Validation Targets

Explicitly verify these areas first before broader implementation:

### 8.1 Logout / Destructive Action Confirmation
- Check whether browser confirm was removed.
- Check whether the Style Guide requires confirmation for destructive actions.
- If confirmation is required, replace browser confirm with the design-system dialog pattern.
- Do not leave destructive actions without confirmation if that violates the guide.

### 8.2 Sticky Mobile Bid CTA
- Verify whether the original GAP about sticky mobile bid CTA was truly resolved.
- Do not accept “already existed” unless the actual implementation clearly satisfies the documented requirement.
- If prior report downgraded or dismissed this incorrectly, correct it.

### 8.3 Accessibility Fixes Claimed As Complete
Re-check:
- skip-to-content link
- aria-live for dynamic updates
- decorative image handling
- focus visibility
- heading hierarchy
- keyboard operability
- dialog accessibility

Only mark complete if implementation is robust and not cosmetic.

### 8.4 Design-System Compliance
Re-check:
- hardcoded hex values
- shared Button/Input/Dialog usage
- container width consistency
- heading class consistency
- token usage

Do not mark resolved if fixes were partial or local-only where systemic cleanup was required.

### 8.5 Admin “Desktop-Only” Rationale
- Validate against the Style Guide.
- Desktop-only may justify skipping mobile admin layout work.
- It does NOT justify broken desktop UX, inconsistency, or accessibility issues.
- Continue enforcing desktop quality.

---

## 9) Implementation Policy

When implementing a fix:
- identify the GAP ID
- identify the matching Style Guide rule
- identify severity
- identify whether storefront or admin
- identify whether local or systemic
- apply the smallest correct solution
- preserve business logic unless the issue explicitly requires behavior changes

Prefer:
- shared primitives
- tokens
- semantic HTML
- accessible dialogs
- mobile-first safe adjustments
- low-risk refactors

Avoid:
- broad rewrites
- speculative UI improvements
- new abstractions without strong need
- mixing audits and major refactors in one step
- editing untouched areas “while you’re there”

---

## 10) Centralization Rule

Centralize only when one of these is true:
- the same defect appears repeatedly
- a shared component already exists
- the Style Guide clearly requires a system-level pattern
- a centralized fix materially reduces future regressions

Do NOT centralize if:
- it causes broad churn
- it risks unrelated regressions
- the issue is isolated and local
- it would delay high-priority fixes significantly

---

## 11) Deferral Rule

You may defer an item only if one of these is true:
- genuine product decision required
- missing requirements block correct implementation
- large architectural refactor required
- low impact + high regression risk
- intentionally unsupported surface

Every deferred item must include:
- exact reason
- impact if left unresolved
- why it is not reasonable in this pass
- likely next step
- whether product/design input is needed

Unacceptable deferral reasons:
- “too much work”
- “admin only”
- “looks okay”
- “already implemented” without verification
- “nice to have” when original severity is high/critical

---

## 12) Definition of Done For All UI Work

No UI task is done unless all relevant items below are satisfied.

### 12.1 Design-System Compliance
- shared components used where appropriate
- tokens used where appropriate
- layout rules respected
- headings and hierarchy are consistent
- no accidental one-off styling introduced

### 12.2 UX Consistency
- the feature behaves like the rest of the platform
- similar tasks use similar interaction models
- labels, controls, states, and feedback feel coherent
- no jarring shift in tone, structure, or navigation model

### 12.3 Responsive Quality
- mobile is handled intentionally
- desktop is preserved
- sticky or dense interfaces do not obscure critical content
- touch targets are adequate where relevant

### 12.4 Accessibility
- keyboard navigation works
- focus states remain visible
- semantic structure is correct
- aria usage is meaningful
- dynamic updates are announced where needed
- dialogs are accessible
- decorative elements are treated correctly

### 12.5 State Quality
- loading state exists where needed
- empty state exists where needed
- error state exists where needed
- retry or recovery path exists where needed
- success/confirmation feedback is appropriate

### 12.6 Platform Aesthetic
- the result looks intentional and premium
- visual hierarchy is strong
- the interface feels stable and mature
- the solution adds clarity rather than noise

---

## 13) Mandatory QA Checklist

After each batch and again at the end, verify:

- no obvious runtime errors
- no broken imports
- no new type/build errors, if applicable
- no accidental duplicated UI logic
- focus states remain visible
- keyboard navigation still works
- aria attributes are valid
- dialogs are accessible
- touch targets meet minimum size where required
- sticky elements do not obscure key content
- mobile inputs behave correctly
- heading hierarchy remains coherent
- shared components are used consistently
- no new hardcoded hex values were introduced
- desktop layout did not regress
- storefront critical flows still function

Accessibility is mandatory.
Do not trade accessibility away for visual polish.

---

## 14) Required Output Format For Every Task

For each task or batch, provide:

### Scope
- what changed

### System Alignment
- which shared components, tokens, or platform patterns were used

### Consistency Review
- how the result stays aligned with the design system
- whether any repeated issue was centralized

### Accessibility / Responsive Review
- what was checked

### Exceptions
- any deviation from the design system
- why it was necessary
- whether follow-up is needed

For strict audit/verification batches, also use:

### Batch Header
- Batch goal
- GAP IDs
- Type: validation / correction / implementation
- Files likely affected

### Batch Result
1. Changes made
2. GAP IDs updated
3. Files changed
4. Status changes
5. QA notes
6. Risks / follow-up

Keep each batch tight and reviewable.

---

## 15) Report Requirement

When running a second-pass verification or audit follow-up, update or create `docs/UI_UX_IMPLEMENTATION_REPORT.md` with these sections:

1. Executive Summary
- what was revalidated
- what was corrected
- what was newly implemented
- overall counts by severity

2. Status Corrections
For each corrected prior claim:
- GAP ID
- previous reported status
- corrected status
- evidence/reason

3. Implemented In This Pass
For each item:
- GAP ID
- severity
- files changed
- what changed
- why it resolves the issue

4. Deferred After Re-Review
For each item:
- GAP ID
- severity
- exact reason
- impact
- suggested next step

5. Open Product / Design Decisions
- unresolved items that require stakeholder input

6. QA Summary
- checks performed
- notable manual review points
- known residual risks

The report must be sober, precise, and non-promotional.

---

## 16) Final Success Criteria

Success means:
- previously overclaimed work is corrected
- Style Guide conflicts are resolved
- high-value remaining gaps are reduced
- report credibility increases
- remaining deferred items are truly justified
- no unnecessary churn was introduced

A task is successful only if it:
- solves the business or UX problem
- strengthens the design-system core
- reinforces the mandatory shared component model
- stops deviation instead of spreading it
- preserves a consistent UX/UI across the platform
- maintains a high-quality, mature, product-grade aesthetic
- supports complex workflows without visual or interaction chaos

If forced to choose between speed and platform integrity, prefer the solution that protects long-term system consistency.

---

## 17) Default Instruction

Every UI implementation, revision, and refactor must be treated as design-system work.

Do not merely make it work.
Make it consistent, system-compliant, accessible, reusable, and worthy of the platform as a whole.
