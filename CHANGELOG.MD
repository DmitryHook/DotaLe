# Changelog

## [0.5] - 2026-05-06

### Added
- **Difficulty System:** Introduced new gameplay modifiers to increase the challenge:
  - **Grayscale Filter:** Added a black-and-white visual mode for hero and ability images.
  - **Hidden Names:** Option to hide names within quotes or abilities for increased difficulty.
  - **Loading Screen Puzzle:** Implemented a mechanism that divides and shuffles the target image into a puzzle.
  - **Ability Icon Rotation:** Added support for 90-degree incremental rotation (90°/180°/270°) for ability icons.
- **Safety Confirmation:** Added a confirmation prompt for the "Reset" action to prevent accidental data loss.
- **Statistics Tracking:** Now tracking detailed game stats, including win counts and total attempts.

### Fixed
- **Modal Windows:** Fixed a bug that caused an empty modal window to appear.
- **Search Bar:** Resolved an issue where search results would not reappear after collapsing and expanding the search bar.

### Changed
- **UI Icons:** Migrated from emoji-based icons to [Lucide](https://lucide.dev/) SVG vectors for improved visual consistency and scaling.