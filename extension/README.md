# NextGen Apply — Chrome extension

Fills job application forms in **your own Chrome** from your NextGen Apply Manager profile.
It never clicks Submit: you review each form and submit it yourself.

Works on Greenhouse, Lever, Ashby, Workday, iCIMS, SmartRecruiters, Workable, Jobvite and BambooHR.

## Install (once)

```bash
cd extension
npm install
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose the `extension/dist` folder.
3. In the app, open **Apply Queue → Get pairing code**.
4. Click the NextGen Apply icon in Chrome's toolbar, enter the code and click **Connect**.

After changing the code, run `npm run build` again and click the reload icon on the extension card
in `chrome://extensions`. `npm run watch` rebuilds automatically.

## Daily use

1. The app builds your **Apply Queue** each morning (or click **Build queue now**).
2. Click **Start applying** (in the app or the extension popup). The first job's form opens.
3. The extension fills it: profile fields, resume, and the application questions
   (self-identification questions are always answered "decline"; work authorization and sponsorship
   come from your profile's screening answers; other questions are answered from your profile by AI).
4. The panel in the bottom-right corner shows every step and highlights anything it couldn't fill.
5. Review, fill the highlighted fields, and click the site's **Submit** button.
6. When the confirmation page appears the job is marked submitted (or click **I submitted it**),
   and the next job opens if "Open the next job after I submit" is on.

Progress for every job is visible in the app's Apply Queue page.

## Multi-page forms (Workday, iCIMS)

Sign in to the company's career site yourself. On each page, the extension fills what it can;
after you click **Next / Save and Continue** it fills the new page automatically.

## Troubleshooting

- **Panel says "Not connected"**: pair again from the Apply Queue page (codes expire after 10 minutes).
- **A field wasn't filled**: fill it yourself; the panel lists every required field left empty.
- **Details for a site**: in the extension's service worker console run
  `chrome.storage.local.set({ debug: true })`; the panel then lists each question, its options,
  the answer and whether it was applied.
