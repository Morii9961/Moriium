import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';

/**
 * One Expressive Code configuration for every renderer.
 *
 * The public build (`astro.config.mjs`) and the private renderer used for
 * protected posts (`scripts/lib/render-markdown.mjs`) both read this, so a code
 * block cannot come out looking like two different products depending on which
 * path rendered it.
 *
 * The two GitHub themes stay: they supply the syntax token colours, which are
 * the one part of a code block that has to be a real palette rather than a
 * site token. Everything the block is made of around those tokens — its
 * surface, border, gutter, tab bar, type and padding — is bound to Moriium's
 * own custom properties, so a code block follows the site into dark mode with
 * the rest of the page instead of carrying GitHub's chrome into it.
 */
export const expressiveCodeOptions = {
  plugins: [pluginLineNumbers(), pluginCollapsibleSections()],
  defaultProps: { wrap: true, showLineNumbers: false },
  themes: ['github-light', 'github-dark'],
  themeCssSelector: (theme) =>
    theme.name === 'github-dark' ? '[data-theme="dark"]' : '[data-theme="light"]',
  // The page already owns its scrollbars and its selection colour; letting the
  // theme restate them is how a code block starts looking pasted in.
  useThemedScrollbars: false,
  useThemedSelectionColors: false,
  styleOverrides: {
    borderColor: 'var(--line)',
    borderRadius: '0',
    borderWidth: '1px',
    codeBackground: 'var(--surface-raised)',
    codeFontFamily: 'var(--font-data)',
    codeFontSize: '0.82rem',
    codeLineHeight: '1.7',
    codePaddingBlock: '1rem',
    codePaddingInline: '1.1rem',
    focusBorder: 'var(--focus)',
    uiFontFamily: 'var(--font-data)',
    uiFontSize: '0.66rem',
    uiPaddingBlock: '0.4rem',
    uiPaddingInline: '0.9rem',
    frames: {
      // A code block is part of the article, not a window floating over it.
      frameBoxShadowCssValue: 'none',
      editorBackground: 'var(--surface-raised)',
      editorActiveTabBackground: 'var(--surface-raised)',
      editorActiveTabForeground: 'var(--ink)',
      editorActiveTabBorderColor: 'var(--line)',
      // GitHub marks the open tab with its own orange. This is the one place a
      // code block gets to say whose site it is on.
      editorActiveTabIndicatorTopColor: 'var(--accent-field)',
      editorActiveTabIndicatorBottomColor: 'transparent',
      // Same weight as the mark above an article heading and the bar under the
      // site header, so the accent reads as one recurring gesture.
      editorActiveTabIndicatorHeight: '3px',
      editorTabBarBackground: 'var(--surface)',
      editorTabBarBorderColor: 'var(--line)',
      editorTabBarBorderBottomColor: 'var(--line)',
      editorTabBorderRadius: '0',
      terminalBackground: 'var(--surface-raised)',
      terminalTitlebarBackground: 'var(--surface)',
      terminalTitlebarForeground: 'var(--ink-muted)',
      terminalTitlebarBorderBottomColor: 'var(--line)',
      terminalTitlebarDotsForeground: 'var(--ink-faint)',
      inlineButtonForeground: 'var(--ink)',
      inlineButtonBackground: 'var(--ink)',
      inlineButtonBorder: 'var(--line)',
      tooltipSuccessBackground: 'var(--accent-field)',
      tooltipSuccessForeground: 'var(--accent-field-ink)',
    },
    lineNumbers: {
      foreground: 'var(--ink-faint)',
    },
  },
};
