# Public static assets only

This directory is part of the web application's public output. **Never place
bank exports, card statements, financial baselines, backups, or any other
personal financial data here.** Anything beneath `public/` is copied into a
production build and could be served if the app is ever hosted.

The dashboard stores live records in this browser's IndexedDB database. Legacy
local helper data belongs under `~/.personal-cfo/`, outside the repository
and outside the web application's build output.
