package adaptor

import (
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"golang.org/x/text/encoding/charmap"
)

func mustURL(t *testing.T, s string) *url.URL {
	t.Helper()
	u, err := url.Parse(s)
	require.NoError(t, err)
	return u
}

func extract(t *testing.T, doc string) ExtractedPage {
	t.Helper()
	p, err := ExtractPage([]byte(doc), mustURL(t, "https://example.com/dir/page"))
	require.NoError(t, err)
	return p
}

func TestExtractPage_Text(t *testing.T) {
	p := extract(t, `<html><head><title>T</title><style>.x{color:red}</style><script>var secret=1</script></head>
<body>
<header>site header</header><nav>menu items</nav>
<main><h1>Hello</h1><p>  some   text
 here </p><noscript>enable js</noscript><template>tmpl</template>
<svg><text>svgtext</text></svg><iframe>frame</iframe></main>
<aside>sidebar</aside><footer>copyright</footer>
<script>alert(1)</script></body></html>`)

	require.Equal(t, "Hello some text here", p.Text)
	for _, gone := range []string{"secret", "color", "menu", "header", "enable js", "tmpl", "svgtext", "frame", "sidebar", "copyright", "alert"} {
		require.NotContains(t, p.Text, gone)
	}
}

func TestExtractPage_TextIsPlain(t *testing.T) {
	p := extract(t, `<body><p>a &lt;b&gt; &amp; c</p><p><b>bold</b> it</p></body>`)
	require.Equal(t, "a <b> & c bold it", p.Text)
}

func TestExtractPage_Title(t *testing.T) {
	cases := []struct{ name, doc, want string }{
		{"title", `<head><title>  My
   Page </title><meta property="og:title" content="OG"></head>`, "My Page"},
		{"og fallback", `<head><meta property="og:title" content="  OG   Title "></head><body>x</body>`, "OG Title"},
		{"empty title falls back to og", `<head><title> </title><meta property="og:title" content="OG"></head>`, "OG"},
		{"first title wins", `<head><title>One</title></head><body><title>Two</title></body>`, "One"},
		{"none", `<body>x</body>`, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			require.Equal(t, c.want, extract(t, c.doc).Title)
		})
	}
}

func TestExtractPage_TitleNotInText(t *testing.T) {
	require.Equal(t, "body", extract(t, `<head><title>Head Title</title></head><body>body</body>`).Text)
}

func TestExtractPage_Favicon(t *testing.T) {
	cases := []struct{ name, doc, want string }{
		{"relative", `<head><link rel="icon" href="img/f.png"></head>`, "https://example.com/dir/img/f.png"},
		{"root relative", `<head><link rel="icon" href="/f.png"></head>`, "https://example.com/f.png"},
		{"absolute", `<head><link rel="icon" href="https://cdn.example.net/f.ico"></head>`, "https://cdn.example.net/f.ico"},
		{"scheme relative", `<head><link rel="icon" href="//cdn.example.net/f.ico"></head>`, "https://cdn.example.net/f.ico"},
		{"shortcut icon token", `<head><link rel="Shortcut ICON" href="/s.ico"></head>`, "https://example.com/s.ico"},
		{"first icon wins", `<head><link rel="stylesheet" href="/a.css"><link rel="icon" href="/1.png"><link rel="icon" href="/2.png"></head>`, "https://example.com/1.png"},
		{"icon without href is skipped", `<head><link rel="icon"><link rel="icon" href="/2.png"></head>`, "https://example.com/2.png"},
		{"fallback", `<head><link rel="stylesheet" href="/a.css"></head>`, "https://example.com/favicon.ico"},
		{"not an icon token", `<head><link rel="apple-touch-icon" href="/a.png"></head>`, "https://example.com/favicon.ico"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			require.Equal(t, c.want, extract(t, c.doc).FaviconURL)
		})
	}
}

func TestExtractPage_FaviconFallbackUsesOrigin(t *testing.T) {
	p, err := ExtractPage([]byte(`<body>x</body>`), mustURL(t, "http://Example.com:8080/a/b?q=1#f"))
	require.NoError(t, err)
	require.Equal(t, "http://Example.com:8080/favicon.ico", p.FaviconURL)
}

func TestExtractPage_NonUTF8(t *testing.T) {
	enc := charmap.ISO8859_1.NewEncoder()
	body, err := enc.String(`<html><head><meta charset="iso-8859-1"><title>Café</title></head><body>Crème brûlée</body></html>`)
	require.NoError(t, err)
	require.NotContains(t, body, "é") // really encoded as Latin-1, not UTF-8

	p, err := ExtractPage([]byte(body), mustURL(t, "https://example.com/"))
	require.NoError(t, err)
	require.Equal(t, "Café", p.Title)
	require.Equal(t, "Crème brûlée", p.Text)
}

func TestExtractPage_StripsNULAndInvalidUTF8(t *testing.T) {
	p := extract(t, "<body>a\x00b\xffc</body>")
	require.NotContains(t, p.Text, "\x00")
	require.True(t, strings.Contains(p.Text, "a") && strings.Contains(p.Text, "c"))
}

func TestExtractPage_InlineMarkupDoesNotSplitWords(t *testing.T) {
	cases := []struct{ name, doc, want string }{
		{"bold inside a word", `<body><b>Hel</b>lo</body>`, "Hello"},
		{"punctuation in its own element", `<body>Hello<b>,</b> world</body>`, "Hello, world"},
		{"link in a sentence", `<body><p>See <a href="/x">this page</a>.</p></body>`, "See this page."},
		{"blocks are separated", `<body><div>one</div><div>two</div></body>`, "one two"},
		{"list items are separated", `<body><ul><li>a</li><li>b</li></ul></body>`, "a b"},
		{"table cells are separated", `<body><table><tr><td>a</td><td>b</td></tr></table></body>`, "a b"},
		{"line break separates", `<body>one<br>two</body>`, "one two"},
		{"headings and paragraphs", `<body><h1>Title</h1>text</body>`, "Title text"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			require.Equal(t, c.want, extract(t, c.doc).Text)
		})
	}
}

func TestExtractPage_SVGTitleIsNotThePageTitle(t *testing.T) {
	p := extract(t, `<body><svg><title>Icon</title></svg>text</body>`)
	require.Equal(t, "", p.Title)

	p = extract(t, `<head><title>Real</title></head><body><svg><title>Icon</title></svg></body>`)
	require.Equal(t, "Real", p.Title)

	p = extract(t, `<body><svg><title>Icon</title></svg></body><head><meta property="og:title" content="OG"></head>`)
	require.Equal(t, "OG", p.Title, "og:title is still the fallback")
}
