# Publish Blind Memo Lab

The intended address is **blind.orger.org**. Creating these release files does not publish the app or configure that address.

The built website includes a `CNAME` naming that address. GitHub Pages still needs the repository settings and DNS steps below; a `CNAME` file alone does not configure a custom-workflow deployment. [GitHub documents this distinction](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

## Release files

- `Blind-Memo-Lab-GitHub-Pages.zip`: standalone source, tests and a GitHub Pages workflow.
- `Blind-Memo-Lab-Web.zip`: the built website, ready for a static HTTPS host.
- `Blind Memo Lab.app`: the offline Mac app, built from the same interface.

The source archive contains only this trainer's assets, tests and build inputs. It includes the shared native shell needed to build the Mac app. The private workbook, PDFs, saved progress, personal backups and temporary test data are excluded. `app/blind/data.js` contains public card metadata with empty choices. `app/blind/default-memos.js` contains only the encrypted private defaults; neither their password nor a decryption key is included.

New visitors start empty and can enter their own choices, import JSON or CSV, or fill the empty template. The supplied defaults require their owner's password each session. They use AES-256-GCM with a PBKDF2-SHA-256 password-derived key, 600,000 iterations and a random salt. The published encrypted file cannot display the supplied words without that password.

## GitHub Pages

1. Create a separate GitHub repository named **blind-memo-lab** under **orger**, with **main** as its default branch. GitHub Free supports Pages from a public repository; private-repository Pages requires a supported paid plan. The private memo words remain encrypted in either case. [GitHub's availability and publishing-source guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) explains these options.
2. Extract **Blind-Memo-Lab-GitHub-Pages.zip** and upload its **contents** to the repository root. Upload the extracted files and folders, rather than the ZIP or an enclosing folder. Include the hidden **.github** folder: it contains the publishing workflow. On a Mac, press **Command–Shift–.** in Finder to show hidden files. The repository root should contain `package.json`, `app`, `scripts`, `tests`, and `.github`.
3. Open the repository's **Settings → Pages** and choose **GitHub Actions** as the publishing source. The supplied workflow runs the tests, builds the website, and deploys it. [GitHub's workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) documents this setup.
4. In the same **Pages** settings, save **blind.orger.org** as the **Custom domain**. Then, at the DNS provider for `orger.org`, add the record below. Save the custom domain in GitHub before creating the DNS record. For a repository owned by an account other than **orger**, use that owner's GitHub Pages hostname instead. The destination contains neither `https://` nor a repository path. [GitHub's custom-domain guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) specifies this order and destination.

   | Type | Name / Host | Destination / Value |
   | --- | --- | --- |
   | CNAME | `blind` | `orger.github.io` |

5. Open **Actions → Publish Blind Memo Lab → Run workflow**, select **main**, and run it. Once deployment succeeds and GitHub's domain and certificate checks complete, enable **Enforce HTTPS** under **Settings → Pages**. DNS changes and the HTTPS option can take up to 24 hours to become available. Check that [blind.orger.org](https://blind.orger.org) opens securely before installing it on the phone. [GitHub's custom-domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) describe these checks.
6. Open the address in **Safari on the iPhone**, choose **Share → Add to Home Screen**, enable **Open as Web App** if offered, and tap **Add**. Open the new icon while online and wait for **Ready offline**. The Home Screen steps follow [Apple's installation guide](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios). Enter your private-defaults password inside the app; it is not needed for GitHub or DNS setup.

The workflow uses the action versions documented by [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node). It requires no package installation: the app and its tests have no third-party runtime dependencies.

Publishing copies the existing encrypted default file. It never needs the password, decrypts that file, or reads the original workbook. Do not add personal backup files or local saved history to the repository.

Future pushes to `main` run the same workflow. The build assigns an offline cache version from the app's contents. An installed copy offers **Update** when a new version is ready.

## Build locally

Use Node.js 22 or later and Python 3. From the extracted source folder:

```sh
npm test
npm run build:blind:web
npm run package:blind
```

The web output is `dist/blind-web`; the two ZIP files are placed in `dist`. To preview locally, run `npm run dev` and open `http://127.0.0.1:8766`.

On a Mac with Apple's command line developer tools installed:

```sh
npm run build:blind:mac
npm run test:blind:native
```

The Mac build also creates the matching web output. Native testing opens a temporary app window and uses isolated test storage under `.build/`. The Mac app's local ad hoc signature is suitable for this local build; it is not an Apple-notarized public distribution.

The optional local sealing helper, `scripts/seal-blind-defaults.mjs`, requires the owner's original workbook and reads a new password privately at the terminal. Those inputs are not in the source archive and are not needed for ordinary builds. Native encryption tests use a separate invented fixture; it contains none of the supplied private words.

## Progress and device changes

Mac, phone and browser copies keep separate data. Export a full backup from **Settings** before switching devices or web addresses, then import it in the destination app. Custom choices and review snapshots can contain readable memo words in these local backups, including supplied words used in completed reviews. Passwords and unused session defaults are excluded. Publishing an update replaces app assets; it does not include or transfer personal choices, backups or saved history.
