/**
 * The bookmarklet's `javascript:` URL. Run on any page, it opens the save popup at `origin`
 * with that page's URL and title. The origin is baked in as an escaped string literal; the
 * code carries no secret or user data, and no `noopener`, so the popup can close itself.
 */
export function bookmarkletHref(origin: string): string {
  const code =
    `(function(){var u=encodeURIComponent(location.href),t=encodeURIComponent(document.title);` +
    `window.open(${JSON.stringify(origin)}+'/save?url='+u+'&title='+t,'save-bookmark','width=480,height=420');})();`
  return `javascript:${code}`
}
