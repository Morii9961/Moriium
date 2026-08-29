// tsc does not compile single-file components; vue-tsc is not part of this
// spike. The shim keeps `pnpm -C prototypes check` honest about everything it
// can check, instead of failing on an import it was never going to resolve.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

/** Vite resolves the stylesheet; tsc only needs to know the import is legal. */
declare module '*.css';
