// Commit messages: "<type>: <subject>", e.g. "post: 다시 키보드를 잡으며". The types are listed in the README;
// no conventional-commits preset, whose feat/fix types and English-case rules don't fit a blog.
export default {
  rules: {
    'type-enum': [2, 'always', ['post', 'edit', 'draft', 'site']],
    'type-empty': [2, 'never'],
    'type-case': [2, 'always', 'lower-case'],
    'subject-empty': [2, 'never'],
    'header-max-length': [2, 'always', 100],
  },
}
