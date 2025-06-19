module.exports = {
  env: {
    es2021: true,
    node: true
  },
  extends: [
    "standard",
    "eslint:recommended",
    "plugin:vue/recommended",
    "plugin:prettier/recommended"
  ],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  globals: {
    Bot: true,
    redis: true,
    logger: true,
    plugin: true,
    Renderer: true,
    segment: true
  },
  rules: {
    eqeqeq: ["off"],
    "prefer-const": ["off"],
    "arrow-body-style": "off",
    camelcase: "off",
    "new-cap": "off",
    "no-unused-vars": "off",
    semi: ["error", "never"]
  }
}
