const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const www = path.join(root, "www");

["index.html", "app.js", "styles.css"].forEach(f => {
  const src = path.join(root, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(www, f));
});

const dataSrc = path.join(root, "data");
const dataDst = path.join(www, "data");
if (fs.existsSync(dataSrc)) {
  if (!fs.existsSync(dataDst)) fs.mkdirSync(dataDst, { recursive: true });
  fs.readdirSync(dataSrc).forEach(f =>
    fs.copyFileSync(path.join(dataSrc, f), path.join(dataDst, f))
  );
}

console.log("www/ synced from root files.");
