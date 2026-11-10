# Blind Memo Lab

Blind Memo Lab is a separate offline trainer for letter-pair recall and blindfold cube memos. The Mac and iPhone/web versions use the same interface and training logic. New visitors start with empty memo choices and can enter or import their own.

## Your memo choices

Add choices in **Memos**, or import your own JSON or CSV file using the memo import controls. A downloadable JSON template contains every letter pair, flipped edge and corner twist with an empty value. Fill the entries you use; blank entries are ignored. At least one filled entry is required. Importing choices updates your local memos without replacing your existing review history.

JSON accepts a letter-pair map, a `memos` wrapper, or an array of rows. For example:

```json
{"memos":{"AB":"my own invented image","flip:UL":"my own flip image","twist:DBL:CW":"my own twist image"}}
```

CSV uses two columns, `pair,memo`, with an optional header. For orientation cases, use the IDs in the template. Quote text containing commas or line breaks, and double a quote inside quoted text. Files can be up to 2 MB, with each memo up to 4,000 characters. Unknown or duplicate cards reject the import without applying a partial file.

The supplied private collection is included only as encrypted data. Its owner can unlock it with the password for the current app session. The password and decryption key are never bundled or saved. A fresh launch or page reload requires the password again. Your saved custom choices take precedence over unlocked defaults.

The encrypted file uses AES-256-GCM and a password-derived key from PBKDF2-SHA-256 with 600,000 iterations and a random salt. Until the password is entered, the supplied words are unavailable. The original private workbook and unencrypted defaults are absent from both the website and its source package.

## Timed recall

Start a recall session. Think of a memo for the displayed letter pair or highlighted cube stickers, then press Space or tap the reveal button. The reaction time stops before the memo appears. Choose **Good**, **Wrong**, or **Change**. Good reduces that card's stored sampling weight. Wrong and Change increase it. Change also keeps the card in the list of memos to improve until you resolve it.

Each card has its own saved repetition record. Reaction speed affects the size of the successful adjustment and the spacing interval. Selection combines that record with the time elapsed since the card was last tested, so older cards return to practice. This is weighted spaced practice rather than a fixed daily queue.

Train corners, edges, both, or every letter pair. Recall practice includes choices you have entered, imported or unlocked. Double-letter choices are available for parity and single-letter targets. The memo library lets you search and edit your choices. A changed choice becomes due for practice while earlier answers retain the memo used at the time.

## Lettering and orientation

Hold the cube with white up and green front. Letters run clockwise around each face in the order white A–D, orange E–H, green I–L, red M–P, blue Q–T, yellow U–X. The corner buffer is UBL, traced from its white A sticker. The edge buffer is DF, traced from its yellow U sticker. Piece practice excludes stickers belonging to those buffers.

Corner loop breaks use P C L T H F N. Edge loop breaks use A C L J T R B D V X W. A highlighted face identifies the sticker to read on a disembodied piece. Flips and corner twists use a transparent cube frame to preserve the physical position. CW and CCW describe the direction to twist the corner **to solve it**.

The **Full memo** exercise displays the target pieces in trace order. Recall the sequence, stop the timer, and enter your letter sequence for verification. The piece rows disappear when the timer stops and return only after you check your answer. Spaces and pair separators may be omitted. A final unpaired target accepts either its single letter or the double-letter parity form. If the cube has in-place flips or twists, also enter the flipped piece names or the twisted piece names with their direction to solve. The flip or twist entry field appears only when the generated memo has those orientation fixes. The exercise records both your time and whether the entered sequence matches the trace.

Letter sequences describe physical targets in your lettering system. Old Pochmann and M2 execution are separate from this recall exercise. Your parity algorithm is D′ L2 D M2 D′ L2 D.

## Mac

Open `dist/Blind Memo Lab.app`, or copy it to Applications. The Mac build requires macOS 13 or later and runs without a server or internet connection. It has a local ad hoc signature.

Native data is stored separately from Corner Lab, in `~/Library/Application Support/Blind Memo Lab/data.json`. Saves are atomic and preserve the previous file as `data.previous.json`. Use full backups to protect your history or transfer it to another device.

Custom choices and completed review history are local user data. A review records the memo you saw, including an unlocked default when used. Full backups can therefore contain readable memo words. Unused unlocked defaults and the password are not copied into a backup. These personal backups and saved histories are never included in a published app build.

## iPhone and web

`dist/blind-web` is a standalone static website configured for `blind.orger.org`.
Hosting, the custom domain setting and DNS must be set up before that address is
live; a build does not publish the app. See [deployment instructions](BLIND-MEMO-DEPLOY.md).
Host that directory over HTTPS. Open it in Safari, choose **Share → Add to Home Screen**, then open the installed app while online to cache it for offline use. Each device keeps its own data; transfer it with full backups. Browser data can be removed by clearing site storage.

Keep the web release in its own directory. The build includes public app assets, the encrypted default file, licensing files and guides. The private workbook, PDFs, personal backups, saved histories and temporary test data are excluded.

## Development

Run `npm test` for automated coverage. `npm run build:blind:mac` produces the Mac app and matching web output together. `npm run build:blind:web` rebuilds only the static website. `npm run test:blind:native` exercises actual WebKit and native persistence against disposable test data in `.build/`.
