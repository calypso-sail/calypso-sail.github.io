# Restoring Team and News

Team and News can be enabled independently in [`src/content.ts`](src/content.ts). Each switch restores the relevant homepage section and its desktop, mobile and footer links. News also restores the `/news/` archive.

## Team

1. Replace the example profiles in `team.members`, `team.supervisors` and `team.alumni`. Each profile needs a `name`, a short `bio` and a two-digit `index`.
2. Add portraits under `public/team/` and set each profile’s `photos` to the corresponding paths, such as `['/team/jane-01.jpg']`. Omit `photos` to show the portrait placeholder. A profile can also have an optional `link`.
3. Set `SHOW_TEAM_PROFILES` to `true`.

## News

1. Replace the example items in the `news` array. List the newest item first. Each item needs a `date` in ISO format, a `title`, a `summary` and an `href` that takes readers to the story.
2. For a thumbnail, set `image` to its path under `public/` and add descriptive `imageAlt` text. The first item is featured on the homepage, followed by up to two more. The archive lists every item.
3. Set `SHOW_NEWS` to `true`.

## Preview and publish

1. Run `npm ci`, then `npm run dev`. Open `http://127.0.0.1:5173/` and check the enabled sections and navigation at desktop and mobile widths. Check that profile photos, gallery controls and article links work. When enabling News, also open `/news/` directly.
2. Run `npm run build`, then commit and push the edits to `main`. The [Deploy GitHub Pages workflow](.github/workflows/deploy-pages.yml) builds and publishes the site.
3. Once the deployment succeeds, open the [live site](https://calypso-sail.github.io/) and check the enabled sections and links again.

To hide either section again, set its switch to `false` and redeploy. The entries stay in `src/content.ts`. While News is hidden, `/news/` redirects to the homepage.
