export default {
  semi: false,
  printWidth: 100,
  arrowParens: "avoid",
  overrides: [
    {
      files: "*.js",
      options: { parser: "babel" }
    }
  ]
}