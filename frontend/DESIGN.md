# AgentSpace UI — design notes

**Thesis:** a quiet operations console. Hairline-framed dark glass, neutral white, and colour reserved for state
(working / available / idle / paused). One authored moment: the Greek pantheon drawn in ordered-dither dots behind the console (inspired by maritime.sh's dot-matrix imagery).

## Decisions
- Product name is **AgentSpace**; agents keep their names and Lucide icons (Crown, BookOpen, Feather, Hammer).
- Neutral white is the only "accent". Status dots carry colour; buttons, focus and active states are white-on-black (inverted in light).
- Mono type is for data only (counts, times, status), never decorative system IDs.
- Surfaces: `.glass` panels only at the top level. Rows inside a panel use hairlines, not nested cards.
- Dialogs and the agent sheet use the base-ui Dialog (focus trap, Escape, aria). Tailwind is not loaded; styles are plain CSS.
- Dark is default; light via the nav toggle, persisted under `agentspace:theme`. The dot field works in both themes and is drawn still under reduced motion.

## Files
- `src/css/tokens.css` colour, type, radius, motion tokens (dark + light)
- `src/css/base.css` reset, focus, utility
- `src/css/ui.css` glass, buttons, inputs, tags, status, dialogs, toast
- `src/css/hub.css` shell, nav pill, console screen
- `src/css/research.css` Research workspace and dialogs
- `src/components/shell/` nav pill, atmosphere canvas
- `src/components/hub/` agent/directive/activity parts, agent sheet, command dialog

## References studied (live, reviewed in the built-in browser)
Linear (product UI as evidence, hairline borders), Resend (single focal point), Railway (framed grid cells),
Raycast (one authored visual moment), Supabase (modular bordered panels, one accent for the primary action).
Principles were extracted; no layouts, copy or assets were copied. Screenshots were reviewed, not archived.

## Motion and feel (Apple fluid-interface principles, translated to the web)
- **Springs, not durations** (`src/lib/motion.ts`): default is critically damped (`bounce 0, 0.4s`); a little bounce (`0.2`) only after a gesture that carried momentum.
- **Agent sheet** (`src/hooks/useDragToDismiss.ts`): tracks the pointer 1:1 after a 10px hysteresis, can be grabbed mid-flight and reversed, rubber-bands past the edge, and decides dismiss vs return from the *projected* resting point (`project(velocity)`), handing release velocity to the spring. Stale velocity from a paused pointer is ignored.
- **Spatial consistency:** the sheet enters and exits on the right; the command dialog grows from the nav control that opened it; the nav indicator slides between Console and Research.
- **Feedback on pointer-down:** buttons, chips, rows and icon buttons scale on `:active` (80ms in, soft ease out).
- **Materials:** dialogs materialize (blur + scale + fade); content scrolls softly under the nav through a blur edge, not a hard bar.
- **Accessibility:** `prefers-reduced-motion` cross-fades (Motion `reducedMotion="user"`, no travel or scale in CSS); `prefers-reduced-transparency` makes surfaces solid; `prefers-contrast: more` raises borders and text contrast.
- **Type:** text sizes are `rem` so they follow the browser's text-size setting; tight tracking on large headings, near zero on body.
- Kept Geist as the brand face rather than the system font.

## Dot Pantheon (console background)
- `src/lib/dotShapes.ts` greyscale shapes: temple, Zeus (bolt), Athena (owl), Hermes (caduceus), Hephaestus (anvil and hammer), trireme.
- `src/lib/dotField.ts` engine: one fixed canvas draws every `[data-god]` element as ordered-dither dots. Shapes assemble from scattered dots as they near the middle of the viewport and disperse as they leave, drift against the scroll, and dots near the pointer brighten and shift. `data-god="sea"` draws wave rows with a trireme that sails as you scroll past; `data-god="text"` renders `data-text` in dots.
- `src/components/shell/DotField.tsx` mounts it only on the console route. The canvas and anchors are `aria-hidden`; all content stays real HTML.
- Reduced motion: shapes are drawn assembled and still and only redraw on scroll, resize and pointer events. Dots use finer gaps below 700px.
- To add a god or shape: add a draw function in `dotShapes.ts`, then place an element with `data-god="<name>"`.
