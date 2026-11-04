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

  it('does not report BEM class names with __ and --', async () => {
    const result = await lint('.block__element--modifier { color: red; }\n.a__b { color: red; }\n.a--b { color: red; }')
    expect(result.results[0].warnings).toEqual([])
  })
})
