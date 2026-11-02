package domain

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// Verifier edge cases beyond the task file's table: they pin current behavior.

func TestNormalizeURL_EdgeSameKey(t *testing.T) {
	cases := []struct{ name, a, b string }{
		{"uppercase scheme", "HTTPS://example.com/a", "https://example.com/a"},
		{"mixed-case scheme and host", "HtTp://EXAMPLE.com/a", "https://example.com/a"},
		{"empty query marker", "https://e.com/a?", "https://e.com/a"},
		{"empty query marker after slash", "https://e.com/a/?", "https://e.com/a"},
		{"only tracking params leave no marker", "https://e.com/a?utm_source=x", "https://e.com/a"},
		{"tracking name case", "https://e.com/a?UTM_Source=1&FBCLID=2", "https://e.com/a"},
		{"repeated key keeps both values", "https://e.com/a?b=1&a=2&b=0", "https://e.com/a?a=2&b=0&b=1"},
		{"several trailing slashes", "https://e.com/a///", "https://e.com/a"},
		{"plus and %20 are the same space", "https://e.com/a?q=a+b", "https://e.com/a?q=a%20b"},
		{"empty pairs ignored", "https://e.com/?a=1&&b=2", "https://e.com/?b=2&a=1"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			a, err := NormalizeURL(c.a)
			require.NoError(t, err)
			b, err := NormalizeURL(c.b)
			require.NoError(t, err)
			require.Equal(t, b, a)
		})
	}
}

func TestNormalizeURL_EdgeDifferentKey(t *testing.T) {
	cases := []struct{ name, a, b string }{
		{"explicit port differs", "https://e.com:8443/a", "https://e.com/a"},
		{"repeated value count matters", "https://e.com/a?b=1&b=1", "https://e.com/a?b=1"},
		{"path case matters", "https://e.com/A", "https://e.com/a"},
		{"a param that only starts like a tracker", "https://e.com/a?utm=1", "https://e.com/a"},
		{"key without value vs absent", "https://e.com/a?x", "https://e.com/a"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			a, err := NormalizeURL(c.a)
			require.NoError(t, err)
			b, err := NormalizeURL(c.b)
			require.NoError(t, err)
			require.NotEqual(t, b, a)
		})
	}
}

func TestNormalizeURL_EdgeKeepsOriginalSchemeOutOfKey(t *testing.T) {
	n, err := NormalizeURL("HTTP://Example.COM/a/?b=1#frag")
	require.NoError(t, err)
	require.Equal(t, "https://example.com/a?b=1", n)
}
