const { chromium } = require('playwright'); const path = require('path')
;(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1200, height: 900 } })
  const f = n => 'file://' + path.resolve(n)
  for (const s of [1024, 512, 256, 128, 64, 48, 32, 16]) {
    await pg.setViewportSize({ width: s, height: s })
    await pg.setContent(`<body style="margin:0;background:transparent"><img src="${f('icon.svg')}" width=${s} height=${s}>`)
    await pg.waitForTimeout(150); await pg.screenshot({ path: `icon-${s}.png`, omitBackground: true })
  }
  await pg.setViewportSize({ width: 1024, height: 1024 })
  await pg.setContent(`<body style="margin:0"><img src="${f('mascot-holzi.svg')}" width=1024>`); await pg.waitForTimeout(150)
  await pg.screenshot({ path: 'mascot-holzi.png', omitBackground: true })
  await pg.setViewportSize({ width: 1200, height: 900 }); await pg.goto(f('palette.html')); await pg.waitForTimeout(300)
  await pg.screenshot({ path: 'brand-guide.png', fullPage: true })
  await pg.setViewportSize({ width: 900, height: 260 })
  await pg.setContent(`<body style="margin:0"><img src="${f('logo-horizontal.svg')}">`); await pg.waitForTimeout(200)
  await pg.screenshot({ path: 'logo-horizontal.png', omitBackground: true })
  await b.close()
})()
