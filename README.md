# RigorUP Readers (v2)

One app, one site, many books. Each story is a folder of data. The app code does not change when a book is added.

## Folder map
- `index.html`: the page that loads the app
- `js/`: the app (`app.js` screens, `store.js` saved progress, `engine.js` Lit Bucks rules, `reports.js` learning report and CSV, `recordings.js` voice recordings, `readingstrip.js` reading strip)
- `css/style.css`: the shared look for every book
- `fonts/`: Lexend and Fredoka, stored here so the app makes no outside requests
- `data/library.json`: the bookshelf (which stories exist and their reading levels)
- `data/creatures.json`: the shared FakeDex (every book uses the same creatures)
- `books/<BookID>/book.json`: one book version (pages, questions, answers, hints)
- `books/<BookID>/pages/`: that book's page pictures (`page-01.webp`, `page-02.webp`, ...)
- `books/<BookID>/cover.webp` and optional printable PDFs (listed in the library entry under `printables`)
- `assets/creatures/`: one picture per creature (`agnite.png`, ...)
- `tools/check-book.mjs`: the quality check for a book

## Add a new book (checklist)
1. Make the folder `books/<BookID>/pages/` (example: `books/B002-K/pages/`).
2. Write `books/<BookID>/book.json` (copy `B001-K` as the pattern).
3. Put the page pictures in `books/<BookID>/pages/`.
4. Add the story to `data/library.json` (with page and question counts).
5. Add any new creatures to `data/creatures.json` and their pictures to `assets/creatures/`. Every creature needs a credit and a license line.
6. Run the check: `node tools/check-book.mjs <BookID>`
7. Fix every FAIL. Read every WARN.

## Add a higher reading level for an existing story
Copy the book folder to a new ID (example: `B001-G3`), rewrite the page text and adjust questions, then add it to the same story's `versions` list in `data/library.json`. The story card then shows a level switch.

## Features in the app today
Bookshelf, reader, reading and math questions (two tries, Lit Bucks), FakeDex, badges, multiple readers, grown-up area (PIN, settings, answer key, learning report with print and CSV, voice recording review, backup and restore), reading strip, voice recording (2 takes per page or question), light and dark display, three text sizes.
Voice recordings stay in the browser on that device. They are not part of the progress backup.

## Publish on GitHub Pages
Put every file in this folder at the top of a GitHub repository (not inside another folder). Then in the repo: Settings > Pages > Deploy from a branch > main > / (root) > Save. The file `.nojekyll` is already here. All paths in the app are relative, so it works at `https://<username>.github.io/<repo>/`.

## Preview on a computer
The app needs a web server (opening `index.html` by double-click will not work).
In this folder run: `python3 -m http.server 8000`, then open http://localhost:8000
