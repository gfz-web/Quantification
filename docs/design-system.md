# Fear Greed Data Display Design System

## Design Direction

This project is a market-data and strategy review tool. The UI should feel like a calm financial workstation: dense, readable, precise, and repeatable. Visual style is intentionally restrained so charts, numbers, dates, and trade states remain the center of attention.

## Principles

- Prioritize scan speed: key numbers, status labels, and ranges must be readable at a glance.
- Keep decoration quiet: use borders, spacing, and small accents instead of large visual effects.
- Make charts feel primary: chart containers get stable dimensions and neutral backgrounds.
- Treat tables as work surfaces: compact rows, sticky headers, clear positive/negative states.
- Preserve accessibility: visible focus states, strong contrast, 44px interactive targets on touch.

## Tokens

### Color

- `--bg`: page background, cool light gray `#f4f7fb`
- `--surface`: primary surface `#ffffff`
- `--surface-muted`: secondary surface `#f8fafc`
- `--surface-strong`: emphasized surface `#eef4f8`
- `--line`: default border `#d7e0ea`
- `--line-strong`: emphasized border `#b8c6d6`
- `--text`: main text `#17202a`
- `--muted`: secondary text `#687789`
- `--subtle`: tertiary text `#8b98a8`
- `--price`: index/price blue `#2563eb`
- `--fear`: risk amber `#d97706`
- `--buy`: positive green `#059669`
- `--sell`: negative red `#dc2626`
- `--score-accent`: dynamic status color, driven by page scripts

### Typography

- Font stack: `Inter`, `Noto Sans SC`, `PingFang SC`, `Microsoft YaHei`, system sans-serif.
- Body: 16px, line-height 1.6.
- Page titles: 40px desktop, 32px tablet, 28px mobile.
- Section titles: 20px.
- Metric labels: 12px uppercase or compact Chinese labels.
- Numeric emphasis: tabular numerals via `font-variant-numeric: tabular-nums`.

### Spacing

- Page max width: 1280px.
- Page padding: 28px desktop, 16px mobile.
- Section spacing: 20px.
- Panel padding: 24px desktop, 18px mobile.
- Grid gap: 16px desktop, 12px mobile.

### Shape And Elevation

- Radius is intentionally modest: 8px for panels and repeated data cells.
- Elevation is subtle: one soft shadow for top-level panels only.
- Borders carry most hierarchy; nested elements avoid heavy shadows.

## Components

### Navigation

Tabs are compact segmented controls. Active tabs use a blue border and quiet blue background. Focus states must be visible.

### Hero / Summary

The hero presents context and controls; the summary presents the current metric. Summary numbers are large but not oversized, and use tabular numerals.

### Metrics

Metrics are compact data cells with a label, value, and optional note. They use neutral backgrounds and a top border accent only when necessary.

### Chart Frame

Charts sit on white surfaces with a fixed minimum height and visible border. Legends remain outside the chart so the canvas stays clean.

### Tables

Tables use sticky headers, horizontal scroll on small screens, compact rows, and color-coded badges. Positive and negative values must not rely on color alone when used in badges.

## Responsive Rules

- Above 900px: two-column hero layout.
- Below 900px: single-column hero and two-column metric grids where possible.
- Below 640px: one-column grids, reduced padding, chart height reduced but still stable.

## Interaction Rules

- Buttons and inputs have at least 42px height.
- Hover moves are limited to 1px or border/color changes.
- Motion respects `prefers-reduced-motion`.
- Icon-only controls need labels, though current UI mostly uses text controls.
