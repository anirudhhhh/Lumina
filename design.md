---
name: Lumina Identity
colors:
  surface: '#14140f'
  surface-dim: '#14140f'
  surface-bright: '#3a3933'
  surface-container-lowest: '#0e0e0a'
  surface-container-low: '#1c1c17'
  surface-container: '#20201a'
  surface-container-high: '#2a2a25'
  surface-container-highest: '#35352f'
  on-surface: '#e5e2da'
  on-surface-variant: '#c4c6cc'
  inverse-surface: '#e5e2da'
  inverse-on-surface: '#31312b'
  outline: '#8e9196'
  outline-variant: '#44474c'
  surface-tint: '#bbc7da'
  primary: '#bbc7da'
  on-primary: '#253140'
  primary-container: '#1e2a38'
  on-primary-container: '#8591a2'
  inverse-primary: '#535f6f'
  secondary: '#7fd0ff'
  on-secondary: '#00344a'
  secondary-container: '#339acc'
  on-secondary-container: '#002d41'
  tertiary: '#95d2ca'
  on-tertiary: '#003733'
  tertiary-container: '#002f2b'
  on-tertiary-container: '#5f9b94'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d7e3f6'
  primary-fixed-dim: '#bbc7da'
  on-primary-fixed: '#101c2a'
  on-primary-fixed-variant: '#3c4857'
  secondary-fixed: '#c5e7ff'
  secondary-fixed-dim: '#7fd0ff'
  on-secondary-fixed: '#001e2d'
  on-secondary-fixed-variant: '#004c6a'
  tertiary-fixed: '#b0eee6'
  tertiary-fixed-dim: '#95d2ca'
  on-tertiary-fixed: '#00201d'
  on-tertiary-fixed-variant: '#07504a'
  background: '#14140f'
  on-background: '#e5e2da'
  surface-variant: '#35352f'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 56px
    fontWeight: '900'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  gutter: 24px
  margin-desktop: 40px
  stack-overlap: -16px
---

## Brand & Style

This design system breaks the sterile, repetitive patterns of cybersecurity tools by embracing a "Human-Technical Collage" aesthetic. It targets expert reverse engineers who value both high-precision utility and creative problem-solving. The emotional response is one of sophisticated curiosity—moving away from "hacker" tropes toward a studio-like environment for digital forensics.

The style is a hybrid of **Minimalism** and **Tactile Collage**. It uses overlapping organic shapes, paper-like textures, and intentional "ink-bleed" details to contrast with the rigid logic of APK decompilation. Key traits include:
- **Layered Depth:** Elements appear as if physically placed on a surface, using sophisticated shadows rather than simple elevation.
- **Organic Geometry:** Hand-drawn textures and irregular blobs soften the technical nature of code analysis.
- **Academic Authority:** High-contrast serif typography lends an editorial, literary feel to the data.

## Colors

The palette is rooted in a professional yet technical spectrum that differentiates it from the neon-on-black standard of security tools.

- **Deep Navy (#1E2A38):** The primary structural color, used for main backgrounds and deep-tier navigation.
- **Technical Azure (#3EA2D4):** Used for primary actions, critical alerts, and highlighted code segments. This color provides a high-contrast, energetic technical focus.
- **Cream (#F5F2E9):** The primary surface color for "paper" cards, layered elements, and high-readability text on dark backgrounds.
- **Muted Teal (#5F9B94):** Used for secondary data visualizations, "safe" status indicators, and subtle decorative accents.

The default mode is **Dark**, utilizing the Deep Navy as the canvas, but the UI frequently employs "Light" containers (Cream) for document-heavy content.

## Typography

The typography strategy relies on the tension between academic elegance and technical precision.

- **Headlines:** Use **Playfair Display** in heavy weights. The high contrast of this serif font evokes a sense of "investigative journalism" or "curated archives," perfect for high-level summary reports.
- **UI & Body:** **Plus Jakarta Sans** provides a friendly, modern counter-balance. Its high x-height ensures clarity in complex data tables and property panels.
- **Labels & Metadata:** **Space Grotesk** is used for utility labels and small caps to provide a subtle "engineering" feel without losing the human touch.
- **Code:** **JetBrains Mono** is reserved strictly for decompiled Java/Smali source code and terminal outputs.

## Layout & Spacing

This design system uses a **Fluid Studio Grid** that prioritizes white space and "collage" layering. 

- **Layering Model:** Unlike standard flat layouts, elements often overlap by `-16px` or `-24px` to create a "piled papers" effect.
- **Desktop Strategy:** A 12-column grid is used, but content containers often ignore grid lines to allow for organic "blobs" and textured background shapes to peek through.
- **Margins:** Large 40px outer margins keep the technical content from feeling claustrophobic. 
- **Density:** High density is maintained within "data cards," but the space between cards remains generous to prevent cognitive overload during complex reverse engineering tasks.

## Elevation & Depth

Hierarchy is established through **Layered Tactility** rather than traditional material elevation.

- **The "Paper" Stack:** Surfaces are treated as physical sheets. Lower-tier surfaces use the Deep Navy background, while "active" work surfaces use the Cream color with a subtle grain texture.
- **Sophisticated Shadows:** Avoid generic 0 2 4 shadows. Use multi-layered, low-opacity shadows with a hint of the secondary color (`rgba(62, 162, 212, 0.1)`) to simulate natural light hitting a physical desk.
- **Edge Treatment:** Cards should have a thin, 1px border in a slightly darker shade of their background color to define their edges against textures.
- **Backdrop Blurs:** Use `backdrop-filter: blur(12px)` on overlapping navigation panels to maintain the "human" softness of the UI.

## Shapes

The shape language is a mix of **Clean Containers** and **Organic Accents**.

- **Containers:** UI cards and buttons use a `0.5rem` (8px) radius to maintain a professional, desktop-app structure.
- **Organic Blobs:** Large, non-interactive background elements use highly irregular, hand-drawn SVG shapes. These should be treated as "stickers" or "ink splotches" behind the functional UI.
- **Clipping:** Occasionally clip the corners of code blocks at 45-degree angles to signify "technical snippets" within the otherwise rounded UI.

## Components

### Buttons & Inputs
- **Primary Action:** Solid Azure with Cream text. Sharp corners on one side, rounded on the other to mimic a "tab" or "tag."
- **Ghost Actions:** Muted Teal outlines with Space Grotesk labels.
- **Inputs:** Cream background with a subtle inner shadow, creating a "pressed into paper" feel.

### Cards & Layers
- **Analysis Cards:** Use the Cream background with a faint "graph paper" or "grain" texture overlay.
- **Collage Headers:** Headers for sections should include a small "blob" or "texture" element that overlaps the card boundary.

### Status & Feedback
- **Vulnerability Chips:** Use organic, slightly irregular pill shapes instead of perfect geometric ones. 
- **AI Synthesis Panel:** Distinguished by a subtle gradient border using the Teal to Azure spectrum, suggesting "active processing."

### Lists & Tables
- **Tree Views (APK Structure):** Use thin, hand-drawn style connecting lines rather than rigid 90-degree system lines to reinforce the "human" aesthetic.