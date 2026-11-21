# MindSahaay Design System & Accessibility Steering

## Visual Tone & Empathy
- Atmosphere: Calming, dignified, institutional yet approachable.
- Typography: Clear sans-serif hierarchy with high contrast and generous line-height (`1.5` to `1.7`).
- Motion: Gentle transitions (`0.2s` to `0.3s ease`). Avoid rapid flashings or jarring movements.
- Themes:
  - Day Mode: Natural botanical greens (`#19443c`, `#2f6a5b`), warm paper canvas (`#fbf8f3`), and crisp contrast.
  - Night Mode: Melatonin-friendly slate (`#0a0f12`), dark moss (`#101e1a`), muted mint highlights (`#74c69d`), zero harsh pure whites.

## WCAG 2.1 AA Compliance Requirements
- Text contrast ratio must exceed 4.5:1 for normal text and 3:1 for large headers.
- All interactive elements must have visible `:focus-visible` outlines.
- All icon-only buttons must have `aria-label` or accessible labels.
- Modal dialogs must trap focus, handle Escape key, and provide an explicit close button.
