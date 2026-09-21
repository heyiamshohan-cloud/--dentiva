import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const globals={console:'readonly',process:'readonly',Buffer:'readonly',URL:'readonly',Response:'readonly',NodeJS:'readonly',window:'readonly',document:'readonly',performance:'readonly',setTimeout:'readonly',clearTimeout:'readonly'};

export default tseslint.config(
  {ignores:['build/**','dist/**','coverage/**','node_modules/**']},
  eslint.configs.recommended,
  {files:['**/*.{js,mjs,cjs}'],languageOptions:{globals},rules:{'no-empty':['error',{allowEmptyCatch:true}]}},
  ...tseslint.configs.recommended,
  {
    files:['**/*.{ts,tsx}'],
    languageOptions:{globals},
    plugins:{'react-hooks':reactHooks,'react-refresh':reactRefresh},
    rules:{
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components':'off',
      '@typescript-eslint/no-explicit-any':'error',
      '@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}],
      'no-control-regex':'off',
      'no-empty':['error',{allowEmptyCatch:true}]
    }
  }
);
