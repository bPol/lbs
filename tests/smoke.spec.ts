import { expect, test } from '@playwright/test'

test('navigate from map to city and club detail', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/en$/)

  await expect(
    page.getByRole('heading', { name: 'Europe club map' })
  ).toBeVisible()

  const pin = page.locator('.map-pin').first()
  await expect(pin).toBeVisible()
  await pin.click()
  await expect(page).toHaveURL(/\/en\/cities\//)

  const cityHeading = page.locator('main h3').first()
  await expect(cityHeading).toBeVisible()

  const clubLink = page.locator('.city-item a').first()
  await expect(clubLink).toBeVisible()
  const clubName = (await clubLink.textContent())?.trim() || ''
  await clubLink.click()
  await expect(page).toHaveURL(/\/en\/clubs\//)

  await expect(page.getByRole('heading', { name: clubName })).toBeVisible()
})
