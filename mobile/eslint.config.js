const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
// React Native rejects raw JSX text, including a same-line space between
// expressions. Web rendering and TypeScript both accept that invalid child.
const nativeText = {
  meta: { type: "problem", schema: [], messages: { raw: "Wrap native text in <Text>; remove whitespace between JSX expressions." } },
  create(context) {
    return {
      JSXText(node) {
        if (!node.value.trim() && (!node.value.length || /[\r\n]/.test(node.value))) return;
        let parent = node.parent;
        while (parent?.type === "JSXFragment") parent = parent.parent;
        const tag = parent?.type === "JSXElement" ? context.sourceCode.getText(parent.openingElement.name) : "";
        if (!/(^|\.)Text$/.test(tag)) context.report({ node, messageId: "raw" });
      },
    };
  },
};
module.exports = defineConfig([
  expoConfig,
  { ignores: ["dist/**", ".expo/**"] },
  {
    plugins: { "himoto-native": { rules: { "text-children": nativeText } } },
    rules: {
      "himoto-native/text-children": "error",
      "react-hooks/exhaustive-deps": "error",
      "@typescript-eslint/no-unused-vars": "error",
    },
  },
]);
