import { expect, type Page, type TestInfo } from '@playwright/test'

const assertNoHorizontalOverflow = async (page: Page) => {
  const sizes = await page.evaluate(() => ({
    docClient: document.documentElement.clientWidth,
    docScroll: document.documentElement.scrollWidth,
    bodyClient: document.body.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }))

  expect(sizes.docScroll).toBeLessThanOrEqual(sizes.docClient + 1)
  expect(sizes.bodyScroll).toBeLessThanOrEqual(sizes.bodyClient + 1)
}

const attachFullPageScreenshot = async (
  page: Page,
  testInfo: TestInfo,
  name: string
) => {
  const screenshot = await page.screenshot({ fullPage: true })
  await testInfo.attach(name, {
    body: screenshot,
    contentType: 'image/png',
  })
}

const slugifyLabel = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')

export { assertNoHorizontalOverflow, attachFullPageScreenshot, slugifyLabel }
