// @vitest-environment node
import stylelint from 'stylelint'
import { describe, expect, it } from 'vitest'

const configFile = new URL('../../stylelint.config.js', import.meta.url).pathname

function lint(code: string) {
  return stylelint.lint({ code, configFile, codeFilename: 'inline.css' })
}

describe('stylelint configuration', () => {
  it('accepts a well-formed stylesheet with BEM selectors and tokens', async () => {
    const result = await lint(`
.bookmark-row__title:hover { color: var(--accent); }
.a--b { margin: var(--space-2) 0; }
`)
    expect(result.errored).toBe(false)
    expect(result.results[0].warnings).toEqual([])
  })

  it('reports an unclosed block as a syntax error', async () => {
    const result = await lint(`
.layout { display: grid;
.sidebar { width: 10px; }
.list { color: red; }
`)
    expect(result.errored).toBe(true)
    const warnings = result.results[0].warnings
    expect(warnings.map((w) => w.rule)).toContain('CssSyntaxError')
    expect(warnings.find((w) => w.rule === 'CssSyntaxError')?.severity).toBe('error')
  })

  it.each([
    ['a duplicate property', '.a { color: red; color: blue; }', 'declaration-block-no-duplicate-properties'],
    ['an unknown unit', '.a { width: 10pxx; }', 'declaration-property-value-no-unknown'],
    ['an empty rule', '.a { }', 'block-no-empty'],
  ])('reports %s', async (_name, code, rule) => {
    const result = await lint(code)
    expect(result.errored).toBe(true)
    expect(result.results[0].warnings.map((w) => w.rule)).toContain(rule)
  })

  it.each([
    ['a closing brace too many', '.a { color: red; }\n}\n'],
    ['an @media block that is never closed', '@media (min-width: 10px) {\n.a { color: red; }\n'],
  ])('reports %s as a syntax error', async (_name, code) => {
    const result = await lint(code)
    expect(result.errored).toBe(true)
    const syntax = result.results[0].warnings.find((w) => w.rule === 'CssSyntaxError')
    expect(syntax?.severity).toBe('error')
  })

  it.each([
    ['a comment that contains a brace', '/* a { */\n.a { color: red; }\n'],
    ['CSS nesting', '.a { color: red;\n  &:hover { color: blue; }\n}\n'],
    ['var() with a fallback', '.a { margin: var(--x, 10px); }\n'],
  ])('accepts %s', async (_name, code) => {
    const result = await lint(code)
    expect(result.errored).toBe(false)
    expect(result.results[0].warnings).toEqual([])
  })

  it('reports an @import after a rule', async () => {
    const result = await lint('.a { color: red; }\n@import "x.css";\n')
    expect(result.results[0].warnings.map((w) => w.rule)).toContain('no-invalid-position-at-import-rule')
  })

  it('does not report BEM class names with __ and --', async () => {
    const result = await lint('.block__element--modifier { color: red; }\n.a__b { color: red; }\n.a--b { color: red; }')
    expect(result.results[0].warnings).toEqual([])
  })
})
