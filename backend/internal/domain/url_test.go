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
		{"default https port", "https://e.com:443/a", "https://e.com/a"},
		{"default http port", "http://e.com:80/a", "https://e.com/a"},
		{"default port across schemes", "http://e.com:80/a", "https://e.com:443/a"},
		{"equivalent query escapes", "https://e.com/a?q=a%20b", "https://e.com/a?q=a+b"},
		{"plus is the same space as %20", "https://e.com/a?q=a+b", "https://e.com/a?q=a%20b"},
		{"uppercase scheme", "HTTPS://example.com/a", "https://example.com/a"},
		{"mixed-case scheme and host", "HtTp://EXAMPLE.com/a", "https://example.com/a"},
		{"empty query marker", "https://e.com/a?", "https://e.com/a"},
		{"empty query marker after slash", "https://e.com/a/?", "https://e.com/a"},
		{"only tracking params leave no marker", "https://e.com/a?utm_source=x", "https://e.com/a"},
		{"tracking name case", "https://e.com/a?UTM_Source=1&FBCLID=2", "https://e.com/a"},
		{"repeated key keeps both values, sorted", "https://e.com/a?b=1&a=2&b=0", "https://e.com/a?a=2&b=0&b=1"},
		{"several trailing slashes", "https://e.com/a///", "https://e.com/a"},
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

func TestNormalizeURL_DifferentKey(t *testing.T) {
	cases := []struct{ name, a, b string }{
		{"different path", "https://e.com/a", "https://e.com/b"},
		{"different param value", "https://e.com/a?id=1", "https://e.com/a?id=2"},
		{"different param name", "https://e.com/a?id=1", "https://e.com/a?pid=1"},
		{"param present vs absent", "https://e.com/a?id=1", "https://e.com/a"},
		{"different host", "https://e.com/a", "https://www.e.com/a"},
		{"non-default port", "https://e.com:8443/a", "https://e.com/a"},
		{"http on 443 is not default", "http://e.com:443/a", "https://e.com/a"},
		{"semicolon in a value", "https://e.com/a?a=1;b=2", "https://e.com/a?a=3;b=4"},
		{"semicolon query vs none", "https://e.com/a?a=1;b=2", "https://e.com/a"},
		{"bad escape vs none", "https://e.com/a?q=%zz", "https://e.com/a"},
		{"different bad escapes", "https://e.com/a?q=%zz", "https://e.com/a?q=%yy"},
		{"encoded trailing slash", "https://e.com/a%2F", "https://e.com/a"},
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

func TestNormalizeURL_Invalid(t *testing.T) {
	for _, raw := range []string{"ftp://x", "javascript:x", "not a url", "", "https://", "http://%zz"} {
		_, err := NormalizeURL(raw)
		require.ErrorIs(t, err, ErrInvalidURL, raw)
	}
}

// ExactKey pins the stored key itself, not only which URLs agree: the rewrite of the
// query string must not change the key of an ordinary URL.
func TestNormalizeURL_ExactKey(t *testing.T) {
	cases := []struct{ name, in, want string }{
		{"scheme, host, slash, query and fragment", "HTTP://Example.COM/a/?b=1#frag", "https://example.com/a?b=1"},
		{"IPv6 literal with default port", "http://[::1]:80/a/", "https://[::1]/a"},
		{"IPv6 literal with other port", "https://[2001:db8::1]:8443/a", "https://[2001:db8::1]:8443/a"},
		{"userinfo kept", "https://u:p@E.com:443/a", "https://u:p@e.com/a"},
		{"key without value equals empty value", "https://e.com/a?flag", "https://e.com/a?flag="},
		{"empty pairs dropped", "https://e.com/a?&&b=1&", "https://e.com/a?b=1"},
		{"tracking removed next to a bad escape", "https://e.com/a?utm_x=1&q=%zz", "https://e.com/a?q=%zz"},
		{"tracking name is case-insensitive", "https://e.com/a?UTM_x=1", "https://e.com/a"},
		{"encoded tracking key still removed", "https://e.com/a?utm%5Fx=1&id=2", "https://e.com/a?id=2"},
		{"root path", "https://e.com/", "https://e.com"},
		{"plus stays a plus", "https://e.com/a?q=a+b", "https://e.com/a?q=a+b"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := NormalizeURL(c.in)
			require.NoError(t, err)
			require.Equal(t, c.want, got)
		})
	}
}
