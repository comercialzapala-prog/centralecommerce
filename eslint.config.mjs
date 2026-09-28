import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      /**
       * Prefixo `_` marca parametro que existe por CONTRATO, nao por uso.
       *
       * O caso concreto e `useActionState`, que chama a action como
       * `(prevState, formData)`. Uma action que nao precisa de nenhum dos dois
       * ainda tem de declarar os dois para satisfazer o tipo. Sem esta regra, a
       * alternativa seria um `void _prev` decorativo em cada uma.
       *
       * A convencao `_prev` ja era usada nas actions do projeto; aqui ela passa a
       * valer de verdade em vez de depender de o segundo parametro ser usado.
       */
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
