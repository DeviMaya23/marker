package domain

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNormalizeURL_SameKey(t *testing.T) {
	cases := []struct{ name, a, b string }{
		{"scheme, host case, trailing slash", "http://Example.com/a/", "https://example.com/a"},
		{"root slash", "https://example.com/", "https://example.com"},
		{"tracking params removed", "https://example.com/a?utm_source=x&utm_medium=y&fbclid=1", "https://example.com/a"},
		{"all listed tracking params", "https://e.com/?gclid=1&dclid=2&msclkid=3&yclid=4&mc_cid=5&mc_eid=6&igshid=7", "https://e.com"},
		{"other params kept, order ignored", "https://e.com/a?b=2&a=1", "https://e.com/a?a=1&b=2"},
		{"repeated values sorted", "https://e.com/a?a=2&a=1", "https://e.com/a?a=1&a=2"},
		{"fragment ignored", "https://e.com/a#top", "https://e.com/a"},
		{"tracking mixed with real param", "https://e.com/a?utm_x=1&id=7", "https://e.com/a?id=7"},
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

func TestNormalizeURL_DifferentKey(t *testing.T) {
	cases := []struct{ name, a, b string }{
		{"different path", "https://e.com/a", "https://e.com/b"},
		{"different param value", "https://e.com/a?id=1", "https://e.com/a?id=2"},
		{"different param name", "https://e.com/a?id=1", "https://e.com/a?pid=1"},
		{"param present vs absent", "https://e.com/a?id=1", "https://e.com/a"},
		{"different host", "https://e.com/a", "https://www.e.com/a"},
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

func TestNormalizeURL_Invalid(t *testing.T) {
	for _, raw := range []string{"ftp://x", "javascript:x", "not a url", "", "https://", "http://%zz"} {
		_, err := NormalizeURL(raw)
		require.ErrorIs(t, err, ErrInvalidURL, raw)
	}
}
