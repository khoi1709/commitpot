---
name: "CommitPot"
description: "A compact event-commitment workspace for fixed Test USDC attendance rules."
colors:
  ink: "#242039"
  muted: "#665f79"
  brand: "#5130b5"
  brand-dark: "#3e218f"
  ground: "#f4f3f9"
  line: "#e2deed"
  subtle: "#eeebf7"
  success: "#235b3c"
  error: "#9b263f"
  surface: "#ffffff"
  focus-ring: "#a78bed"
  selection: "#d9cbff"
  selection-ink: "#24184b"
  control-line: "#cbc5da"
  placeholder: "#7a7389"
  network-lime: "#c8f298"
typography:
  display:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "29px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  body:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "13px"
    fontWeight: 500
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
spacing:
  control-gap: "8px"
  content-gap: "20px"
  panel-padding: "29px"
  page-gutter: "42px"
  compact-gutter: "26px"
  mobile-gutter: "16px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    height: "46px minimum"
    padding: "11px 19px"
  button-control:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "10px 15px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "46px"
    padding: "11px 12px"
  event-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "17px 18px"
  workspace-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "29px"
---

# Design System: CommitPot

## Overview

**Creative North Star: "The Accountable Event Ledger"**

CommitPot is an Operate surface: a compact, code-led workspace that makes an event commitment legible before a wallet prompt. The incumbent build translates the student-association direction into a saturated indigo rail, white working surfaces, cool lilac context, dark ink, and a restrained status vocabulary. No images or reference compositions are adopted; the interface earns identity through event phases, exact amounts, native controls, and receipts.

The density is workhorse rather than decorative. A visible phase rail carries the lifecycle from registration through check-in to settlement, while the personal status panel keeps account action distinct from shared event facts. English and Vietnamese use the same local Be Vietnam Pro family and the same measured hierarchy.

**Key Characteristics:**
- Indigo brand rail with white and cool-lilac work surfaces.
- State-first event lifecycle and exact Test USDC amounts.
- Compact readable density with native labelled controls.
- Personal status/action panel that stacks below the event workspace on phones.

## Colors

The palette is a cool indigo system: a saturated brand anchor against paper-white surfaces, quiet lilac structure, dark ink, and restrained semantic status colors.

### Primary
- **CommitPot Indigo** (`{colors.brand}`): The brand rail, primary actions, active language state, and personal-state accent.
- **Deep Indigo** (`{colors.brand-dark}`): The darker brand companion used for high-contrast emphasis where present.

### Neutral
- **Ink** (`{colors.ink}`): Primary copy, amounts, headings, and control text.
- **Muted Ink** (`{colors.muted}`): Supporting copy, timestamps, labels, and explanatory text.
- **Cool Ground** (`{colors.ground}`): The page canvas and scrollbar track.
- **White Surface** (`{colors.surface}`): Working cards, controls, and event workspace interiors.
- **Lilac Line** (`{colors.line}`): Borders, dividers, tab rules, and panel separation.
- **Lilac Subtle** (`{colors.subtle}`): Soft selected/hover surfaces and active language treatment.

### Tertiary
- **Confirmed Green** (`{colors.success}`): Settled and confirmed states where the underlying state is known.
- **Error Crimson** (`{colors.error}`): Errors and failed-state messaging.
- **Network Lime** (`{colors.network-lime}`): The small network indicator on the brand rail.

### Named Rules
**The State-First Rule.** Use color to reinforce a known lifecycle or account state; never let decoration outrank the event phase or exact amount.

**The Indigo Anchor Rule.** Keep saturated indigo concentrated in brand navigation, primary action, and active state roles against quiet working surfaces.

## Typography

**Display Font:** Be Vietnam Pro (local `@fontsource` files, with `sans-serif` fallback)
**Body Font:** Be Vietnam Pro (local `@fontsource` files, with `sans-serif` fallback)
**Label/Mono Font:** Be Vietnam Pro remains the family for labels and addresses; addresses use tabular numerals and inherited family rather than a separate mono face.

**Character:** The single local sans family is compact, practical, and readable across English and Vietnamese. Weight, spacing, and size create hierarchy instead of a display-face contrast.

### Hierarchy
- **Display** (600, 29px, 1.3, `-0.035em`): Page titles and the primary entry point of a view.
- **Headline** (600, 24px, 1.4, `-0.025em`): Main workspace headings and prominent section titles.
- **Title** (600, 15px): Small section headings, cards, and activity labels.
- **Body** (400, 14px, 1.6): Default interface copy and readable event explanation.
- **Label** (500, 13px): Form labels and compact control descriptors; smaller supporting labels descend to 12px or 11px only where the existing surface requires it.

### Named Rules
**The Workhorse Sans Rule.** Keep the local Be Vietnam Pro family for all UI copy, including translated labels and account addresses; do not introduce a decorative display face.

## Layout

The desktop shell is a two-column grid: a sticky 224px brand rail and a fluid workspace. The top bar is 88px tall with 42px horizontal padding; the demo banner and page content use the same broad gutter. The event view uses an event-picker column beside a flexible event workspace, and the workspace itself separates event facts from a personal status panel.

The build's observed breakpoint behavior is: a 1500px wide-screen refinement, a 1250px compact desktop adjustment, a 1000px single-column shell where the brand rail becomes a mobile brand, and a 760px phone layout. At phone width, the event picker becomes a horizontal event list, the event body becomes a vertical stack, and the personal panel moves below the event content with a top border. Keep the sidepanel stack behavior; it is the mobile reading order for personal action.

Spacing is compact but not cramped: 42px page gutters on wide desktop, 26px compact gutters, 29px workspace padding, 20px content gaps, and 16px mobile gutters are evidenced in the implementation. Interactive controls retain native labelled affordances and a minimum 44px button height; inputs and selects use a 46px minimum height.

## Elevation & Depth

Depth is a restrained hybrid: white surfaces and lilac borders do most of the structural work, with very low-opacity shadows reserved for the selected event item and the main event workspace. There are no decorative floating layers or image treatments.

### Shadow Vocabulary
- **Selected event lift** (`box-shadow: 0 3px 12px #3b216808`): A barely visible cue for the selected event card.
- **Workspace ambient** (`box-shadow: 0 8px 36px #33225105`): A low-opacity ambient separation around the event workspace.

### Named Rules
**The Quiet Depth Rule.** Prefer tonal layering and borders at rest; shadows remain low-opacity and structural rather than expressive.

## Shapes

Controls and small cards use gently rounded 8px corners. Event items use 10px corners, while the main event workspace uses the 12px radius token. Borders are light lilac and clipping is used on the workspace so its internal tabs and panels stay within the rounded silhouette. Native inputs, selects, buttons, and details/summary controls remain recognizable rather than being replaced by decorative shapes.

## Components

### Buttons
- **Shape:** Gently rounded controls (8px); primary actions share the 44px minimum control height.
- **Primary:** Indigo background, white text, compact inline-flex content with an arrow or check icon where the action advances state.
- **Hover / Focus:** Hover moves a neutral control to the subtle lilac surface; keyboard focus uses the shared visible outline. Pressed controls move down 1px; disabled controls use reduced opacity and a not-allowed cursor.
- **Secondary / Ghost / Tertiary:** Neutral white controls, text actions, and transparent language/tab controls preserve native button semantics and use muted ink until active.

### Cards / Containers
- **Corner Style:** Event items are 10px; the event workspace is 12px.
- **Background:** White working surfaces on the cool ground canvas; the personal panel uses a near-white lilac-tinted surface.
- **Shadow Strategy:** Use the quiet selected-item and workspace ambient shadows from Elevation & Depth.
- **Border:** Light lilac borders define event workspace, controls, tabs, and panel separation.
- **Internal Padding:** The workspace uses 29px at the standard desktop width, stepping down at compact and phone breakpoints.

### Inputs / Fields
- **Style:** White native inputs, selects, and textareas with a light control-line stroke, 8px radius, 46px minimum height, and compact internal padding.
- **Focus:** A 3px visible outline with a 3px offset uses the focus-ring color for buttons, links, inputs, textareas, selects, and summary controls.
- **Error / Disabled:** Errors appear in a role-alert notice using the error semantic; disabled controls reduce opacity and remain non-interactive.

### Navigation
- **Style:** A sticky indigo brand rail anchors desktop navigation; the 88px white top bar carries the event caption, EN/VI language control, and wallet connection. At 1000px and below the rail is hidden and a mobile brand replaces it.
- **States:** Language and event tabs use `aria-pressed`/`aria-current` state with indigo active text and a subtle lilac surface or rule.
- **Mobile treatment:** Navigation collapses to the top bar without inventing a drawer; the event and personal content stack in reading order.

### Event Phase Rail
The recurring three-step ordered rail displays registration, check-in opening, and check-in closing with timestamps. Reached nodes show the check icon; unreached nodes retain their numbered node. This is the signature lifecycle component and should remain more prominent than decorative status treatment.

## Do's and Don'ts

### Do:
- **Do** keep the indigo, white, cool-lilac, dark-ink palette and use semantic green/crimson only for confirmed status or errors.
- **Do** preserve Be Vietnam Pro local font files and the same hierarchy for EN and VI.
- **Do** keep native labelled controls, minimum 44px buttons, 46px fields, visible keyboard focus, and the reduced-motion behavior already implemented.
- **Do** keep exact deposit amounts, event phase, and personal status ahead of decorative treatment.
- **Do** preserve the phone sidepanel stack: event facts first, personal status/action second.

### Don't:
- **Don't** add trading-dashboard decoration, yield imagery, ticket-paper costume, or adopted reference compositions.
- **Don't** treat a small desktop label sizing/fit defect as a normative rule; it remains a finish-review item, not a token.
- **Don't** claim accessibility certification from observed focus, native-control or reduced-motion rules. Independent review accepted the two scoped receipt/density corrections, not a blanket certification.
- **Don't** replace native controls with glyph-only or unlabeled visual affordances.
