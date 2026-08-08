const fs = require('fs');
const b64 = fs.readFileSync('browser.jpg').toString('base64');
fs.mkdirSync('src/midnightcordplugins/privateBrowser/components', {recursive: true});
fs.writeFileSync('src/midnightcordplugins/privateBrowser/icon.ts', 'export const browserBase64 = "' + b64 + '";');
