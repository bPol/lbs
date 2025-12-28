import { expect, test } from '@playwright/test'
import { copy } from '../src/i18n/copy'
import {
  assertNoHorizontalOverflow,
  attachFullPageScreenshot,
  slugifyLabel,
} from './helpers/ui'

test.describe('public flows', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('clubs list to club detail', async ({ page }, testInfo) => {
    await page.goto('/en/clubs')
    await expect(
      page.getByRole('heading', { name: copy.en.clubs_page_title })
    ).toBeVisible()
    await assertNoHorizontalOverflow(page)

    const firstClub = page.locator('.club-grid .data-card h5 a').first()
    await expect(firstClub).toBeVisible()
    const clubName = (await firstClub.textContent())?.trim() || 'club'
    await firstClub.click()

    await expect(page).toHaveURL(/\/en\/clubs\//)
    await expect(
      page.getByRole('heading', { name: clubName, exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: copy.en.reviews_title })
    ).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await attachFullPageScreenshot(
      page,
      testInfo,
      `club-detail-${slugifyLabel(clubName)}`
    )
  })

  test('events list to event detail', async ({ page }, testInfo) => {
    await page.goto('/en/events')
    await expect(
      page.getByRole('heading', { name: copy.en.events_page_title })
    ).toBeVisible()
    await assertNoHorizontalOverflow(page)

    const firstEvent = page.locator('.club-grid .data-card h5 a').first()
    await expect(firstEvent).toBeVisible()
    const eventName = (await firstEvent.textContent())?.trim() || 'event'
    await firstEvent.click()

    await expect(page).toHaveURL(/\/en\/events\//)
    await expect(
      page.getByRole('heading', { name: eventName, exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: copy.en.event_rsvp_title })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: copy.en.event_privacy_label })
    ).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await attachFullPageScreenshot(
      page,
      testInfo,
      `event-detail-${slugifyLabel(eventName)}`
    )
  })

  test('blog list to post detail', async ({ page }, testInfo) => {
    await page.goto('/en/blog')
    await expect(
      page.getByRole('heading', { name: copy.en.blog_title })
    ).toBeVisible()
    await assertNoHorizontalOverflow(page)

    const firstPost = page.locator('.blog-grid .post').first()
    await expect(firstPost).toBeVisible()
    const postTitle = (await firstPost.locator('h4').textContent())?.trim()
    await firstPost.click()

    await expect(page).toHaveURL(/\/en\/blog\//)
    if (postTitle) {
      await expect(
        page.getByRole('heading', { name: postTitle, exact: true })
      ).toBeVisible()
    }
    await expect(page.locator('.post-body')).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await attachFullPageScreenshot(
      page,
      testInfo,
      `blog-detail-${slugifyLabel(postTitle || 'post')}`
    )
  })
})
