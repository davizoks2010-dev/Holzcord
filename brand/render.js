const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs'); const f = n => 'file://' + path.resolve(n)
;(async () => {
  const b = await chromium.launch(); const pg = await b.newPage()
  for (const s of [1024, 512, 256, 128, 64, 48, 32, 16]) {
    await pg.setViewportSize({ width: s, height: s })
    await pg.setContent(`<body style="margin:0">${fs.readFileSync('icon.svg','utf8').replace('width="512" height="512"', `width="${s}" height="${s}"`)}`); await pg.waitForTimeout(100)
    await pg.screenshot({ path: `icon-${s}.png`, omitBackground: true })
  }
  await pg.setViewportSize({ width: 880, height: 260 })
  await pg.setContent(`<body style="margin:0;background:#0C100E">${fs.readFileSync('logo-horizontal.svg','utf8')}`); await pg.waitForTimeout(150)
  await pg.screenshot({ path: 'logo-horizontal.png' })
  await pg.setViewportSize({ width: 1200, height: 900 }); await pg.goto(f('palette.html')); await pg.waitForTimeout(500)
  await pg.screenshot({ path: 'brand-guide.png', fullPage: true }); await b.close()
})()
