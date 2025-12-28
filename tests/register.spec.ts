import { expect, test } from '@playwright/test'

test('register form enables submit when required fields are set', async ({ page }) => {
  await page.goto('/en/register')

  const registerForm = page.locator('form.register-grid')
  const createButton = registerForm.getByRole('button', {
    name: 'Create account',
    exact: true,
  })
  await expect(createButton).toBeVisible()
  await expect(createButton).toBeDisabled()

  await registerForm.getByLabel('Display name').fill('TestUser')
  await registerForm.getByLabel('Email').fill('test@example.com')
  await registerForm.getByLabel('Password', { exact: true }).fill('password123')
  await registerForm
    .getByLabel('Confirm password', { exact: true })
    .fill('password123')
  await registerForm.getByLabel('Birth date').fill('1990-01-01')

  await registerForm.getByLabel(/I confirm I am 18\+/).check()
  await registerForm.getByLabel(/I have read and agree to the/i).check()

  await expect(createButton).toBeEnabled()
})
