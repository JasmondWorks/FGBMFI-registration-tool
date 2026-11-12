# Badge Desk: FGBMFI registration printing

Prints FGBMFI convention badges 4 per A4 sheet onto the **pre-printed card stock**, tracks what printed, and keeps an audit trail.

## Setup on the desk laptop

Requires Node.js 20+.

```bash
npm install
cp .env.example .env        # then paste your DATABASE_URL and CLOUDINARY_URL
npm run db:migrate          # creates the tables (works on Neon)
npm run build
npm start                   # open http://localhost:3000
```

For development: `npm run dev`. Tests: `npm test`. To generate fake badges for practice: `npm run badges:test`.

## How it works

1. **Drop any number of badge PDFs** on the Print desk (or click "Choose badge files").
2. Each badge is read from its **PDF text** (strong): titles, name, district, chapter and registration ID. The **filename** (weak) is a cross-check. Names are stored in one clean form (`IBEKWE_ETHEL` becomes `Ibekwe Ethel`).
3. **Duplicates** are flagged, strongest first: exact same file → same registration ID (with newer/older version) → same name and chapter → same name. You compare old and new side by side and leave out, replace, or keep.
4. Badges go **4 per sheet in upload order**. If the total isn't a multiple of 4, you choose: hold extras in the **waiting tray** (they go first next time), add more files, fill from the tray, remove some, or print a part-filled sheet (logged).
5. The **preview** shows every sheet true to scale over the card template. Click **Print all ready** or **Print this sheet**.
6. After printing you're asked **"Did these print correctly?"**. Only ticked badges are marked printed. Failed ones can go straight to a reprint.

## Printing on the pre-printed cards

- The platform's A6 badge PDF is a transparent overlay (name, details, QR) made for these cards. Each badge is placed at **actual size** in its quarter of the A4 sheet. The card artwork is never printed, only previewed.
- **Browser mode:** in the print dialog choose **A4** and **Actual size / 100%**. Never "Fit to page".
- **Direct mode (Settings, recommended):** sends each sheet straight to the chosen printer and reads the printer queue (Windows spooler or CUPS), so every sheet gets a printer job number in the audit log.
- **Calibration:** Settings → turn on "Print the card artwork too", print the calibration sheet on plain paper, hold it against a card sheet, and nudge X/Y in mm. Turn the artwork off again before printing real cards.

## Is a badge really printed?

The browser can't know what came out of the printer. The app records: **sent** (print started) → **spooled** (printer queue finished the job, direct mode) → **confirmed** (operator ticked it). Only confirmed badges count as printed.

## Statuses for auditors

| Badge status   | Meaning                                    |
| -------------- | ------------------------------------------ |
| Not printed    | Uploaded, not on a sheet yet               |
| Waiting tray   | Held back to complete a later sheet        |
| On a sheet     | Laid out, not printed                      |
| Awaiting check | Sent to the printer, operator hasn't confirmed |
| Printed        | Confirmed printed (times printed shown)    |
| Replaced       | A newer badge for the same person was used |
| Removed        | Left out by the operator                   |

Every action (upload, duplicate decisions, print, confirm, reprint with reason, edits, views) is stored in `audit_events` with the operator's name and time. Records → Export CSV gives the filtered list.

## Storage

Badge files are kept on the laptop under `./storage` (printing always uses these, so it works offline) and backed up to Cloudinary in the background. Note: Cloudinary free plans block *delivering* PDFs by default. Uploads still work as a backup. Enable "Allow delivery of PDF and ZIP files" in Cloudinary settings if you want to open them from there.

## Stack

Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui components, Drizzle ORM + PostgreSQL (Neon), pdf.js (reading and previews), pdf-lib (sheet PDFs), Cloudinary.
