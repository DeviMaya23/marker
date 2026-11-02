package adaptor

import (
	"testing"
	"unicode/utf8"

	"github.com/stretchr/testify/require"
)

// Verifier edge cases: bytes PostgreSQL text rejects must never reach the title.

func TestExtractPage_EdgeNULInTitleAndOGTitle(t *testing.T) {
	p := extract(t, "<head><title>a\x00b</title></head>")
	require.NotContains(t, p.Title, "\x00")
	require.True(t, utf8.ValidString(p.Title))

	p = extract(t, "<head><meta property=\"og:title\" content=\"x\x00y\xff\"></head>")
	require.NotContains(t, p.Title, "\x00")
	require.True(t, utf8.ValidString(p.Title))
}

func TestExtractPage_EdgeTextHoldsNoMarkup(t *testing.T) {
	p := extract(t, `<body><p>&lt;script&gt;alert(1)&lt;/script&gt;</p></body>`)
	require.Equal(t, "<script>alert(1)</script>", p.Text, "entities decode to text; the frontend must render it as text (convention 3)")
}
