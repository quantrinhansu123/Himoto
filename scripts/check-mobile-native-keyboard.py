"""Offline parsing checks only; never reads an actual keyboard/input buffer."""
from lib.mobile_native_keyboard import keyboard_visible,own_autofill_popup

assert keyboard_visible('source type=ime frame=[0,0][720,1600] visible=true') is True
assert keyboard_visible('source type=ime visible=false','mInputShown=true') is False
assert keyboard_visible('type=statusBars visible=true\ntype=ime visible=false') is False
assert keyboard_visible('older window dump','mShowRequested=true mInputShown=false') is False
assert keyboard_visible('older window dump','mInputShown=true mShowRequested=false') is True
assert keyboard_visible('older window dump','mInputShown=false mWindowVisible=true mIsInputViewShown=true') is True
assert keyboard_visible('older window dump','mInputShown=false mWindowVisible=false mIsInputViewShown=true') is False
assert keyboard_visible('older window dump','mInputShown=false mWindowVisible=true mIsInputViewShown=false') is False
for displays,legacy in [('',None),('','mShowRequested=true'),('','mInputShown=true mInputShown=false')]:
    try:
        keyboard_visible(displays,legacy)
        raise AssertionError('Ambiguous visibility must fail closed')
    except ValueError:
        pass
assert own_autofill_popup('mCurrentFocus=Window{123 u0 Autofill UI}\nmFocusedApp=AppWindowToken{456 ActivityRecord{789 u0 vn.himoto.staff/.MainActivity}}','vn.himoto.staff')
for windows in ['mCurrentFocus=Window{123 u0 Autofill UI}\nmFocusedApp=AppWindowToken{u0 unrelated.app/Main}',
    'mCurrentFocus=Window{123 u0 Samsung Pass}\nmFocusedApp=ActivityRecord{u0 vn.himoto.staff/.MainActivity}',
    'mCurrentFocus=Window{123 u0 Autofill UI}\nmFocusedApp=ActivityRecord{u0 vn.himoto.staff.helper/.MainActivity}']:
    assert not own_autofill_popup(windows,'vn.himoto.staff')
print('PASS: 4 Android keyboard groups (Insets, legacy IME, fail-closed ambiguity and exact Himoto Autofill popup scope)')
