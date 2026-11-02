package adaptor

import (
	"bytes"
	"net/url"
	"strings"

	"golang.org/x/net/html"
	"golang.org/x/net/html/charset"
)

// ExtractedPage is what ExtractPage finds in an HTML document. Every field is plain
// text, never HTML.
type ExtractedPage struct {
	// Title is the first <title>, else og:title; empty if neither exists.
	Title string
	// Text is the visible text with whitespace runs collapsed to single spaces.
	Text string
	// FaviconURL is the absolute URL of the page's icon: the first <link> whose rel
	// has the token "icon", else /favicon.ico on the page's origin.
	FaviconURL string
}

// skippedElements hold no visible page text. head is skipped too: its <title> is read
// separately and nothing else in it is shown to a reader.
var skippedElements = map[string]bool{
	"script": true, "style": true, "noscript": true, "template": true, "svg": true,
	"iframe": true, "nav": true, "header": true, "footer": true, "aside": true,
	"head": true,
}

// ExtractPage decodes an HTML document (honouring a non-UTF-8 charset declared in the
// markup) and extracts its title, visible text and favicon URL. pageURL is the final
// URL of the page, used to resolve a relative icon link.
func ExtractPage(body []byte, pageURL *url.URL) (ExtractedPage, error) {
	r, err := charset.NewReader(bytes.NewReader(body), "text/html")
	if err != nil {
		return ExtractedPage{}, err
	}
	doc, err := html.Parse(r)
	if err != nil {
		return ExtractedPage{}, err
	}

	var m metadata
	m.collect(doc, pageURL)

	var text strings.Builder
	visibleText(doc, &text)

	title := clean(m.title)
	if title == "" {
		title = clean(m.ogTitle)
	}
	favicon := m.icon
	if favicon == "" {
		favicon = defaultFavicon(pageURL)
	}
	return ExtractedPage{
		Title:      title,
		Text:       clean(text.String()),
		FaviconURL: favicon,
	}, nil
}

// metadata is what the document head says about the page.
type metadata struct {
	title, ogTitle string
	haveTitle      bool
	icon           string
}

func (m *metadata) collect(n *html.Node, pageURL *url.URL) {
	if n.Type == html.ElementNode {
		switch n.Data {
		case "svg":
			// An <svg><title> names the graphic, not the page.
			return
		case "title":
			if !m.haveTitle {
				m.title, m.haveTitle = nodeText(n), true
			}
		case "meta":
			if m.ogTitle == "" && strings.EqualFold(attr(n, "property"), "og:title") {
				m.ogTitle = attr(n, "content")
			}
		case "link":
			if m.icon == "" && hasToken(attr(n, "rel"), "icon") {
				m.icon = resolveRef(pageURL, attr(n, "href"))
			}
		}
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		m.collect(c, pageURL)
	}
}

// blockElements break the text flow: a space goes around them so that "<p>a</p><p>b</p>"
// reads "a b". Any other element is inline and adds no space, so "<b>Hel</b>lo" stays one
// word.
var blockElements = map[string]bool{
	"address": true, "article": true, "blockquote": true, "br": true, "caption": true,
	"dd": true, "details": true, "dialog": true, "div": true, "dl": true, "dt": true,
	"fieldset": true, "figcaption": true, "figure": true, "form": true, "h1": true,
	"h2": true, "h3": true, "h4": true, "h5": true, "h6": true, "hr": true, "li": true,
	"main": true, "ol": true, "option": true, "p": true, "pre": true, "section": true,
	"summary": true, "table": true, "tbody": true, "td": true, "tfoot": true, "th": true,
	"thead": true, "tr": true, "ul": true,
}

// visibleText appends the text of every node outside the skipped elements.
func visibleText(n *html.Node, b *strings.Builder) {
	switch n.Type {
	case html.TextNode:
		b.WriteString(n.Data)
		return
	case html.ElementNode:
		if skippedElements[n.Data] {
			return
		}
		if blockElements[n.Data] {
			b.WriteByte(' ')
			defer b.WriteByte(' ')
		}
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		visibleText(c, b)
	}
}

func nodeText(n *html.Node) string {
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			b.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return b.String()
}

func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if strings.EqualFold(a.Key, key) {
			return a.Val
		}
	}
	return ""
}

func hasToken(list, token string) bool {
	for _, f := range strings.Fields(strings.ToLower(list)) {
		if f == token {
			return true
		}
	}
	return false
}

// resolveRef resolves a link against the page URL. It returns "" for an empty or
// unparseable reference.
func resolveRef(base *url.URL, ref string) string {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return ""
	}
	u, err := url.Parse(ref)
	if err != nil {
		return ""
	}
	return base.ResolveReference(u).String()
}

func defaultFavicon(page *url.URL) string {
	return (&url.URL{Scheme: page.Scheme, Host: page.Host, Path: "/favicon.ico"}).String()
}

// clean collapses whitespace runs to single spaces, trims, and makes the result safe
// to store: valid UTF-8 and no NUL bytes, which PostgreSQL text rejects.
func clean(s string) string {
	s = strings.ToValidUTF8(s, "")
	s = strings.ReplaceAll(s, "\x00", "")
	return strings.Join(strings.Fields(s), " ")
}
