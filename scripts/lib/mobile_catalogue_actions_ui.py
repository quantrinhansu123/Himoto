"""Open secondary catalogue navigation through its visible disclosure."""
from playwright.sync_api import expect


def catalogue_action(page, label):
    action = page.get_by_role('button', name=label, exact=True)
    if action.count() == 0:
        more = page.get_by_role('button', name='Thao tác khác', exact=True)
        expect(more).to_have_attribute('aria-expanded', 'false')
        more.click()
    expect(action).to_be_visible()
    return action
