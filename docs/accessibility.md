# Accessibility (a11y) Guidelines

MindGem aims to be accessible to a wide audience. However, due to the nature of cognitive training games (which often require rapid spatial clicking or precise mouse/touch interactions), fully accessible gameplay is challenging. 

## Application Level
- **Keyboard Navigation:** The main dashboard, authentication screens, navigation menus, and leaderboard must be fully navigable via keyboard (`Tab`, `Enter`, `Space`, `Escape`).
- **Focus Rings:** Interactive elements must have a visible `focus-visible` ring. We use standard browser focus rings or tailwind `ring-2` where applicable.
- **Color Contrast:** Text and background colors must adhere to WCAG AA contrast standards (minimum 4.5:1 for normal text).
- **ARIA Labels:** Icons and icon-buttons must have descriptive `aria-label`s.

## Game Level
While the shell and menus are accessible, individual mini-games may require high visual acuity and rapid motor skills.
- Games that heavily rely on color (e.g., Stroop test) should provide high-contrast modes or alternative indicators if feasible.
- We do not currently enforce strict keyboard playability for click-heavy games (like Schulte or Spatial Search) due to the nature of the cognitive metrics being measured (reaction time via physical pointing device).

## Future Improvements
- Screen reader support for reading out post-game stats and cognitive index reports.
- Pausing mechanisms that don't penalize reaction time if a user needs to utilize an assistive device to reposition.
