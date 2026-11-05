const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const directory = path.resolve(__dirname, "../mobile/assets");
async function run() {
  fs.mkdirSync(directory, { recursive: true });
  const logo = fs.readFileSync(
    path.resolve(__dirname, "../public/images/branding/logo-himoto-dark.svg"),
  );
  await sharp(logo).resize(1000).png().toFile(path.join(directory, "logo.png"));
  const mark = await sharp(logo).resize(800).png().toBuffer();
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: "#ffffff" },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toFile(path.join(directory, "icon.png"));

  // Android masks and animates a 108dp foreground. Keep the entire wordmark
  // inside its central 66dp safe zone, independently of the iOS/legacy icon.
  const foreground = await sharp(logo).resize(600).png().toBuffer();
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: "#00000000" },
  })
    .composite([{ input: foreground, gravity: "centre" }])
    .png()
    .toFile(path.join(directory, "adaptive-icon.png"));
}
run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
