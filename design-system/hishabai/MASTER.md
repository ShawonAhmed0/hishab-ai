# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** HishabAI
**Generated:** 2026-08-16 02:37:36
**Category:** Analytics Dashboard
**Design Dials:** Variance 4/10 (Balanced / Modern) | Motion 3/10 (Subtle) | Density 8/10 (Dense / Dashboard)

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary (fill) | `#00C853` | `--color-primary` |
| Primary (ink) | `#06703A` | `--color-primary-ink` |
| On Primary | `#04220F` | `--color-on-primary` |
| Secondary | `#06703A` | `--color-secondary` |
| On Secondary | `#000000` | `--color-on-secondary` |
| Accent/CTA | `#D97706` | `--color-accent` |
| On Accent/CTA | `#000000` | `--color-on-accent` |
| Background | `#F8FAFC` | `--color-background` |
| Foreground | `#1E3A8A` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#1E3A8A` | `--color-card-foreground` |
| Muted | `#E9EEF6` | `--color-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` |
| Border | `#DBEAFE` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#06703A` | `--color-ring` |

**Color Notes:** Bright green brand, split fill/ink; money in teal, out in rose.

> **OVERRIDE — do not regenerate this section.**
>
> **The brand is two greens, and that is not a redundancy.** A green vivid
> enough to read as *bright* sits at 2.2:1 against white — fine under a
> button, illegible as a word. `--color-primary` is the fill (buttons, active
> chips, the tab underline, the ক্যাশ segment) and nothing but
> `--color-on-primary` is ever placed on it. `--color-primary-ink` is the same
> brand as text — links, an icon beside a heading, a chart stroke — at 6.2:1
> on white. Putting the fill where the ink belongs is a quiet failure: the
> colour still looks right and only the reading gets hard.
>
> **Money moved to make room.** আয়/জমা was `#047857`, which sat 14° of hue
> from the brand green — two greens on one screen that nobody can tell apart,
> where one means "the shop earned this" and the other means "this is a
> button". Credit is now a teal-emerald (`#0F766E` light, `#2DD4BF` dark),
> which opens the gap to 26° and still reads as the positive side of a ledger.
> ব্যয় stays rose and বকেয়া stays amber.
>
> **`--color-info` is a real blue** rather than a copy of the brand, which is
> what it was under indigo. It carries the neutral badge and the ব্যাংক
> segment, both of which sit beside money; a third green there would be one
> more thing to tell apart.
>
> Everything outside the brand and the money semantics is near-neutral, with
> the faintest trace of the brand hue rather than the blue-grey the surfaces
> had under indigo. A ground that leans blue makes a third temperature out of
> what should be the quiet part.
>
> Elevation is tinted with the brand hue rather than black, and each step
> carries a hairline plus an offset blur — the hairline separates a card at
> rest, the blur only does work once it is lifted.
>
> **Dark is not the light theme with the lamps off.** The ground is a charcoal
> carrying a trace of the brand hue (`#080C0A`), the four surface steps are
> spaced far enough apart to actually be seen — the old `#14171F` on `#0C0E16`
> was barely two — and depth comes from an inset top highlight rather than a
> darker shadow, because on a dark ground there is no darker.

### Typography

> **OVERRIDE — do not regenerate this section.** The generator proposed Fira
> Code / Fira Sans. Neither family contains Bengali glyphs, so on a
> Bengali-first product every label would fall back to an unstyled system font.
> Replaced deliberately:

- **UI + Bengali Font:** Noto Sans Bengali (variable, 100–900; ships the Latin subset too)
- **Numeral Font:** Inter, always with `font-variant-numeric: tabular-nums`
- **Mood:** dashboard, data, analytics, precise — held from the original direction
- **Google Fonts:** [Noto Sans Bengali + Inter](https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@100..900&family=Inter:wght@400..700&display=swap)

**Why two families:** Bengali conjuncts and the matra (the headline stroke)
need a face designed for them. Currency figures need fixed-width digits so
columns line up and a changing number does not make the row twitch. No single
family does both well, so text and numbers are split by role.

**Bengali-specific metrics — these are not the usual defaults:**

| Rule | Value | Reason |
|------|-------|--------|
| Body line-height | `1.6` | Matras sit above and descenders below; 1.5 collides |
| Minimum body size | `15px` | Bengali conjuncts (ক্ষ, ঞ্জ) turn to mud below this |
| Numeral rendering | `tabular-nums` + `Inter` | Column alignment in dense financial tables |
| Digits shown | Western (0–9) | Chosen for table legibility and clean spreadsheet export |
| Number grouping | 2,2,3 (৮০,০০,০০০) | Bangladeshi lakh/crore convention, not Western thousands |

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@100..900&family=Inter:wght@400..700&display=swap');
```

### Spacing Variables

*Density: 8/10 — Dense / Dashboard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `2px` / `0.125rem` | Tight gaps |
| `--space-sm` | `4px` / `0.25rem` | Icon gaps, inline spacing |
| `--space-md` | `8px` / `0.5rem` | Standard padding |
| `--space-lg` | `12px` / `0.75rem` | Section padding |
| `--space-xl` | `16px` / `1rem` | Large gaps |
| `--space-2xl` | `24px` / `1.5rem` | Section margins |
| `--space-3xl` | `32px` / `2rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #D97706;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #1E40AF;
  border: 2px solid #1E40AF;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #F8FAFC;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #1E40AF;
  outline: none;
  box-shadow: 0 0 0 3px #1E40AF20;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Data-Dense Dashboard

**Keywords:** Multiple charts/widgets, data tables, KPI cards, minimal padding, grid layout, space-efficient, maximum data visibility

**Best For:** Business intelligence dashboards, financial analytics, enterprise reporting, operational dashboards, data warehousing

**Key Effects:** Hover tooltips, chart zoom on click, row highlighting on hover, smooth filter animations, data loading spinners

### Page Pattern

**Pattern Name:** Enterprise Gateway

- **Conversion Strategy:** Path selection (I am a...). Mega menu navigation. Trust signals prominent. Provide pause/stop for video and rotating logos; stop on focus and reduced motion. Logo carousel controls must be keyboard operable; pause moving media offscreen/hidden and render a static final state under reduced motion.
- **CTA Placement:** Contact Sales (Primary) + Login (Secondary)
- **Section Order:** Hero (Video/Mission) > Solutions by Industry > Solutions by Role > Client Logos > Contact Sales

---

## Motion

**Scroll Reveal** (Subtle) — Trigger: scroll (viewport enter) | Duration: 300-400ms | Easing: `power1.out`

```js
gsap.from(el, { opacity: 0, y: 12, duration: 0.35, ease: 'power1.out', scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none reverse' } });
```

**Framework notes:** Requires the ScrollTrigger plugin registered once via gsap.registerPlugin(ScrollTrigger); Use matchMedia('(prefers-reduced-motion: reduce)') to skip non-essential motion and render the final state immediately

- ✅ Keep the y offset small (8-16px) so it reads as a fade, not a slide
- ❌ Don't reveal below-the-fold content needed for SEO/crawlers as invisible-by-default without a no-JS fallback
- ⚡ toggleActions 'play none none reverse' avoids re-triggering on every scroll direction change

---

## Anti-Patterns (Do NOT Use)

- ❌ Ornate design
- ❌ No filtering

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
