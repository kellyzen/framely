# Framely

Your own Photoism-style photo booth, in a link.

Design a frame and add "star" cutouts (the bride, an idol, anyone). Then share one link, and guests can take photo strips, GIFs and boomerangs on their phone, tablet or laptop.

## Features

- **Layouts:** 1, 2, 3, 4 or 6 shots, as a strip or a grid, in landscape, square or portrait.
- **Star cutouts (optional):** upload 0–6 photos and place a different one in each shot. You can:
  - remove the background automatically (runs in the browser, nothing is uploaded for this)
  - cut it out yourself with a lasso, eraser and restore brush
  - drag, pinch, resize, rotate and flip each cutout in each shot
- **Frames:** quick themes, solid colours, gradients, patterns (dots, stripes, gingham, hearts, sparkles, confetti) and a film style. Border thickness and photo corners are adjustable.
- **Decorations:** emoji stickers, text stickers and image stickers, all draggable, resizable and rotatable.
- **Text:** optional title and description, with six fonts, any colour, at the top or bottom.
- **Booth:** live camera with filters (Bright, Soft glow, Vintage, Retro, B&W, Noir, Warm, Blush, Faded), a 3/5/10 s countdown, and front/back camera.
- **Results:**
  - a photo strip (JPG)
  - an automatic GIF of the shots
  - a boomerang GIF
  - saving through the phone's share sheet or as a download
- **Sharing:** a guest link with a QR code, plus a private edit link. No accounts needed.
- **Privacy:** guest photos are made on the guest's device and are never uploaded.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Designing and **Try it** work without any setup. **Save & share** needs storage (see below).

> The camera only works on `https://` or `localhost`. To test on your phone, use the deployed Vercel URL.

## Deploy on Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo. The default settings are fine.
3. In the Vercel project, go to **Storage → Create → Blob**. Create a store and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN` automatically.
4. Redeploy (**Deployments → ⋯ → Redeploy**).

After that, every push to `main` deploys automatically.

To use storage locally, run `vercel link` and then `vercel env pull .env.local`.

## How it works

- Next.js (App Router) and TypeScript. All image work (cutouts, filters, frames, GIFs) happens on canvas in the browser.
- Booth designs are saved as JSON in Vercel Blob (`booths/<id>.json`). Uploaded star photos and stickers are stored as PNGs.
- Each booth has a secret edit key. Only a hash of it is stored. The key lives in the URL `#fragment` of the edit link, so it never reaches the server logs.
- Background removal uses [`@imgly/background-removal`](https://github.com/imgly/background-removal-js). Its model (about 80 MB) downloads the first time it's used, then it's cached.
- GIFs are encoded with [`gifenc`](https://github.com/mattdesl/gifenc).

## License

[AGPL-3.0](./LICENSE). The background-removal library is AGPL-licensed, so this project is too.
