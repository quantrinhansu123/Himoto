const { withMainActivity } = require('expo/config-plugins');

// RN 0.88's visible-password setter can omit TYPE_CLASS_TEXT (observed 0x80090).
// Correct only our visible account field, before IME input; never touch its text,
// keyboard settings, autofill hints, or the actual secure password field.
const begin = '// @generated begin himoto-literal-account-input';
const end = '// @generated end himoto-literal-account-input';
function addLiteralAccountInput(contents, language) {
  if (language !== 'kt') throw new Error('Himoto account input requires the Kotlin MainActivity template');
  const anchor = /super\.onCreate\(null\)/g;
  if ((contents.match(anchor) || []).length !== 1) throw new Error('Review MainActivity.onCreate before applying the account IME fix');
  const block = `${begin}
    window.decorView.viewTreeObserver.addOnGlobalFocusChangeListener { _, view ->
      val account = view as? android.widget.EditText
      if (account?.getTag(com.facebook.react.R.id.view_tag_native_id) == "himoto-account-input") {
        val current = account.inputType
        val variation = current and android.text.InputType.TYPE_MASK_VARIATION
        val inputClass = current and android.text.InputType.TYPE_MASK_CLASS
        if (variation == android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD && inputClass == 0) {
          val start = account.selectionStart
          val end = account.selectionEnd
          account.inputType = current or android.text.InputType.TYPE_CLASS_TEXT
          if (start >= 0 && end >= 0) account.setSelection(start.coerceAtMost(account.length()), end.coerceAtMost(account.length()))
          (getSystemService(INPUT_METHOD_SERVICE) as? android.view.inputmethod.InputMethodManager)?.restartInput(account)
        }
      }
    }
    ${end}`;
  if (contents.includes(begin) || contents.includes(end)) {
    const previous = /\/\/ @generated begin himoto-literal-account-input[\s\S]*?\/\/ @generated end himoto-literal-account-input/g;
    if ((contents.match(previous) || []).length !== 1 || contents.split(begin).length !== 2 || contents.split(end).length !== 2)
      throw new Error('Review incomplete or duplicated account input block');
    return contents.replace(previous, () => block);
  }
  return contents.replace(anchor, () => 'super.onCreate(null)\n    ' + block);
}
module.exports = config => withMainActivity(config, mod => {
  mod.modResults.contents = addLiteralAccountInput(mod.modResults.contents, mod.modResults.language);
  return mod;
});
module.exports.addLiteralAccountInput = addLiteralAccountInput;
