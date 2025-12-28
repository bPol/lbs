import { expect, test } from '@playwright/test'
import { copy, SUPPORTED_LANGS, type Lang } from '../src/i18n/copy'
import { assertNoHorizontalOverflow, attachFullPageScreenshot } from './helpers/ui'

const languages: Lang[] = [...SUPPORTED_LANGS]
const englishHomeSnippets = [copy.en.home_h1, copy.en.hero_paragraph]
const englishRegisterSnippets = [copy.en.register_page_title, copy.en.register_heading]

test.describe('language coverage', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  for (const lang of languages) {
    test(`home page renders ${lang} copy`, async ({ page }, testInfo) => {
      await page.goto(`/${lang}`)
      await expect(
        page.getByRole('heading', { name: copy[lang].home_h1 })
      ).toBeVisible()

      if (lang !== 'en') {
        for (const snippet of englishHomeSnippets) {
          await expect(page.getByText(snippet, { exact: true })).toHaveCount(0)
        }
      }

      await assertNoHorizontalOverflow(page)
      await attachFullPageScreenshot(page, testInfo, `home-${lang}`)
    })

    test(`register page renders ${lang} copy`, async ({ page }, testInfo) => {
      await page.goto(`/${lang}/register`)
      await expect(
        page.getByRole('heading', { name: copy[lang].register_page_title })
      ).toBeVisible()

      if (lang !== 'en') {
        for (const snippet of englishRegisterSnippets) {
          await expect(page.getByText(snippet, { exact: true })).toHaveCount(0)
        }
      }

      await assertNoHorizontalOverflow(page)
      await attachFullPageScreenshot(page, testInfo, `register-${lang}`)
    })
  }
})
