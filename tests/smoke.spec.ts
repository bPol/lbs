import { expect, test } from '@playwright/test'

test('navigate from map to city and club detail', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/en$/)

  await expect(
    page.getByRole('heading', { name: 'Europe club map' })
  ).toBeVisible()

  await page.locator('#map').scrollIntoViewIfNeeded()
  const pin = page.locator('.osm-map .leaflet-interactive').first()
  await expect(pin).toBeVisible()
  await pin.click({ force: true })
  await expect(page).toHaveURL(/\/en\/cities\//)

  await expect(page.locator('main')).toBeVisible()
})

test('homepage blog card navigates to the post page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/en$/)

  await page.locator('#blog').scrollIntoViewIfNeeded()
  const blogCard = page.locator('#blog .blog-grid .post').first()
  await expect(blogCard).toBeVisible()
  await blogCard.click()

  await expect(page).toHaveURL(/\/en\/blog\//)
  await expect(page.locator('main')).toBeVisible()
})
