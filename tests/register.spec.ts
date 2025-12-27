import { expect, test } from '@playwright/test'

test('register form enables submit when required fields are set', async ({ page }) => {
  await page.goto('/en/register')

  const createButton = page.getByRole('button', { name: 'Create account' })
  await expect(createButton).toBeVisible()
  await expect(createButton).toBeDisabled()

  await page.getByLabel('Display name').fill('TestUser')
  await page.getByLabel('Email').fill('test@example.com')
  await page.getByLabel('Password').fill('password123')
  await page.getByLabel('Confirm password').fill('password123')
  await page.getByLabel('Birth date').fill('1990-01-01')

  await page.getByLabel(/I confirm I am 18\+/).check()
  await page.getByLabel(/I have read and agree to the/i).check()

  await expect(createButton).toBeEnabled()
})
