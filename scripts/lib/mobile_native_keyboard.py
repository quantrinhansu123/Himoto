"""Keyboard visibility across Android Insets and older Android IME dumps."""
import re


def own_autofill_popup(windows,package):
    return bool(re.search(r'mCurrentFocus=Window\{[^\n}]*\su\d+ Autofill UI\}',windows) and
        re.search(r'mFocusedApp=[^\n]*\b'+re.escape(package)+r'/',windows))


def keyboard_visible(displays, legacy=None):
    states=re.findall(r"type=ime[^\n]*\bvisible=(true|false)",displays)
    if states:
        return "true" in states
    # Android 9 does not expose the Android 11+ Insets source list. Only use
    # explicit IME visibility; an input target/show request does not prove that
    # Back will close a keyboard rather than navigate out of the app.
    states=re.findall(r"\bmInputShown=(true|false)\b",legacy or "")
    if not states:
        raise ValueError("Cannot determine keyboard visibility from the selected device")
    if len(set(states))!=1:
        raise ValueError("Conflicting legacy keyboard visibility")
    # Third-party IMEs on Samsung Android 9 can keep their actual input view
    # visible while InputMethodManager's mInputShown is already false. Require
    # both explicit service/window signals before treating that as visible.
    visible=re.findall(r'\bmWindowVisible=(true|false)\b',legacy or '')
    view=re.findall(r'\bmIsInputViewShown=(true|false)\b',legacy or '')
    return states[0]=="true" or visible==['true'] and view==['true']
