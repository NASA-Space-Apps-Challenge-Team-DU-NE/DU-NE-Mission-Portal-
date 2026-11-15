# Project website (draft)

Static pages for Team DU:NE's Lunar Landing Site Navigator.

- `index.html` – home page
- `planning.html` – for people planning a landing: comparing sites and dates
- `teaching.html` – for learners and teachers: the study guide and classroom material
- `sources.html` – Sources & Checks: short previews of the two pages below
- `sources-list.html` – the sources the project uses
- `checks.html` – tests of the tool's numbers against outside sources
- `team.html` – team page
- `assets/css/style.css` – styles shared by every page
- `assets/images/` – put local copies of the photos here (same file names as in `index.html`). If a photo is missing, the page loads it from NASA's image library instead.

University logos are in `assets/images/logos/`.

## Search

The search box uses `assets/js/search-index.js`, a copy of the text of every page. After changing page text, run `python3 tools/build_search_index.py` from this folder so the search finds the new text.
