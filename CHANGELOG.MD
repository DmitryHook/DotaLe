# Changelog

## [0.6] - 2026-05-20

### Added
- **About Page** Introduced a dedicated section explaining the game rules, hint mechanics, and project background.
- **Statistics Page** Added a personal stats dashboard. Players can now track their games.

### Fixed
- **Duplicate Hero Selection** Resolved an issue where players could select and submit the exact same hero.

### Changed
- **Template Optimization** Extracted shared layout structures and redundant data into a base HTML template

## [0.5] - 2026-05-06

### Added
- **Difficulty System:** Introduced new gameplay modifiers to increase the challenge:
  - **Grayscale Filter:** Added a black-and-white visual mode for hero and ability images.
  - **Hidden Names:** Option to hide names within quotes or abilities for increased difficulty.
  - **Loading Screen Puzzle:** Implemented a mechanism that divides and shuffles the target image into a puzzle.
  - **Ability Icon Rotation:** Added support for 90-degree incremental rotation (90°/180°/270°) for ability icons.
- **Safety Confirmation:** Added a confirmation prompt for the "Reset" action to prevent accidental data loss.

### Fixed
- **Modal Windows:** Fixed a bug that caused an empty modal window to appear.
- **Search Bar:** Resolved an issue where search results would not reappear after collapsing and expanding the search bar.

### Changed
- **UI Icons:** Migrated from emoji-based icons to [Lucide](https://lucide.dev/) SVG vectors for improved visual consistency and scaling.